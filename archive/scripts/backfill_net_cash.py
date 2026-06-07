"""One-shot: backfill net_cash = quantity * rate for existing cash_transactions where net_cash is 0."""
import os
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
from supabase import create_client

sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY'])

resp = sb.table('cash_transactions').select('transaction_id, quantity, rate, net_cash').execute()
rows = resp.data or []

updated = 0
for r in rows:
    nc = r.get('net_cash') or 0
    qty = r.get('quantity') or 0
    rate = r.get('rate') or 0
    if nc == 0 and qty > 0 and rate > 0:
        new_net = round(qty * rate, 6)
        sb.table('cash_transactions').update({'net_cash': new_net}).eq('transaction_id', r['transaction_id']).execute()
        print(f"  Updated {r['transaction_id']}: net_cash = {qty} x {rate} = {new_net}")
        updated += 1

print(f"\nDone. Updated {updated} of {len(rows)} rows.")
