"""
Run a SQL migration file against Supabase using the Management API.

Usage:
    SUPABASE_URL=...  SUPABASE_ACCESS_TOKEN=...  python scripts/run_migration.py scripts/migrations/001_trade_journal.sql

Requires only the two env vars above — no extra packages beyond what is in requirements.txt.
"""

import os
import sys
import urllib.request
import urllib.error
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()


def main():
    if len(sys.argv) < 2:
        print("Usage: python scripts/run_migration.py <path/to/migration.sql>")
        sys.exit(1)

    migration_path = Path(sys.argv[1])
    if not migration_path.exists():
        print(f"Migration file not found: {migration_path}")
        sys.exit(1)

    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    access_token = os.environ.get("SUPABASE_ACCESS_TOKEN", "")

    if not supabase_url:
        print("Error: SUPABASE_URL is not set.")
        sys.exit(1)
    if not access_token:
        print("Error: SUPABASE_ACCESS_TOKEN is not set.")
        print("Get one at: https://app.supabase.com/account/tokens")
        sys.exit(1)

    # Derive project ref from URL: https://<ref>.supabase.co
    host = supabase_url.replace("https://", "").replace("http://", "")
    project_ref = host.split(".")[0]
    if not project_ref:
        print(f"Error: could not parse project ref from SUPABASE_URL: {supabase_url}")
        sys.exit(1)

    sql = migration_path.read_text(encoding="utf-8")

    api_url = f"https://api.supabase.com/v1/projects/{project_ref}/database/query"
    payload = json.dumps({"query": sql}).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    print(f"Project ref : {project_ref}")
    print(f"Migration   : {migration_path}")
    print(f"Endpoint    : {api_url}")
    print()

    req = urllib.request.Request(api_url, data=payload, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode()
            print(f"✓ Migration applied successfully (HTTP {resp.status})")
            if body and body != "[]":
                print(body)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"✗ HTTP {e.code}: {e.reason}")
        print(body)
        sys.exit(1)


if __name__ == "__main__":
    main()
