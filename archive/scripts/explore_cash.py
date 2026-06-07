"""Quick exploration of cash_transactions data via running API."""
import json
import sys
import urllib.request
from collections import defaultdict

API = "http://localhost:8000/api/v1/cash"

# Fetch all cash data
url = f"{API}?range=all&limit=200"
with urllib.request.urlopen(url) as resp:
    payload = json.load(resp)

rows = payload["data"]
total = payload.get("total", len(rows))

print("=" * 80)
print("CASH TRANSACTIONS OVERVIEW")
print("=" * 80)
print(f"Total transactions: {total}")
print(f"Returned rows:      {len(rows)}")

if not rows:
    print("No data found.")
    sys.exit(0)

# Date range
dates = sorted(r["execTime"] for r in rows)
print(f"Date range:         {dates[0][:10]}  to  {dates[-1][:10]}")

# --- BY SYMBOL ---
symbols = {}
for r in rows:
    s = r["symbol"]
    if s not in symbols:
        symbols[s] = {"count": 0, "qty": 0, "net": 0, "comm": 0}
    symbols[s]["count"] += 1
    symbols[s]["qty"] += r["quantity"] or 0
    symbols[s]["net"] += r["netCash"] or 0
    symbols[s]["comm"] += r["commission"] or 0

print(f"\n--- BY SYMBOL ({len(symbols)} pairs) ---")
print(f"{'Symbol':<12} {'Txns':>5} {'Quantity':>14} {'Net Cash':>14} {'Commission':>12}")
print("-" * 60)
for s, v in sorted(symbols.items()):
    print(f"{s:<12} {v['count']:>5} {v['qty']:>14,.2f} {v['net']:>14,.2f} {v['comm']:>12,.2f}")

# --- BY ACTION ---
actions = {}
for r in rows:
    a = r["action"] or "NULL"
    actions[a] = actions.get(a, 0) + 1
print(f"\n--- BY ACTION ---")
for a, c in sorted(actions.items()):
    print(f"  {a:<6}: {c}")

# --- BY CURRENCY ---
currencies = {}
for r in rows:
    c = r["currency"] or "NULL"
    currencies[c] = currencies.get(c, 0) + 1
print(f"\n--- BY CURRENCY ---")
for c, cnt in sorted(currencies.items()):
    print(f"  {c:<6}: {cnt}")

# --- AGGREGATES ---
total_net = sum(r["netCash"] or 0 for r in rows)
inflows = sum(r["netCash"] for r in rows if (r["netCash"] or 0) > 0)
outflows = sum(r["netCash"] for r in rows if (r["netCash"] or 0) < 0)
total_comm = sum(r["commission"] or 0 for r in rows)
total_qty = sum(r["quantity"] or 0 for r in rows)

print(f"\n{'=' * 40}")
print(f"AGGREGATES (ALL TIME)")
print(f"{'=' * 40}")
print(f"Net Cash:         {total_net:>14,.2f}")
print(f"Total Inflows:    {inflows:>14,.2f}")
print(f"Total Outflows:   {outflows:>14,.2f}")
print(f"Total Commission: {total_comm:>14,.2f}")
print(f"Total Quantity:   {total_qty:>14,.2f}")

# --- MONTHLY ---
monthly = defaultdict(lambda: {"count": 0, "net": 0, "qty": 0, "comm": 0, "inflow": 0, "outflow": 0})
for r in rows:
    m = r["execTime"][:7]
    nc = r["netCash"] or 0
    monthly[m]["count"] += 1
    monthly[m]["net"] += nc
    monthly[m]["qty"] += r["quantity"] or 0
    monthly[m]["comm"] += r["commission"] or 0
    if nc > 0:
        monthly[m]["inflow"] += nc
    else:
        monthly[m]["outflow"] += nc

print(f"\n--- MONTHLY BREAKDOWN ---")
print(f"{'Month':<10} {'Txns':>5} {'Quantity':>14} {'Net Cash':>14} {'Inflows':>14} {'Outflows':>14} {'Commission':>12}")
print("-" * 90)
for m in sorted(monthly.keys()):
    v = monthly[m]
    print(f"{m:<10} {v['count']:>5} {v['qty']:>14,.2f} {v['net']:>14,.2f} {v['inflow']:>14,.2f} {v['outflow']:>14,.2f} {v['comm']:>12,.2f}")

# --- RECENT ROWS ---
print(f"\n--- 10 MOST RECENT TRANSACTIONS ---")
print(f"{'Exec Time':<20} {'Symbol':<12} {'Act':>4} {'Quantity':>12} {'Rate':>10} {'Net Cash':>12} {'Comm':>10} {'Ccy'}")
print("-" * 95)
for r in rows[:10]:
    print(f"{r['execTime'][:19]:<20} {r['symbol']:<12} {(r['action'] or '-'):>4} {r['quantity']:>12,.4f} {(r['rate'] or 0):>10.4f} {(r['netCash'] or 0):>12,.2f} {(r['commission'] or 0):>10.2f} {r['currency'] or '-'}")

# --- ALL ROWS DUMP ---
print(f"\n--- ALL {len(rows)} TRANSACTIONS ---")
print(f"{'Exec Time':<20} {'Symbol':<12} {'Act':>4} {'Quantity':>12} {'Rate':>10} {'Net Cash':>12} {'Comm':>10} {'Ccy'}")
print("-" * 95)
for r in rows:
    print(f"{r['execTime'][:19]:<20} {r['symbol']:<12} {(r['action'] or '-'):>4} {r['quantity']:>12,.4f} {(r['rate'] or 0):>10.4f} {(r['netCash'] or 0):>12,.2f} {(r['commission'] or 0):>10.2f} {r['currency'] or '-'}")
