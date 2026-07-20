-- Migration 010: trade_plans + scoring_rules (Pre-Entry Check feature)
--
-- trade_plans stores one saved pre-entry check: the as-of context snapshot,
-- the manual checklist answers, the computed score with a FROZEN copy of the
-- fired rules (so later rule edits never corrupt saved plans), and the
-- retrospective forward outcome when the check was done for a past timestamp.
-- No unique business key — the same symbol can be checked repeatedly.
-- linked_group_id/linked_entry_time reserve future linking to an executed
-- trade (same identity scheme as trade_journal); no linking UI in v1.

CREATE TABLE IF NOT EXISTS trade_plans (
  id                BIGSERIAL PRIMARY KEY,
  symbol            TEXT        NOT NULL,
  direction         TEXT        NOT NULL DEFAULT 'LONG',    -- LONG | SHORT
  planned_at        TIMESTAMPTZ NOT NULL,                   -- the as-of timestamp of the check
  ref_price         NUMERIC,                                -- possible entry price (NULL -> last close was used)
  status            TEXT        NOT NULL DEFAULT 'planned', -- planned | entered | skipped | expired
  schema_version    INTEGER     NOT NULL DEFAULT 1,
  context           JSONB,                                  -- PreEntryContext snapshot (camelCase)
  checklist         JSONB       NOT NULL DEFAULT '{}',      -- manual checklist answers (camelCase)
  score             NUMERIC,
  score_breakdown   JSONB,                                  -- ScoreResult: fired + skipped rules (frozen copy)
  forward_outcome   JSONB,                                  -- ForwardOutcome (retrospective checks only)
  notes             TEXT        NOT NULL DEFAULT '',
  linked_group_id   TEXT,
  linked_entry_time TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_plans_symbol     ON trade_plans(symbol);
CREATE INDEX IF NOT EXISTS idx_trade_plans_planned_at ON trade_plans(planned_at);
CREATE INDEX IF NOT EXISTS idx_trade_plans_status     ON trade_plans(status);

-- scoring_rules: user-editable, transparent scoring. conditions is an array of
-- {field, op, value?} predicates evaluated with AND semantics against the
-- curated fact catalog in lib/domain/scoring.ts (no free-form expressions).

CREATE TABLE IF NOT EXISTS scoring_rules (
  id          BIGSERIAL PRIMARY KEY,
  label       TEXT    NOT NULL,
  conditions  JSONB   NOT NULL,
  points      INTEGER NOT NULL,
  note        TEXT    NOT NULL DEFAULT '',
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed defaults only when the table is empty, so re-running the migration or
-- deleting individual rules never resurrects them.
INSERT INTO scoring_rules (label, conditions, points, note, sort_order)
SELECT * FROM (VALUES
  ('Above MA20 with supportive volume',
   '[{"field":"stockContext.aboveMa20","op":"isTrue"},{"field":"stockContext.relativeVolume","op":"gte","value":1.1}]'::jsonb,
   2,  'Trend + participation aligned', 1),
  ('Overextended from MA20',
   '[{"field":"stockContext.distanceFromMa20Pct","op":"gt","value":7}]'::jsonb,
   -3, 'Chasing — high snap-back risk', 2),
  ('VIX elevated against direction',
   '[{"field":"derived.vixAgainstDirection","op":"isTrue"}]'::jsonb,
   -3, 'Risk-off regime punishes this side', 3),
  ('Market bias supportive',
   '[{"field":"marketContext.marketSupportiveForTrade","op":"isTrue"}]'::jsonb,
   2,  'SPY+QQQ aligned with the trade', 4),
  ('Against prevailing trend',
   '[{"field":"derived.trendAgainstDirection","op":"isTrue"}]'::jsonb,
   -2, 'Fighting the MA stack', 5),
  ('Low conviction',
   '[{"field":"checklist.conviction","op":"lte","value":4}]'::jsonb,
   -1, 'If you don''t believe it, size down or skip', 6),
  ('Entered without confirmation',
   '[{"field":"checklist.entryConfirmation","op":"in","value":["Anticipating early (no confirmation)","FOMO / chasing"]}]'::jsonb,
   -2, 'The pattern hasn''t proven itself yet — wait for the close/volume', 7)
) AS seed(label, conditions, points, note, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM scoring_rules);
