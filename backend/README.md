# TradeOpsJournal — Backend (FastAPI)

The analytics "brain". Reads raw executions from Supabase, groups them into
round-trip trades, and computes all KPIs. The frontend never calculates a metric.

## Layout

```
app/
  main.py                # FastAPI app + CORS + routers
  core/
    config.py            # env settings (SUPABASE_URL, SUPABASE_SERVICE_KEY, ...)
    ranges.py            # range-key -> UTC window
  db/
    supabase_client.py   # service-role client (server-side only)
    queries.py           # reads: trades, trade_journal; upsert journal
  domain/                # PURE logic (no DB, no FastAPI) — unit tested
    grouping.py          # executions -> round-trip GroupedTrade (FIFO + VWAP)
    metrics.py           # win rate, profit factor, ROI, expectancy, drawdown
    models.py            # Pydantic DTOs (camelCase JSON for the UI)
  routers/
    metrics.py           # /api/v1/metrics/summary, /equity-curve
    trades.py            # /api/v1/trades (paginated), /trades/{id}
    journal.py           # /api/v1/journal (upsert)
    insights.py          # /api/v1/insights (mock today)
  services/
    trades_service.py    # DB reads + domain logic -> DTOs
    ai_coach.py          # mock insights; LLM later
tests/
  test_grouping.py
  test_metrics.py
```

## Setup

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # fill SUPABASE_URL + SUPABASE_SERVICE_KEY
```

## Run

```bash
uvicorn app.main:app --reload --port 8000
# docs: http://localhost:8000/docs
```

## Test

```bash
pytest -q
```

The `domain/` modules are pure (stdlib only), so the grouping/metrics tests run
without any third-party dependencies.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | liveness + db-configured flag |
| GET | `/api/v1/metrics/summary?range=30d` | KPI cards |
| GET | `/api/v1/metrics/equity-curve?range=30d` | equity series |
| GET | `/api/v1/trades?range=90d&sort=netPnl&dir=desc` | paginated round-trips |
| GET | `/api/v1/trades/{id}` | single trade + executions + markers |
| POST | `/api/v1/journal` | upsert notes/tags/risk |
| GET | `/api/v1/insights?range=90d` | AI insights (mock) |
