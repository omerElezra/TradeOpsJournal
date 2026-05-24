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


def find_ibkr_emails(service, days_back=5):
    """Return message IDs of recent IBKR emails with CSV attachments."""
    query = f"from:{IBKR_SENDER} subject:{IBKR_SUBJECT} has:attachment newer_than:{days_back}d"
    result = service.users().messages().list(userId="me", q=query).execute()
    return result.get("messages", [])


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


def make_trade_id(row):
    """Use IBKR TradeID when available, else hash key fields."""
    if row.get("ibkr_trade_id") and str(row["ibkr_trade_id"]).strip():
        return str(row["ibkr_trade_id"]).strip()
    key = f"{row['trade_date']}|{row['symbol']}|{row['quantity']}|{row['price']}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def transform(executions):
    """Map IBKR Flex Query columns to our schema and return a list of dicts."""
    if executions.empty:
        return []

    def col(name):
        return executions[name].str.strip() if name in executions.columns else None

    df = pd.DataFrame()
    df["symbol"]       = col("Symbol")
    df["ibkr_trade_id"] = col("TradeID")
    df["action"]       = col("Buy/Sell")
    df["currency"]     = col("CurrencyPrimary")

    # DateTime format from Flex: "05/19/2026,10:20:16"
    dt = pd.to_datetime(col("DateTime"), format="%m/%d/%Y,%H:%M:%S", errors="coerce")
    df["trade_date"] = dt.dt.date.astype(str)

    df["quantity"]     = pd.to_numeric(col("Quantity"), errors="coerce").abs()
    df["price"]        = pd.to_numeric(col("TradePrice"), errors="coerce")
    df["proceeds"]     = pd.to_numeric(col("NetCash"), errors="coerce")
    df["commission"]   = pd.to_numeric(col("IBCommission"), errors="coerce")
    df["realized_pnl"] = pd.to_numeric(col("FifoPnlRealized"), errors="coerce")

    df.dropna(subset=["symbol", "trade_date", "quantity", "price"], inplace=True)
    df["trade_id"] = df.apply(make_trade_id, axis=1)
    df.drop(columns=["ibkr_trade_id"], inplace=True)

    return df.to_dict(orient="records")


def upsert_to_supabase(records):
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_SERVICE_KEY"]
    if not key.startswith("eyJ"):
        raise ValueError(
            "SUPABASE_SERVICE_KEY looks wrong — make sure you copied the "
            "'service_role' key (not the 'anon' key) from Supabase Settings → API."
        )
    client = create_client(url, key)
    if not records:
        return 0
    client.table("trades").upsert(records, on_conflict="trade_id").execute()
    return len(records)


def main():
    print("=== IBKR Trade Ingestion ===")

    service = build_gmail_client()
    messages = find_ibkr_emails(service)

    if not messages:
        print("No recent IBKR emails with CSV attachments found. Nothing to do.")
        sys.exit(0)

    total_inserted = 0
    for msg in messages:
        msg_id = msg["id"]
        print(f"\nProcessing message {msg_id}...")
        filename, csv_bytes = download_csv_attachment(service, msg_id)
        if csv_bytes is None:
            print("  No CSV attachment found, skipping.")
            continue

        print(f"  Attachment: {filename}")
        raw = parse_ibkr_csv(csv_bytes)
        records = transform(raw)
        print(f"  Parsed {len(records)} trade rows.")

        n = upsert_to_supabase(records)
        total_inserted += n
        print(f"  Upserted {n} records to Supabase.")

    print(f"\nDone. Total records upserted: {total_inserted}")


if __name__ == "__main__":
    main()
