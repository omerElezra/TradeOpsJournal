"""
Daily ingestion: Gmail → parse IBKR CSV → upsert to Supabase.

Designed to run as a GitHub Actions cron job (Mon–Fri at 08:00 UTC).
Safe to run multiple times — upsert on trade_id prevents duplicates.
"""

import base64
import hashlib
import io
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


def parse_ibkr_csv(csv_bytes):
    """
    Parse an IBKR Flex Query Daily Activity CSV.

    The file contains multiple sections with different schemas concatenated.
    We read only the first section (trades) using the first header row,
    then filter to EXECUTION rows for stocks.
    """
    # Try common encodings — IBKR CSVs sometimes use latin-1
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            csv_bytes.seek(0)
            raw = pd.read_csv(
                csv_bytes,
                header=0,
                dtype=str,
                on_bad_lines="skip",
                encoding=encoding,
            )
            break
        except UnicodeDecodeError:
            continue

    # Keep only the trade section columns (first header row defines them)
    # The file has extra header rows mid-file for other sections — drop them
    # by requiring the EXECUTION LevelOfDetail value
    if "LevelOfDetail" not in raw.columns:
        print("  Unexpected CSV format — LevelOfDetail column not found.")
        print(f"  Columns found: {list(raw.columns)}")
        return pd.DataFrame()

    executions = raw[
        (raw["LevelOfDetail"].str.strip() == "EXECUTION") &
        (raw["AssetClass"].str.strip() == "STK")
    ].copy()

    if executions.empty:
        print("  No EXECUTION rows found for STK.")
        return pd.DataFrame()

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
    """Canonical number string — whole numbers omit decimal (100.0 → '100')."""
    try:
        f = float(x)
    except (TypeError, ValueError):
        return ""
    if pd.isna(f):
        return ""
    return str(int(f)) if f == int(f) else repr(f)


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

    These rows share the same first-section header as STK trades but have
    AssetClass == 'CASH'.  Examples: USD.ILS, ILS.USD conversions when
    depositing or withdrawing local-currency funds.
    """
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            csv_bytes.seek(0)
            raw = pd.read_csv(
                csv_bytes, header=0, dtype=str,
                on_bad_lines="skip", encoding=encoding,
            )
            break
        except UnicodeDecodeError:
            continue

    if "LevelOfDetail" not in raw.columns:
        return pd.DataFrame()

    cash = raw[
        (raw["LevelOfDetail"].str.strip() == "EXECUTION") &
        (raw["AssetClass"].str.strip() == "CASH")
    ].copy()

    return cash


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
    df.drop(columns=["ibkr_trade_id"], inplace=True)

    return df.to_dict(orient="records")


def check_existing_cash_ids(client, ids):
    if not ids:
        return set()
    res = (
        client.table("cash_transactions")
        .select("transaction_id")
        .in_("transaction_id", ids)
        .execute()
    )
    return {row["transaction_id"] for row in res.data}


def upsert_cash_to_supabase(client, records):
    if not records:
        return 0
    client.table("cash_transactions").upsert(sanitize_records(records), on_conflict="transaction_id").execute()
    return len(records)


def print_cash_table(records, existing_ids):
    print()
    print(f"  {'#':<4} {'DateTime':<20} {'Symbol':<12} {'Action':<5} {'Qty':>10} {'Rate':>10} {'NetCash':>10} {'Status'}")
    print("  " + "-" * 90)
    for i, r in enumerate(records, 1):
        status  = "DUPLICATE (skip)" if r["transaction_id"] in existing_ids else "NEW → inserted"
        order_t = str(r.get("exec_time") or r.get("transaction_date") or "")[:19].replace("T", " ")
        qty     = r.get("quantity") or 0
        rate    = r.get("rate") or 0
        net     = r.get("net_cash") or 0
        print(
            f"  {i:<4} {order_t:<20} {r['symbol']:<12} {r.get('action',''):<5} "
            f"{qty:>10.4f} {rate:>10.6f} {net:>+10.2f}  {status}"
        )
    print()


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
    res = (
        client.table("trades")
        .select("trade_id")
        .in_("trade_id", trade_ids)
        .execute()
    )
    return {row["trade_id"] for row in res.data}


def upsert_to_supabase(client, records):
    if not records:
        return 0
    client.table("trades").upsert(sanitize_records(records), on_conflict="trade_id").execute()
    return len(records)


def print_trade_table(records, existing_ids):
    """Print a formatted table of trades with NEW / DUPLICATE status."""
    print()
    print(f"  {'#':<4} {'DateTime':<20} {'Symbol':<8} {'Action':<5} {'Qty':>7} {'Price':>9} {'P&L':>10} {'Comm':>7}  {'Status'}")
    print("  " + "-" * 90)
    for i, r in enumerate(records, 1):
        status    = "DUPLICATE (skip)" if r["trade_id"] in existing_ids else "NEW → inserted"
        pnl       = r.get("realized_pnl") or 0
        comm      = r.get("commission") or 0
        order_t   = str(r.get("exec_time") or r.get("trade_date") or "")[:19].replace("T", " ")
        print(
            f"  {i:<4} {order_t:<20} {r['symbol']:<8} {r['action']:<5} "
            f"{r['quantity']:>7.0f} {r['price']:>9.4f} {pnl:>+10.2f} {comm:>7.2f}  {status}"
        )
    print()


def main():
    # DAYS_BACK: set by workflow_dispatch input; empty on scheduled runs → default 2
    days_back = int(os.environ.get("DAYS_BACK") or 2)

    print("=" * 60)
    print("  IBKR Trade Ingestion — TradeOpsJournal")
    print(f"  Scanning last {days_back} day(s)")
    print("=" * 60)

    service = build_gmail_client()
    messages = find_ibkr_emails(service, days_back=days_back)

    if not messages:
        print("\nNo recent IBKR emails found. Nothing to do.")
        print("(Searched: last 5 days, from Info@inter-il.com, subject 'Activity Flex')")
        sys.exit(0)

    print(f"\nFound {len(messages)} email(s) to process.\n")

    client = get_supabase_client()
    total_new_trades = 0
    total_dupe_trades = 0
    total_new_cash = 0
    total_dupe_cash = 0

    for msg in messages:
        msg_id = msg["id"]
        filename, csv_bytes = download_csv_attachment(service, msg_id)
        if csv_bytes is None:
            print(f"[SKIP] Message {msg_id} — no CSV attachment found.")
            continue

        print(f"{'─' * 60}")
        print(f"  File   : {filename}")
        print(f"  Msg ID : {msg_id}")

        # ── STK trades ────────────────────────────────────────────────
        stk_raw  = parse_ibkr_csv(csv_bytes)
        trades   = transform(stk_raw)
        print(f"\n  [STK] Parsed {len(trades)} stock EXECUTION row(s)")

        if trades:
            incoming_ids = [r["trade_id"] for r in trades]
            existing_ids = check_existing_trade_ids(client, incoming_ids)
            new_count    = sum(1 for r in trades if r["trade_id"] not in existing_ids)
            dupe_count   = len(trades) - new_count

            print_trade_table(trades, existing_ids)
            upsert_to_supabase(client, trades)

            print(f"  ✔ Trades inserted : {new_count}")
            if dupe_count:
                print(f"  ↩ Trades skipped  : {dupe_count} duplicate(s)")

            total_new_trades  += new_count
            total_dupe_trades += dupe_count
        else:
            print("  No stock trades in this file.")

        # ── CASH / FX transactions ────────────────────────────────────
        cash_raw   = parse_cash_csv(csv_bytes)
        cash_recs  = transform_cash(cash_raw)
        print(f"\n  [CASH] Parsed {len(cash_recs)} cash/FX EXECUTION row(s)")

        if cash_recs:
            incoming_cids = [r["transaction_id"] for r in cash_recs]
            existing_cids = check_existing_cash_ids(client, incoming_cids)
            new_c   = sum(1 for r in cash_recs if r["transaction_id"] not in existing_cids)
            dupe_c  = len(cash_recs) - new_c

            print_cash_table(cash_recs, existing_cids)
            upsert_cash_to_supabase(client, cash_recs)

            print(f"  ✔ Cash inserted : {new_c}")
            if dupe_c:
                print(f"  ↩ Cash skipped  : {dupe_c} duplicate(s)")

            total_new_cash  += new_c
            total_dupe_cash += dupe_c
        else:
            print("  No cash/FX transactions in this file.")

        print()

    print("=" * 60)
    print("  SUMMARY")
    print(f"  Files processed       : {len(messages)}")
    print(f"  New stock trades      : {total_new_trades}")
    print(f"  Duplicate trades      : {total_dupe_trades}")
    print(f"  New cash/FX entries   : {total_new_cash}")
    print(f"  Duplicate cash/FX     : {total_dupe_cash}")
    print("=" * 60)


if __name__ == "__main__":
    main()
