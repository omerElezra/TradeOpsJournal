"""
Daily ingestion: Gmail → parse IBKR CSV → upsert to Supabase.

Designed to run as a GitHub Actions cron job (Mon–Fri at 08:00 UTC).
Safe to run multiple times — upsert on trade_id prevents duplicates.
"""

import base64
import hashlib
import io
import math
import os
import sys
from datetime import date, timedelta

import pandas as pd
from dotenv import load_dotenv
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from supabase import create_client

load_dotenv()

GMAIL_SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

IBKR_SENDER = "Info@inter-il.com"
IBKR_SUBJECT = "Activity Flex"


def build_gmail_client():
    creds = Credentials(
        token=None,
        refresh_token=os.environ["GMAIL_REFRESH_TOKEN"],
        client_id=os.environ["GMAIL_CLIENT_ID"],
        client_secret=os.environ["GMAIL_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=GMAIL_SCOPES,
    )
    creds.refresh(Request())
    return build("gmail", "v1", credentials=creds)


def find_ibkr_emails(service, days_back=2):
    """
    Return ALL message IDs matching the IBKR query, paginating through results.
    Gmail API returns max 500 per page; we follow nextPageToken until exhausted.
    """
    query = f"from:{IBKR_SENDER} subject:{IBKR_SUBJECT} has:attachment newer_than:{days_back}d"
    messages = []
    page_token = None
    page = 0

    while True:
        page += 1
        kwargs = {"userId": "me", "q": query, "maxResults": 500}
        if page_token:
            kwargs["pageToken"] = page_token

        result = service.users().messages().list(**kwargs).execute()
        batch  = result.get("messages", [])
        messages.extend(batch)
        print(f"  Gmail page {page}: {len(batch)} message(s) found (total so far: {len(messages)})")

        page_token = result.get("nextPageToken")
        if not page_token:
            break

    return messages


def download_csv_attachment(service, message_id):
    """Download the first CSV attachment from a Gmail message."""
    msg = service.users().messages().get(userId="me", id=message_id, format="full").execute()
    parts = msg.get("payload", {}).get("parts", [])

    for part in parts:
        filename = part.get("filename", "")
        mime = part.get("mimeType", "")
        if not filename.lower().endswith(".csv") and "csv" not in mime:
            continue

        body = part.get("body", {})
        attachment_id = body.get("attachmentId")
        if attachment_id:
            att = service.users().messages().attachments().get(
                userId="me", messageId=message_id, id=attachment_id
            ).execute()
            data = base64.urlsafe_b64decode(att["data"])
        else:
            data = base64.urlsafe_b64decode(body.get("data", ""))

        return filename, io.BytesIO(data)

    return None, None


import csv as _csv


def _decode_csv(csv_bytes):
    """Decode raw CSV bytes, trying the encodings IBKR is known to use."""
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            csv_bytes.seek(0)
            return csv_bytes.read().decode(encoding)
        except UnicodeDecodeError:
            continue
    csv_bytes.seek(0)
    return csv_bytes.read().decode("utf-8", errors="replace")


def extract_section(csv_bytes, section_code):
    """
    Parse a multi-section IBKR Flex CSV and return one section's DATA rows as a
    DataFrame, using that section's HEADER row to name the columns.

    Every line in the new template looks like:
        "HEADER","TRNT","ClientAccountID","CurrencyPrimary",...   ← column names
        "DATA","TRNT","U21588075","USD",...                       ← values
    Field 0 is the record type (HEADER/DATA), field 1 is the section code
    (TRNT, CRTT, CTRN, IACC, ...). We keep only rows for `section_code`, take
    column names from its HEADER row, and align DATA rows to them.

    Returns an empty DataFrame if the section is absent (e.g. a legacy export).
    """
    text   = _decode_csv(csv_bytes)
    reader = _csv.reader(io.StringIO(text))
    header = None
    rows   = []

    for fields in reader:
        if len(fields) < 2:
            continue
        rectype, section = fields[0].strip(), fields[1].strip()
        if section != section_code:
            continue
        if rectype == "HEADER":
            header = [c.strip() for c in fields[2:]]
        elif rectype == "DATA" and header is not None:
            values = fields[2:]
            # Pad short / truncate long rows so they line up with the header
            if len(values) < len(header):
                values += [""] * (len(header) - len(values))
            rows.append(values[: len(header)])

    if header is None or not rows:
        return pd.DataFrame()

    return pd.DataFrame(rows, columns=header, dtype=str)


def _read_flat(csv_bytes):
    """
    Legacy single-section parser: treat row 0 as the column header.

    Kept as a fallback so historical (pre-template-change) emails still ingest
    during backfills. New exports use the multi-section format handled above.
    """
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            csv_bytes.seek(0)
            return pd.read_csv(
                csv_bytes, header=0, dtype=str,
                on_bad_lines="skip", encoding=encoding,
            )
        except UnicodeDecodeError:
            continue
    return pd.DataFrame()


def _read_executions(csv_bytes, asset_class):
    """
    Return EXECUTION rows for the given AssetClass from the TRNT section.

    Prefers the new multi-section template; falls back to the legacy flat
    layout when no TRNT section is present.
    """
    section = extract_section(csv_bytes, "TRNT")
    if section.empty:
        section = _read_flat(csv_bytes)

    if "LevelOfDetail" not in section.columns or "AssetClass" not in section.columns:
        if asset_class == "STK":
            print("  Unexpected CSV format — LevelOfDetail/AssetClass not found.")
            print(f"  Columns found: {list(section.columns)}")
        return pd.DataFrame()

    return section[
        (section["LevelOfDetail"].str.strip() == "EXECUTION") &
        (section["AssetClass"].str.strip() == asset_class)
    ].copy()


def parse_ibkr_csv(csv_bytes):
    """Extract STK EXECUTION rows (stock trades) from the Flex export."""
    executions = _read_executions(csv_bytes, "STK")
    if executions.empty:
        print("  No EXECUTION rows found for STK.")
    return executions


FLEX_DT_FORMAT = "%m/%d/%Y,%H:%M:%S"
FLEX_DT_FORMAT_DAYFIRST = "%d/%m/%Y,%H:%M:%S"
# Regex to strip timezone suffix e.g. " EDT", " EST", " UTC" from IBKR timestamps
import re
_TZ_SUFFIX = re.compile(r"\s+[A-Z]{2,4}$")


def parse_flex_dt(series):
    """
    Parse IBKR Flex datetime string → datetime.

    IBKR exports use two date formats depending on account locale:
      - DD/MM/YYYY,HH:MM:SS TZ   (with timezone suffix like EDT/EST → day-first)
      - MM/DD/YYYY,HH:MM:SS      (US format, no timezone suffix → month-first)

    We detect per-value: if a timezone suffix is present the date portion
    is day-first; otherwise it is month-first.
    """
    cleaned = series.str.strip()
    has_tz = cleaned.str.contains(_TZ_SUFFIX, na=False)

    # Strip timezone suffix from all values
    stripped = cleaned.str.replace(_TZ_SUFFIX, "", regex=True)

    result = pd.Series(pd.NaT, index=series.index)

    # DD/MM/YYYY for entries WITH timezone suffix (e.g. "02/10/2025,15:36:33 EDT")
    if has_tz.any():
        result[has_tz] = pd.to_datetime(
            stripped[has_tz], format=FLEX_DT_FORMAT_DAYFIRST, errors="coerce"
        )

    # MM/DD/YYYY for entries WITHOUT timezone suffix (e.g. "11/26/2025,11:53:35")
    if (~has_tz).any():
        result[~has_tz] = pd.to_datetime(
            stripped[~has_tz], format=FLEX_DT_FORMAT, errors="coerce"
        )

    return result


def sanitize_records(records):
    """Replace float NaN / inf with None so JSON serialization never fails."""
    import math
    clean = []
    for r in records:
        clean.append({
            k: (None if isinstance(v, float) and (math.isnan(v) or math.isinf(v)) else v)
            for k, v in r.items()
        })
    return clean


def make_trade_id(row):
    """Use IBKR TradeID when available, else hash exec_time + symbol + qty + price."""
    if row.get("ibkr_trade_id") and str(row["ibkr_trade_id"]).strip():
        return str(row["ibkr_trade_id"]).strip()
    key = f"{row.get('exec_time','')}|{row['symbol']}|{row['quantity']}|{row['price']}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def canon_num(x):
    """
    Canonical number string shared by ingest.py and the frontend manual API.
    Whole numbers render without a decimal (100.0 -> "100"); others use the
    shortest round-trip form (213.5 -> "213.5"), matching JS String(Number).
    """
    try:
        f = float(x)
    except (TypeError, ValueError):
        return ""
    if pd.isna(f):
        return ""
    return str(int(f)) if f.is_integer() else repr(f)


def make_trade_content_hash(row):
    """Cross-path dedup fingerprint — MUST match tradeContentHash() in frontend/lib/hash.ts."""
    key = f"{row.get('exec_time','')}|{row['symbol']}|{canon_num(row['quantity'])}|{canon_num(row['price'])}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def make_cash_content_hash(row):
    """Cross-path dedup fingerprint — MUST match cashContentHash() in frontend/lib/hash.ts."""
    rate = row.get("rate")
    rate_str = canon_num(rate) if rate is not None and not pd.isna(rate) else "0"
    key = f"{row.get('exec_time','')}|{row['symbol']}|{canon_num(row['quantity'])}|{rate_str}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


# ── Cash / FX transactions ─────────────────────────────────────────────────────

def parse_cash_csv(csv_bytes):
    """
    Extract CASH asset class EXECUTION rows (currency conversions & FX deposits).

    These live in the same TRNT section as STK trades but have
    AssetClass == 'CASH'. Examples: USD.ILS, ILS.USD conversions when
    depositing or withdrawing local-currency funds.
    """
    return _read_executions(csv_bytes, "CASH")


def transform_cash(cash_rows):
    """
    Map CASH EXECUTION rows → cash_transactions schema.

    Covers:
      - FX conversions  (Symbol: USD.ILS, ILS.USD, etc.)
      - Any other cash EXECUTION rows present in the Flex export
    """
    if cash_rows.empty:
        return []

    def col(name):
        return cash_rows[name].str.strip() if name in cash_rows.columns else pd.Series(
            [""] * len(cash_rows), index=cash_rows.index
        )

    df = pd.DataFrame(index=cash_rows.index)
    df["symbol"]          = col("Symbol")       # e.g. USD.ILS
    df["description"]     = col("Description")
    df["ibkr_trade_id"]   = col("TradeID")
    df["action"]          = col("Buy/Sell")      # BUY / SELL
    df["currency"]        = col("CurrencyPrimary")

    # Use DateTime as primary timestamp; fall back to OrderTime if missing
    exec_dt  = parse_flex_dt(col("DateTime"))
    order_dt = parse_flex_dt(col("OrderTime"))
    ts       = exec_dt.combine_first(order_dt)

    df["transaction_date"] = ts.dt.date.astype(str)
    df["exec_time"]       = ts.dt.strftime("%Y-%m-%dT%H:%M:%S")

    df["quantity"]  = pd.to_numeric(col("Quantity"),    errors="coerce").abs()
    df["rate"]      = pd.to_numeric(col("TradePrice"),  errors="coerce")   # FX rate
    raw_net         = pd.to_numeric(col("NetCash"),     errors="coerce")
    # IBKR leaves NetCash blank/zero for FX CASH rows — compute from qty × rate
    computed_net    = df["quantity"] * df["rate"]
    df["net_cash"]  = raw_net.where(raw_net.notna() & (raw_net != 0), computed_net)
    df["commission"]= pd.to_numeric(col("IBCommission"),errors="coerce")

    df.dropna(subset=["symbol", "transaction_date", "quantity"], inplace=True)
    df.sort_values("exec_time", inplace=True)

    # Stable dedup key — prefer IBKR TradeID
    def make_cash_id(row):
        if row.get("ibkr_trade_id") and str(row["ibkr_trade_id"]).strip():
            return f"cash_{row['ibkr_trade_id'].strip()}"
        key = f"cash|{row['exec_time']}|{row['symbol']}|{row['quantity']}"
        return "cash_" + hashlib.sha256(key.encode()).hexdigest()[:28]

    df["transaction_id"] = df.apply(make_cash_id, axis=1)
    df["content_hash"]   = df.apply(make_cash_content_hash, axis=1)
    df["source"]         = "ibkr"
    df.drop(columns=["ibkr_trade_id"], inplace=True)

    return df.to_dict(orient="records")


def check_existing_cash_ids(client, ids):
    if not ids:
        return set()
    return _select_in_chunks(client, "cash_transactions", "transaction_id", ids)


def merge_manual_cash(client, records):
    """
    For any incoming record whose content_hash already exists with source='manual',
    update that row with the IBKR transaction_id and flip source to 'ibkr'. This
    absorbs a manually-entered row when the matching IBKR CSV row arrives later,
    instead of inserting a duplicate. Returns the records that still need insert.
    """
    if not records:
        return []
    hashes = [r["content_hash"] for r in records]
    # Consume each manual hash only once (see merge_manual_trades).
    remaining = _select_in_chunks(client, "cash_transactions", "content_hash", hashes, {"source": "manual"})
    if not remaining:
        return records

    # transaction_ids already present must not be re-keyed onto a manual row
    # (unique constraint). Treat them as duplicates for the upsert instead.
    present_ids = _select_in_chunks(
        client, "cash_transactions", "transaction_id", [r["transaction_id"] for r in records]
    )

    to_insert = []
    for r in records:
        h = r["content_hash"]
        if h in remaining and r["transaction_id"] not in present_ids:
            remaining.discard(h)
            update = {"transaction_id": r["transaction_id"], "source": "ibkr"}
            for k in ("commission", "net_cash", "rate", "description"):
                if _present(r.get(k)):
                    update[k] = r.get(k)
            client.table("cash_transactions").update(update).eq("content_hash", h).eq("source", "manual").execute()
        else:
            to_insert.append(r)
    return to_insert


def upsert_cash_to_supabase(client, records):
    if not records:
        return 0
    new_records = merge_manual_cash(client, records)
    if new_records:
        client.table("cash_transactions").upsert(sanitize_records(new_records), on_conflict="transaction_id").execute()
    return len(new_records)


# ── Supabase query helpers ──────────────────────────────────────────────────────

def _present(v):
    """True unless the value is None or a float NaN (treat both as 'no value')."""
    return v is not None and not (isinstance(v, float) and math.isnan(v))


def _select_in_chunks(client, table, column, values, extra_eq=None, chunk=100):
    """
    Run `select(column).in_(column, values)` in batches and return the set of
    matched values. A single .in_() with hundreds of values overflows the GET
    request URL (PostgREST 400), so we page through in chunks — important for
    large backfills (e.g. a full-year Flex export with 900+ trades).
    """
    found = set()
    uniq = list({v for v in values if v})
    for i in range(0, len(uniq), chunk):
        batch = uniq[i:i + chunk]
        q = client.table(table).select(column).in_(column, batch)
        for k, v in (extra_eq or {}).items():
            q = q.eq(k, v)
        res = q.execute()
        found.update(row[column] for row in res.data)
    return found


# ── Dry-run helpers ─────────────────────────────────────────────────────────────

def _manual_hashes(client, table, records):
    """Return the content_hashes among `records` that already exist as manual rows.

    Lets the dry run flag rows that would MERGE into a manual entry (update,
    not insert) rather than be reported as brand-new inserts.
    """
    hashes = [r["content_hash"] for r in records if r.get("content_hash")]
    if not hashes:
        return set()
    return _select_in_chunks(client, table, "content_hash", hashes, {"source": "manual"})


def _row_status(rec, id_field, existing_ids, manual_hashes, dry_run):
    """Classify one record: DUPLICATE (by id), MERGE (manual content_hash), or NEW."""
    if rec[id_field] in existing_ids:
        return "DUPLICATE (skip)"
    if rec.get("content_hash") in manual_hashes:
        return "MERGE manual (would update)" if dry_run else "MERGE manual→ibkr"
    return "NEW → would insert" if dry_run else "NEW → inserted"


def report_missing(records, required, label):
    """Print any rows missing a value in one of the `required` fields. Returns the gaps."""
    import math
    gaps_found = []
    for i, r in enumerate(records, 1):
        gaps = [
            f for f in required
            if r.get(f) in (None, "", "NaT")
            or (isinstance(r.get(f), float) and math.isnan(r.get(f)))
        ]
        if gaps:
            gaps_found.append((i, gaps))
    if gaps_found:
        print(f"  ⚠ {label}: {len(gaps_found)} row(s) missing required field(s):")
        for i, gaps in gaps_found[:25]:
            print(f"      row {i}: missing {gaps}")
    else:
        print(f"  ✓ {label}: all required fields present")
    return gaps_found


def print_cash_table(records, existing_ids, manual_hashes=frozenset(), dry_run=False):
    print()
    print(f"  {'#':<4} {'DateTime':<20} {'Symbol':<12} {'Action':<5} {'Qty':>10} {'Rate':>10} {'NetCash':>10} {'Status'}")
    print("  " + "-" * 95)
    for i, r in enumerate(records, 1):
        status  = _row_status(r, "transaction_id", existing_ids, manual_hashes, dry_run)
        order_t = str(r.get("exec_time") or r.get("transaction_date") or "")[:19].replace("T", " ")
        qty     = r.get("quantity") or 0
        rate    = r.get("rate") or 0
        net     = r.get("net_cash") or 0
        print(
            f"  {i:<4} {order_t:<20} {r['symbol']:<12} {r.get('action',''):<5} "
            f"{qty:>10.4f} {rate:>10.6f} {net:>+10.2f}  {status}"
        )
    print()


# ── Account transactions (CTRN: dividends, interest, tax, deposits) ─────────────

# Raw IBKR "Type" → normalized category slug. The UI groups/summarizes by these.
CTRN_CATEGORY = {
    "dividends":                 "dividend",
    "payment in lieu of dividends": "dividend",
    "withholding tax":           "withholding_tax",
    "broker interest paid":      "interest_paid",
    "broker interest received":  "interest_received",
    "deposits/withdrawals":      "deposit_withdrawal",
    "other fees":                "fee",
    "commission adjustments":    "fee",
}


def categorize_ctrn(raw_type):
    """Normalize an IBKR CTRN Type to a stable category slug (else 'other')."""
    return CTRN_CATEGORY.get((raw_type or "").strip().lower(), "other")


def parse_ctrn_dt(series):
    """
    Parse a CTRN Date/Time value. Unlike trades, CTRN mixes two shapes:
      - "03/12/2026,20:20:00"  (dividends/interest — date + time)
      - "03/30/2026"           (deposits — date only)
    Also tolerates a trailing timezone suffix. Returns a datetime Series.
    """
    cleaned = series.str.strip().str.replace(_TZ_SUFFIX, "", regex=True)
    dt = pd.to_datetime(cleaned, format="%m/%d/%Y,%H:%M:%S", errors="coerce")
    missing = dt.isna()
    if missing.any():
        dt[missing] = pd.to_datetime(
            cleaned[missing], format="%m/%d/%Y", errors="coerce"
        )
    return dt


def parse_ctrn_csv(csv_bytes):
    """Extract the CTRN section (account-level cash transactions)."""
    return extract_section(csv_bytes, "CTRN")


def transform_ctrn(rows):
    """Map CTRN rows → account_transactions schema, keyed on IBKR TransactionID."""
    if rows.empty:
        return []

    def col(name):
        return rows[name].str.strip() if name in rows.columns else pd.Series(
            [""] * len(rows), index=rows.index
        )

    df = pd.DataFrame(index=rows.index)
    df["account_id"]  = col("ClientAccountID")
    df["currency"]    = col("CurrencyPrimary")
    df["symbol"]      = col("Symbol")
    df["description"] = col("Description")
    df["type"]        = col("Type")
    df["category"]    = df["type"].map(categorize_ctrn)

    dt = parse_ctrn_dt(col("Date/Time"))
    df["datetime"]         = dt.dt.strftime("%Y-%m-%dT%H:%M:%S")
    df["transaction_date"] = dt.dt.date.astype(str)

    df["amount"]      = pd.to_numeric(col("Amount"), errors="coerce")
    # FX rate to base currency (USD). Present in the Interactive template; the
    # older template omits it, in which case col() yields NaN → None.
    df["fx_rate_to_base"] = pd.to_numeric(col("FXRateToBase"), errors="coerce")
    df["ibkr_txn_id"] = col("TransactionID")

    df.dropna(subset=["amount"], inplace=True)
    df = df[df["datetime"].notna() & (df["transaction_date"] != "NaT")]
    df.sort_values("datetime", inplace=True)

    def make_ctrn_id(row):
        tid = str(row.get("ibkr_txn_id") or "").strip()
        if tid:
            return f"ctrn_{tid}"
        key = f"ctrn|{row['datetime']}|{row['type']}|{row['amount']}"
        return "ctrn_" + hashlib.sha256(key.encode()).hexdigest()[:28]

    df["transaction_id"] = df.apply(make_ctrn_id, axis=1)
    df["source"]         = "ibkr"
    df.drop(columns=["ibkr_txn_id"], inplace=True)

    return df.to_dict(orient="records")


def check_existing_ctrn_ids(client, ids):
    if not ids:
        return set()
    return _select_in_chunks(client, "account_transactions", "transaction_id", ids)


def upsert_ctrn_to_supabase(client, records):
    if not records:
        return 0
    client.table("account_transactions").upsert(
        sanitize_records(records), on_conflict="transaction_id"
    ).execute()
    return len(records)


def print_ctrn_table(records, existing_ids, dry_run=False):
    print()
    print(f"  {'#':<4} {'DateTime':<20} {'Category':<18} {'Symbol':<8} {'Amount':>12} {'Status'}")
    print("  " + "-" * 85)
    for i, r in enumerate(records, 1):
        status = _row_status(r, "transaction_id", existing_ids, frozenset(), dry_run)
        when   = str(r.get("datetime") or r.get("transaction_date") or "")[:19].replace("T", " ")
        amt    = r.get("amount") or 0
        print(
            f"  {i:<4} {when:<20} {r.get('category',''):<18} {(r.get('symbol') or ''):<8} "
            f"{amt:>+12.2f}  {status}"
        )
    print()


# ── Interest accruals (IACC: daily BASE_SUMMARY accrued interest) ────────────────

def parse_iacc_csv(csv_bytes):
    """Extract the IACC section (daily interest-accrual summary)."""
    return extract_section(csv_bytes, "IACC")


def transform_iacc(rows):
    """
    Map IACC BASE_SUMMARY rows → interest_accruals schema.

    Each row is one day's accrued interest. The Flex layout puts the scope
    label ("BASE_SUMMARY") in the CurrencyPrimary column; we keep only those.
    Keyed on (account, to_date) so re-ingesting the same day is idempotent.
    """
    if rows.empty:
        return []

    scope = rows["CurrencyPrimary"].str.strip() if "CurrencyPrimary" in rows.columns else None
    if scope is None:
        return []
    rows = rows[scope == "BASE_SUMMARY"].copy()
    if rows.empty:
        return []

    def col(name):
        return rows[name].str.strip() if name in rows.columns else pd.Series(
            [""] * len(rows), index=rows.index
        )

    df = pd.DataFrame(index=rows.index)
    df["account_id"]       = col("ClientAccountID")
    df["scope"]            = "BASE_SUMMARY"
    df["from_date"]        = parse_ctrn_dt(col("FromDate")).dt.date.astype(str)
    df["to_date"]          = parse_ctrn_dt(col("ToDate")).dt.date.astype(str)
    df["interest_accrued"] = pd.to_numeric(col("InterestAccrued"), errors="coerce")
    df["fx_translation"]   = pd.to_numeric(col("FXTranslation"), errors="coerce")

    df = df[(df["to_date"] != "NaT") & df["interest_accrued"].notna()]

    # Ignore days where the BASE_SUMMARY is all zero (no interest accrued and no
    # FX translation) — they carry no information and only bloat the table.
    nonzero = (df["interest_accrued"] != 0) | (df["fx_translation"].fillna(0) != 0)
    df = df[nonzero]

    df.sort_values("to_date", inplace=True)

    df["accrual_id"] = "iacc_" + df["account_id"] + "_" + df["to_date"]
    df["source"]     = "ibkr"

    return df.to_dict(orient="records")


def check_existing_iacc_ids(client, ids):
    if not ids:
        return set()
    try:
        return _select_in_chunks(client, "interest_accruals", "accrual_id", ids)
    except Exception as e:
        # Table may not exist yet (migration 005 not applied). Treat all as new
        # so a dry run can still validate parsing before the table is created.
        print(f"  (note: interest_accruals lookup skipped — {type(e).__name__}; "
              f"apply migration 005 before a real run)")
        return set()


def upsert_iacc_to_supabase(client, records):
    if not records:
        return 0
    client.table("interest_accruals").upsert(
        sanitize_records(records), on_conflict="accrual_id"
    ).execute()
    return len(records)


def print_iacc_table(records, existing_ids, dry_run=False):
    print()
    print(f"  {'#':<4} {'ToDate':<12} {'InterestAccrued':>16} {'FXTransl':>10} {'Status'}")
    print("  " + "-" * 70)
    for i, r in enumerate(records, 1):
        status = _row_status(r, "accrual_id", existing_ids, frozenset(), dry_run)
        ia     = r.get("interest_accrued") or 0
        fx     = r.get("fx_translation") or 0
        print(f"  {i:<4} {str(r.get('to_date') or ''):<12} {ia:>+16.4f} {fx:>+10.4f}  {status}")
    print()


def _fmt_added(kind, r):
    """One-line representation of a row that was (or would be) inserted."""
    if kind == "trade":
        return (f"{r.get('exec_time',''):<19}  {r.get('symbol',''):<6} {str(r.get('action','')):<4} "
                f"qty={r.get('quantity')} @ {r.get('price')}  "
                f"pnl={r.get('realized_pnl')} comm={r.get('commission')} id={r.get('trade_id')}")
    if kind == "cash":
        return (f"{r.get('exec_time',''):<19}  {r.get('symbol',''):<8} {str(r.get('action','')):<4} "
                f"qty={r.get('quantity')} rate={r.get('rate')} net={r.get('net_cash')} id={r.get('transaction_id')}")
    if kind == "account txn":
        return (f"{r.get('datetime',''):<19}  {r.get('category',''):<18} {(r.get('symbol') or '-'):<6} "
                f"{r.get('amount')} {r.get('currency','')} id={r.get('transaction_id')}")
    if kind == "interest accrual":
        return (f"{str(r.get('to_date','')):<12}  accrued={r.get('interest_accrued')} "
                f"fx={r.get('fx_translation')} id={r.get('accrual_id')}")
    return str(r)


def print_added(kind, rows, dry_run):
    """Print the exact rows that were inserted (or would be, in dry run)."""
    if not rows:
        return
    verb = "WOULD ADD" if dry_run else "ADDED"
    print(f"\n  ── {verb} {len(rows)} {kind} row(s) ──")
    for r in rows:
        print("    + " + _fmt_added(kind, r))


def transform(executions):
    """
    Map IBKR Flex Query columns → DB schema.

    Sorted by OrderTime so same-symbol trades on the same day appear in
    chronological order (buy → sell → buy again are distinct rows).
    trade_date is derived from OrderTime (when the order was placed).
    """
    if executions.empty:
        return []

    def col(name):
        return executions[name].str.strip() if name in executions.columns else pd.Series(
            [""] * len(executions), index=executions.index
        )

    df = pd.DataFrame(index=executions.index)
    df["symbol"]        = col("Symbol")
    df["ibkr_trade_id"] = col("TradeID")
    df["action"]        = col("Buy/Sell")
    df["currency"]      = col("CurrencyPrimary")

    # DateTime: execution timestamp e.g. "05/19/2026,10:20:16"
    exec_dt             = parse_flex_dt(col("DateTime"))
    df["exec_time"]    = exec_dt.dt.strftime("%Y-%m-%dT%H:%M:%S")   # ISO 8601 for Supabase TIMESTAMPTZ
    df["trade_date"]    = exec_dt.dt.date.astype(str)

    df["quantity"]      = pd.to_numeric(col("Quantity"), errors="coerce").abs()
    df["price"]         = pd.to_numeric(col("TradePrice"), errors="coerce")
    df["proceeds"]      = pd.to_numeric(col("NetCash"), errors="coerce")
    df["commission"]    = pd.to_numeric(col("IBCommission"), errors="coerce")
    df["realized_pnl"]  = pd.to_numeric(col("FifoPnlRealized"), errors="coerce")

    df.dropna(subset=["symbol", "trade_date", "quantity", "price"], inplace=True)

    # Sort by OrderTime — preserves chronological order for repeated same-symbol trades
    df.sort_values("exec_time", inplace=True)

    df["trade_id"]     = df.apply(make_trade_id, axis=1)
    df["content_hash"] = df.apply(make_trade_content_hash, axis=1)
    df["source"]       = "ibkr"
    df.drop(columns=["ibkr_trade_id"], inplace=True)

    return df.to_dict(orient="records")


def get_supabase_client():
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    if not key.startswith("eyJ"):
        raise ValueError(
            "SUPABASE_SERVICE_KEY looks wrong — make sure you copied the "
            "'service_role' key (not the 'anon' key) from Supabase Settings → API."
        )
    return create_client(url, key)


def check_existing_trade_ids(client, trade_ids):
    """Return the set of trade_ids already in the trades table."""
    if not trade_ids:
        return set()
    return _select_in_chunks(client, "trades", "trade_id", trade_ids)


def merge_manual_trades(client, records):
    """
    For any incoming record whose content_hash already exists with source='manual',
    update that row with the IBKR trade_id and flip source to 'ibkr'. This absorbs
    a manually-entered trade when the matching IBKR CSV row arrives later, instead
    of inserting a duplicate. Returns the records that still need insert.
    """
    if not records:
        return []
    hashes = [r["content_hash"] for r in records]
    # Consume each manual hash only once: a second incoming fill with the same
    # economics (distinct partial fill) must insert as a new row, not overwrite
    # the row we just merged.
    remaining = _select_in_chunks(client, "trades", "content_hash", hashes, {"source": "manual"})
    if not remaining:
        return records

    # trade_ids already in the table must NOT be re-keyed onto a manual row —
    # that would violate the unique trade_id constraint. Such rows are plain
    # duplicates; hand them to the upsert (on_conflict) instead of merging.
    present_ids = _select_in_chunks(client, "trades", "trade_id", [r["trade_id"] for r in records])

    to_insert = []
    for r in records:
        h = r["content_hash"]
        if h in remaining and r["trade_id"] not in present_ids:
            remaining.discard(h)
            # Only overwrite fields the incoming row actually carries. The
            # Interactive Flex template omits NetCash/FifoPnlRealized, so a
            # blind update would null out values the manual row already has.
            update = {"trade_id": r["trade_id"], "source": "ibkr"}
            for k in ("commission", "realized_pnl", "proceeds"):
                if _present(r.get(k)):
                    update[k] = r.get(k)
            client.table("trades").update(update).eq("content_hash", h).eq("source", "manual").execute()
        else:
            to_insert.append(r)
    return to_insert


def upsert_to_supabase(client, records):
    if not records:
        return 0
    new_records = merge_manual_trades(client, records)
    if new_records:
        client.table("trades").upsert(sanitize_records(new_records), on_conflict="trade_id").execute()
    return len(new_records)


def print_trade_table(records, existing_ids, manual_hashes=frozenset(), dry_run=False):
    """Print a formatted table of trades with NEW / DUPLICATE / MERGE status."""
    print()
    print(f"  {'#':<4} {'DateTime':<20} {'Symbol':<8} {'Action':<5} {'Qty':>7} {'Price':>9} {'P&L':>10} {'Comm':>7}  {'Status'}")
    print("  " + "-" * 95)
    for i, r in enumerate(records, 1):
        status    = _row_status(r, "trade_id", existing_ids, manual_hashes, dry_run)
        pnl       = r.get("realized_pnl") or 0
        comm      = r.get("commission") or 0
        order_t   = str(r.get("exec_time") or r.get("trade_date") or "")[:19].replace("T", " ")
        print(
            f"  {i:<4} {order_t:<20} {r['symbol']:<8} {r['action']:<5} "
            f"{r['quantity']:>7.0f} {r['price']:>9.4f} {pnl:>+10.2f} {comm:>7.2f}  {status}"
        )
    print()


# Required (non-nullable) fields per record type — used by the dry-run data check.
# Fields that are legitimately empty for some rows (e.g. CTRN symbol on a deposit)
# are intentionally omitted.
REQUIRED_TRADE = ["symbol", "exec_time", "trade_date", "quantity", "price",
                  "proceeds", "commission", "action", "currency", "trade_id"]
REQUIRED_CASH  = ["symbol", "exec_time", "transaction_date", "quantity", "rate",
                  "net_cash", "action", "currency", "transaction_id"]
REQUIRED_CTRN  = ["datetime", "transaction_date", "amount", "currency", "type",
                  "category", "transaction_id"]
REQUIRED_IACC  = ["account_id", "to_date", "interest_accrued", "accrual_id"]


def _parse_args(argv):
    import argparse
    p = argparse.ArgumentParser(description="IBKR Flex ingestion — TradeOpsJournal")
    p.add_argument("--dry-run", action="store_true",
                   help="Parse and classify NEW/DUPLICATE/MERGE but write nothing to the DB.")
    p.add_argument("--file", action="append", default=[], metavar="PATH",
                   help="Read a local CSV instead of fetching from Gmail (repeatable).")
    p.add_argument("--days-back", type=int, default=None,
                   help="Override DAYS_BACK for the Gmail scan.")
    return p.parse_args(argv)


def collect_sources(args, days_back):
    """Return a list of (label, csv_bytes) from local files or Gmail."""
    if args.file:
        sources = []
        for path in args.file:
            with open(path, "rb") as fh:
                sources.append((os.path.basename(path), io.BytesIO(fh.read())))
        print(f"Local file mode — {len(sources)} file(s) to process.\n")
        return sources

    service = build_gmail_client()
    messages = find_ibkr_emails(service, days_back=days_back)
    if not messages:
        print("\nNo recent IBKR emails found. Nothing to do.")
        print(f"(Searched: last {days_back} days, from {IBKR_SENDER}, subject '{IBKR_SUBJECT}')")
        return []

    print(f"\nFound {len(messages)} email(s) to process.\n")
    sources = []
    for msg in messages:
        filename, csv_bytes = download_csv_attachment(service, msg["id"])
        if csv_bytes is None:
            print(f"[SKIP] Message {msg['id']} — no CSV attachment found.")
            continue
        sources.append((f"{filename} (msg {msg['id']})", csv_bytes))
    return sources


def main(argv=None):
    args = _parse_args(argv if argv is not None else sys.argv[1:])
    dry_run = args.dry_run
    days_back = args.days_back if args.days_back is not None else int(os.environ.get("DAYS_BACK") or 2)

    print("=" * 60)
    print("  IBKR Trade Ingestion — TradeOpsJournal")
    if dry_run:
        print("  *** DRY RUN — classifying only, NO writes to the database ***")
    if not args.file:
        print(f"  Scanning last {days_back} day(s)")
    print("=" * 60)

    client = get_supabase_client()
    sources = collect_sources(args, days_back)
    if not sources:
        sys.exit(0)

    totals = dict(new_trades=0, dupe_trades=0, merge_trades=0,
                  new_cash=0, dupe_cash=0, merge_cash=0,
                  new_ctrn=0, dupe_ctrn=0,
                  new_iacc=0, dupe_iacc=0,
                  missing_trades=0, missing_cash=0, missing_ctrn=0, missing_iacc=0)

    for label, csv_bytes in sources:
        print(f"{'─' * 60}")
        print(f"  Source : {label}")

        # ── STK trades ────────────────────────────────────────────────
        trades = transform(parse_ibkr_csv(csv_bytes))
        print(f"\n  [STK] Parsed {len(trades)} stock EXECUTION row(s)")
        if trades:
            existing = check_existing_trade_ids(client, [r["trade_id"] for r in trades])
            manual   = _manual_hashes(client, "trades", trades)
            dupe = sum(1 for r in trades if r["trade_id"] in existing)
            merge = sum(1 for r in trades if r["trade_id"] not in existing
                        and r.get("content_hash") in manual)
            new  = len(trades) - dupe - merge

            print_trade_table(trades, existing, manual, dry_run)
            totals["missing_trades"] += len(report_missing(trades, REQUIRED_TRADE, "STK data check"))
            if not dry_run:
                upsert_to_supabase(client, trades)

            added = [r for r in trades if r["trade_id"] not in existing
                     and r.get("content_hash") not in manual]
            verb = "would insert" if dry_run else "inserted"
            print(f"  {'•' if dry_run else '✔'} Trades {verb} : {new}")
            if merge: print(f"  ⤵ Trades merge into manual : {merge}")
            if dupe:  print(f"  ↩ Trades duplicate (skip)  : {dupe}")
            print_added("trade", added, dry_run)
            totals["new_trades"] += new; totals["dupe_trades"] += dupe; totals["merge_trades"] += merge
        else:
            print("  No stock trades in this file.")

        # ── CASH / FX transactions ────────────────────────────────────
        cash_recs = transform_cash(parse_cash_csv(csv_bytes))
        print(f"\n  [CASH] Parsed {len(cash_recs)} cash/FX EXECUTION row(s)")
        if cash_recs:
            existing = check_existing_cash_ids(client, [r["transaction_id"] for r in cash_recs])
            manual   = _manual_hashes(client, "cash_transactions", cash_recs)
            dupe = sum(1 for r in cash_recs if r["transaction_id"] in existing)
            merge = sum(1 for r in cash_recs if r["transaction_id"] not in existing
                        and r.get("content_hash") in manual)
            new  = len(cash_recs) - dupe - merge

            print_cash_table(cash_recs, existing, manual, dry_run)
            totals["missing_cash"] += len(report_missing(cash_recs, REQUIRED_CASH, "CASH data check"))
            if not dry_run:
                upsert_cash_to_supabase(client, cash_recs)

            added = [r for r in cash_recs if r["transaction_id"] not in existing
                     and r.get("content_hash") not in manual]
            verb = "would insert" if dry_run else "inserted"
            print(f"  {'•' if dry_run else '✔'} Cash {verb} : {new}")
            if merge: print(f"  ⤵ Cash merge into manual : {merge}")
            if dupe:  print(f"  ↩ Cash duplicate (skip)  : {dupe}")
            print_added("cash", added, dry_run)
            totals["new_cash"] += new; totals["dupe_cash"] += dupe; totals["merge_cash"] += merge
        else:
            print("  No cash/FX transactions in this file.")

        # ── CTRN account transactions (dividends, interest, tax, deposits) ──
        ctrn_recs = transform_ctrn(parse_ctrn_csv(csv_bytes))
        print(f"\n  [CTRN] Parsed {len(ctrn_recs)} account transaction row(s)")
        if ctrn_recs:
            existing = check_existing_ctrn_ids(client, [r["transaction_id"] for r in ctrn_recs])
            dupe = sum(1 for r in ctrn_recs if r["transaction_id"] in existing)
            new  = len(ctrn_recs) - dupe

            print_ctrn_table(ctrn_recs, existing, dry_run)
            totals["missing_ctrn"] += len(report_missing(ctrn_recs, REQUIRED_CTRN, "CTRN data check"))
            if not dry_run:
                upsert_ctrn_to_supabase(client, ctrn_recs)

            added = [r for r in ctrn_recs if r["transaction_id"] not in existing]
            verb = "would insert" if dry_run else "inserted"
            print(f"  {'•' if dry_run else '✔'} Account txns {verb} : {new}")
            if dupe: print(f"  ↩ Account txns duplicate (skip) : {dupe}")
            print_added("account txn", added, dry_run)
            totals["new_ctrn"] += new; totals["dupe_ctrn"] += dupe
        else:
            print("  No account transactions in this file.")

        # ── IACC interest accruals (daily BASE_SUMMARY) ───────────────
        iacc_recs = transform_iacc(parse_iacc_csv(csv_bytes))
        print(f"\n  [IACC] Parsed {len(iacc_recs)} interest-accrual row(s)")
        if iacc_recs:
            existing = check_existing_iacc_ids(client, [r["accrual_id"] for r in iacc_recs])
            dupe = sum(1 for r in iacc_recs if r["accrual_id"] in existing)
            new  = len(iacc_recs) - dupe

            print_iacc_table(iacc_recs, existing, dry_run)
            totals["missing_iacc"] += len(report_missing(iacc_recs, REQUIRED_IACC, "IACC data check"))
            if not dry_run:
                upsert_iacc_to_supabase(client, iacc_recs)

            added = [r for r in iacc_recs if r["accrual_id"] not in existing]
            verb = "would insert" if dry_run else "inserted"
            print(f"  {'•' if dry_run else '✔'} Interest accruals {verb} : {new}")
            if dupe: print(f"  ↩ Interest accruals duplicate (skip) : {dupe}")
            print_added("interest accrual", added, dry_run)
            totals["new_iacc"] += new; totals["dupe_iacc"] += dupe
        else:
            print("  No interest accruals in this file.")

        print()

    print("=" * 60)
    print("  DRY RUN SUMMARY" if dry_run else "  SUMMARY")
    print(f"  Sources processed       : {len(sources)}")
    print(f"  Stock trades   — new: {totals['new_trades']:>4}  merge: {totals['merge_trades']:>3}  dup: {totals['dupe_trades']:>4}")
    print(f"  Cash / FX      — new: {totals['new_cash']:>4}  merge: {totals['merge_cash']:>3}  dup: {totals['dupe_cash']:>4}")
    print(f"  Account txns   — new: {totals['new_ctrn']:>4}  {'':>10}  dup: {totals['dupe_ctrn']:>4}")
    print(f"  Interest accr. — new: {totals['new_iacc']:>4}  {'':>10}  dup: {totals['dupe_iacc']:>4}")
    miss = totals['missing_trades'] + totals['missing_cash'] + totals['missing_ctrn'] + totals['missing_iacc']
    if miss:
        print(f"  ⚠ Rows with missing data: trades={totals['missing_trades']} cash={totals['missing_cash']} "
              f"ctrn={totals['missing_ctrn']} iacc={totals['missing_iacc']}")
    else:
        print("  ✓ Data completeness: all parsed rows have required fields")
    if dry_run:
        print("  (dry run — nothing was written)")
    print("=" * 60)


if __name__ == "__main__":
    main()
