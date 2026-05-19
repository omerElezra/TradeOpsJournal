# Trading Journal

Automated trading journal for IBKR stock trades.

**Pipeline:** Gmail (IBKR CSV) → GitHub Actions (daily cron) → Supabase → Streamlit UI

---

## Quick Start

### 1. Create the Supabase table

Run this SQL in your Supabase project's SQL editor:

```sql
CREATE TABLE trades (
  id              BIGSERIAL PRIMARY KEY,
  trade_id        TEXT UNIQUE NOT NULL,
  trade_date      DATE NOT NULL,
  symbol          TEXT NOT NULL,
  action          TEXT NOT NULL,
  quantity        NUMERIC NOT NULL,
  price           NUMERIC NOT NULL,
  proceeds        NUMERIC,
  commission      NUMERIC,
  realized_pnl    NUMERIC,
  currency        TEXT DEFAULT 'USD',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_date   ON trades(trade_date);
CREATE INDEX idx_trades_symbol ON trades(symbol);
```

### 2. Get Gmail OAuth credentials (one-time)

1. Go to [Google Cloud Console](https://console.cloud.google.com) → Create project → Enable **Gmail API**
2. Create **OAuth 2.0 Client ID** (type: Desktop) → download as `scripts/credentials.json`
3. Run the helper to get your refresh token:
   ```bash
   pip install -r requirements.txt
   python scripts/get_gmail_token.py
   ```
4. Copy the printed `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`

### 3. Set up environment

```bash
cp .env.example .env
# Fill in all 5 values in .env
```

### 4. Test ingestion locally

```bash
python scripts/ingest.py
```

### 5. Run the UI

```bash
streamlit run app/streamlit_app.py
```

---

## GitHub Actions (automated daily ingestion)

Add these secrets to your GitHub repo (`Settings → Secrets → Actions`):

| Secret | Source |
|---|---|
| `GMAIL_CLIENT_ID` | Google Cloud Console |
| `GMAIL_CLIENT_SECRET` | Google Cloud Console |
| `GMAIL_REFRESH_TOKEN` | `python scripts/get_gmail_token.py` |
| `SUPABASE_URL` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API (service_role) |

The workflow runs Mon–Fri at 08:00 UTC. Trigger it manually anytime via **Actions → Daily IBKR Trade Ingestion → Run workflow**.

---

## Deploy UI (optional)

Push this repo to GitHub, then connect it to [Streamlit Community Cloud](https://streamlit.io/cloud). Add your `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in the Streamlit secrets dashboard.
