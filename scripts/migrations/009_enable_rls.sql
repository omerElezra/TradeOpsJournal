-- 009: Enable row level security on all application tables.
--
-- All application access goes through the service_role key (GitHub Action
-- ingest + Next.js server-side queries), which bypasses RLS. The browser
-- anon key is used only for auth, never for table access. Enabling RLS with
-- no policies therefore blocks direct PostgREST access with the public anon
-- key without affecting the app.
--
-- If a client-side (anon/authenticated) query is ever added later, it will
-- need an explicit CREATE POLICY on the table it reads.

ALTER TABLE public.trades               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_transactions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_accruals    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_journal        ENABLE ROW LEVEL SECURITY;
