-- Migration 008: link trade_journal rows to their executions
-- Snapshot columns refreshed server-side on every journal save: the computed
-- round-trip group id and the trade_ids of the member executions. Lets SQL
-- join a journal straight to its fills without re-running grouping, and lets
-- an orphaned journal be re-attached via any member execution.
-- Safe to run on existing databases.

ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS group_id      TEXT;
ALTER TABLE trade_journal ADD COLUMN IF NOT EXISTS execution_ids TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_trade_journal_group_id ON trade_journal(group_id);
