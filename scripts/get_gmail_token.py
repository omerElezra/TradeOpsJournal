"""
Run this script ONCE locally to generate your Gmail OAuth2 refresh token.
It will open a browser for you to authenticate with your Google account.

Usage:
    1. Place your downloaded credentials.json in this directory
    2. Run: python scripts/get_gmail_token.py
    3. Copy the printed refresh token into your .env file / GitHub Secrets
"""

import json
import os
from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), "credentials.json")

if not os.path.exists(CREDENTIALS_FILE):
    raise FileNotFoundError(
        "credentials.json not found in scripts/. "
        "Download it from Google Cloud Console → APIs & Services → Credentials."
    )

flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
creds = flow.run_local_server(port=0)

print("\n--- Copy these values into your .env / GitHub Secrets ---")
print(f"GMAIL_CLIENT_ID={creds.client_id}")
print(f"GMAIL_CLIENT_SECRET={creds.client_secret}")
print(f"GMAIL_REFRESH_TOKEN={creds.refresh_token}")
print("----------------------------------------------------------\n")
