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
    Parse an IBKR Activity Statement CSV.

    IBKR CSVs are multi-section: each row starts with a section name.
    We extract only the 'Trades' / 'Data' / 'Order' rows for Stocks.
    """
    csv_bytes.seek(0)
    raw = pd.read_csv(csv_bytes, header=None, dtype=str, on_bad_lines="skip")

    # Find the Trades header row to get column names
    header_mask = (raw[0] == "Trades") & (raw[1] == "Header")
    if not header_mask.any():
        print("  No Trades section found in this CSV.")
        return pd.DataFrame()

    header_row = raw[header_mask].iloc[0]
    columns = header_row.tolist()

    # Extract data rows: Trades / Data / Order (actual filled orders)
    data_mask = (raw[0] == "Trades") & (raw[1] == "Data") & (raw[2] == "Order")
    trades_raw = raw[data_mask].copy()

    if trades_raw.empty:
        print("  No trade data rows found.")
        return pd.DataFrame()

    trades_raw.columns = range(len(raw.columns))
    trades_raw = trades_raw.iloc[:, : len(columns)]
    trades_raw.columns = columns

    # Filter stocks only
    if "Asset Category" in trades_raw.columns:
        trades_raw = trades_raw[trades_raw["Asset Category"].str.strip() == "Stocks"]

    return trades_raw


def make_trade_id(row):
    """Stable dedup key: hash of date + symbol + qty + price."""
    key = f"{row['trade_date']}|{row['symbol']}|{row['quantity']}|{row['price']}"
    return hashlib.sha256(key.encode()).hexdigest()[:32]


def transform(trades_raw):
    """Map IBKR columns to our schema and return a list of dicts."""
    if trades_raw.empty:
        return []

    col = {c.strip(): c for c in trades_raw.columns}  # strip-safe lookup

    def get(df, name):
        return df[col[name]].str.strip() if name in col else None

    df = pd.DataFrame()
    df["symbol"] = get(trades_raw, "Symbol")
    df["trade_date"] = (
        pd.to_datetime(get(trades_raw, "Date/Time"), errors="coerce")
        .dt.date.astype(str)
    )
    df["quantity"] = pd.to_numeric(get(trades_raw, "Quantity"), errors="coerce")
    df["price"] = pd.to_numeric(get(trades_raw, "T. Price"), errors="coerce")
    df["proceeds"] = pd.to_numeric(get(trades_raw, "Proceeds"), errors="coerce")
    df["commission"] = pd.to_numeric(get(trades_raw, "Comm/Fee"), errors="coerce")
    df["realized_pnl"] = pd.to_numeric(get(trades_raw, "Realized P&L"), errors="coerce")
    df["currency"] = get(trades_raw, "Currency") if "Currency" in col else "USD"

    # Derive BUY/SELL from quantity sign
    df["action"] = df["quantity"].apply(lambda q: "BUY" if q > 0 else "SELL")
    df["quantity"] = df["quantity"].abs()

    df.dropna(subset=["symbol", "trade_date", "quantity", "price"], inplace=True)
    df["trade_id"] = df.apply(make_trade_id, axis=1)

    return df.to_dict(orient="records")


def upsert_to_supabase(records):
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
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
