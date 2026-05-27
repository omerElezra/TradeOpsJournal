# Trading Journal

Automated trading journal for IBKR stock trades.

**Pipeline:** Gmail (IBKR CSV) → GitHub Actions (daily cron) → Supabase → Streamlit UI

## Project documentation

The project now has a full documentation set in [`docs/`](docs/):

| Document | Purpose |
|---|---|
| [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) | Current system status, implemented functionality, known gaps, and risks. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Current and target architecture for the future web app + AI coach. |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Supabase schema for current and future tables. |
| [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md) | Product requirements for the journal and future AI trading coach. |
| [`docs/PRODUCT_PLAN.md`](docs/PRODUCT_PLAN.md) | Milestones, tasks, risks, and traceability. |
| [`docs/AI_COACHING_VISION.md`](docs/AI_COACHING_VISION.md) | Future AI coach behavior, questions, recommendations, and safety boundaries. |

---

## Quick Start

### 1. Create the Supabase table

Run this SQL in your Supabase project's SQL editor:

```sql
CREATE TABLE trades (
  id              BIGSERIAL PRIMARY KEY,
  trade_id        TEXT UNIQUE NOT NULL,
  trade_date      DATE NOT NULL,
  exec_time       TIMESTAMPTZ NOT NULL,
  symbol          TEXT NOT NULL,
  action          TEXT NOT NULL CHECK (action IN ('BUY', 'SELL')),
  quantity        NUMERIC NOT NULL,
  price           NUMERIC NOT NULL,
  proceeds        NUMERIC,
  commission      NUMERIC,
  realized_pnl    NUMERIC,
  currency        TEXT DEFAULT 'USD',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_date   ON trades(trade_date);
CREATE INDEX idx_trades_exec_time ON trades(exec_time);
CREATE INDEX idx_trades_symbol ON trades(symbol);

CREATE TABLE cash_transactions (
  id                BIGSERIAL PRIMARY KEY,
  transaction_id    TEXT UNIQUE NOT NULL,
  transaction_date  DATE NOT NULL,
  exec_time         TIMESTAMPTZ NOT NULL,
  symbol            TEXT NOT NULL,
  description       TEXT,
  action            TEXT,
  currency          TEXT,
  quantity          NUMERIC NOT NULL,
  rate              NUMERIC,
  net_cash          NUMERIC,
  commission        NUMERIC,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cash_transactions_date ON cash_transactions(transaction_date);
CREATE INDEX idx_cash_transactions_exec_time ON cash_transactions(exec_time);
CREATE INDEX idx_cash_transactions_symbol ON cash_transactions(symbol);
```

See [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) for details and future tables planned for journaling and AI coaching.

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
