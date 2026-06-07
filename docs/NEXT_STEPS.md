# Next Steps

## 1. Add Authentication

**Status:** Not started.

The app is currently unprotected — anyone with the URL can read it. Since this is a single-user private app, the easiest options are:

- **Vercel password protection** (one-click in Vercel dashboard, Vercel Pro required)
- **Supabase Auth** — add a login page, protect route handlers with `requireUser()`, enable Row Level Security on all tables

The `lib/auth/` directory is a good place to add a `requireUser.ts` helper.

## 2. Equity Curve Chart

**Status:** `EquityCurveCard` renders a placeholder.

Install Recharts and build the actual chart:

```bash
cd frontend && npm install recharts
```

The data is already served by `GET /api/v1/metrics/equity-curve`.

## 3. PWA Icons

**Status:** `public/manifest.json` references `/icons/icon-192.png` and `/icons/icon-512.png` — these files do not exist yet.

Add 192×192 and 512×512 PNG icons to `frontend/public/icons/` so the "Add to Home Screen" install looks correct.

## 4. AI Insights Backend

**Status:** `/api/v1/insights` returns an empty array (stub).

When enough journal entries exist:

1. Create an `ai_insights` table in Supabase (see `docs/DATA_MODEL.md`).
2. Build an insight generator — start with deterministic rules (e.g. "you lose more on Fridays"), then connect an LLM.
3. Write generated insights to `ai_insights`.
4. Return them from the `/api/v1/insights` route.

## 5. Journal UI Completeness

**Status:** Basic fields (setup, psych tags, notes, risk amount) work via `POST /api/v1/journal`.

Still missing from the UI:
- Post-trade review form with structured fields.
- Screenshot / chart attachment upload.
- Pre-trade plan vs actual comparison.

## 6. Analytics Pages

**Status:** `/analytics` page is a placeholder (`145 B`).

Suggested charts to build:
- P&L by setup type.
- Win rate by day of week / time of day.
- Hold time vs outcome.
- Recurring mistake tags frequency.
- P&L by psychological tag.

## 7. Short Selling Support

**Status:** Trade grouping assumes longs. SHORT trades may not group correctly if position goes negative.

The `grouping.ts` `_signed` function correctly handles sign, but `result` and `avgEntry`/`avgExit` labels need validation against real short trade data.
