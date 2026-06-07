# TradeOpsJournal

Personal trading journal for IBKR stock trades — always accessible from laptop and phone.

**Stack:** Next.js (Vercel) · Supabase (PostgreSQL) · GitHub Actions (IBKR ingestion)

---

## Architecture

```
IBKR Activity Flex CSV
        │
        ▼
   Gmail Inbox
        │
        ▼
GitHub Actions (daily cron)
        │
        ▼
 scripts/ingest.py
        │
        ▼
   Supabase DB
   (trades, cash_transactions, trade_journal)
        │
        ▼
  Next.js (Vercel)
  /api/v1/* route handlers → domain logic → JSON
        │
        ▼
  React UI (browser / phone PWA)
```

The Next.js app handles everything: API routes run server-side TypeScript that queries Supabase directly, groups FIFO trades, computes KPIs, and serves JSON to the React frontend. There is no separate backend.

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+

### 1. Clone and install

```bash
git clone https://github.com/omerElezra/TradeOpsJournal.git
cd TradeOpsJournal/frontend
npm install
```

### 2. Set environment variables

```bash
cp frontend/.env.example frontend/.env.local
# Fill in SUPABASE_URL and SUPABASE_SERVICE_KEY
```

See the [Supabase setup](#supabase-setup) section below.

### 3. Run the app

```bash
cd frontend
npm run dev
# → http://localhost:3000
```

### 4. Run ingestion locally (optional)

```bash
pip install -r requirements.txt
python scripts/ingest.py
```

---

## Deploy to Vercel

1. Push to GitHub.
2. Go to [vercel.com](https://vercel.com) → **New Project** → import repo.
3. Set **Root Directory** to `frontend`.
4. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
5. Deploy → you get a permanent URL like `https://tradeopsjournal.vercel.app`.

**Phone:** open the URL in Safari → Share → **Add to Home Screen** to install as a PWA.

---

## GitHub Actions — Automated Ingestion

The workflow at `.github/workflows/daily_ingest.yml` runs Mon–Fri at 08:00 UTC.

Add these secrets to your GitHub repo (`Settings → Secrets → Actions`):

| Secret | Source |
|---|---|
| `GMAIL_CLIENT_ID` | Google Cloud Console |
| `GMAIL_CLIENT_SECRET` | Google Cloud Console |
| `GMAIL_REFRESH_TOKEN` | `python scripts/get_gmail_token.py` |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API (service_role) |

Trigger manually at any time via **Actions → Daily IBKR Trade Ingestion → Run workflow**.

---

## Supabase Setup

Run these migrations in the Supabase SQL editor:

```bash
# Apply via script (uses SUPABASE_URL + SUPABASE_ACCESS_TOKEN env vars)
python scripts/run_migration.py scripts/migrations/001_trade_journal.sql
python scripts/run_migration.py scripts/migrations/002_journal_risk_fields.sql
```

Or paste the SQL files directly in the Supabase dashboard. See [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) for the full schema.

---

## Gmail OAuth Setup (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → create project → enable **Gmail API**.
2. Create **OAuth 2.0 Client ID** (type: Desktop) → download as `scripts/credentials.json`.
3. Run the helper:
   ```bash
   python scripts/get_gmail_token.py
   ```
4. Copy the printed `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` into your `.env`.

---

## Documentation

| Document | Purpose |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System architecture, data flow, component responsibilities |
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) | What is implemented, what is not, known gaps |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Supabase schema — all tables and columns |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Product requirements |
| [`docs/AI_COACHING_VISION.md`](docs/AI_COACHING_VISION.md) | Future AI coach concept |
| [`archive/`](archive/) | Superseded code: Streamlit app, FastAPI backend, Docker files |
