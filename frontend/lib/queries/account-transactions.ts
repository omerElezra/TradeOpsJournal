import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

// Normalized category slug → human label. Mirrors CTRN_CATEGORY in scripts/ingest.py.
export const CATEGORY_LABEL: Record<string, string> = {
  dividend: "Dividend",
  withholding_tax: "Withholding Tax",
  interest_paid: "Interest Paid",
  interest_received: "Interest Received",
  deposit_withdrawal: "Deposit / Withdrawal",
  fee: "Fee",
  other: "Other",
};

export function categoryLabel(slug: string): string {
  return CATEGORY_LABEL[slug] ?? slug;
}

const SELECT_COLS =
  "transaction_id, datetime, symbol, description, currency, amount, type, category, source";

export async function fetchAccountTxnPage(
  start: Date,
  end: Date,
  offset = 0,
  limit = 50,
  category?: string,
  symbol?: string,
): Promise<[Record<string, unknown>[], number]> {
  const db = getSupabaseAdmin();

  let q = db
    .from("account_transactions")
    .select(SELECT_COLS, { count: "exact" })
    .gte("datetime", start.toISOString())
    .lte("datetime", end.toISOString())
    .order("datetime", { ascending: false })
    .range(offset, offset + limit - 1);

  if (category) q = q.eq("category", category);
  if (symbol) q = q.ilike("symbol", `%${symbol}%`);

  const { data, count, error } = await q;
  if (error) throw new Error(`fetchAccountTxnPage: ${error.message}`);
  return [(data ?? []) as Record<string, unknown>[], count ?? 0];
}

function r(n: number, d: number) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export async function fetchAccountTxnSummary(
  start: Date,
  end: Date,
): Promise<Record<string, unknown>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("account_transactions")
    .select("category, currency, amount")
    .gte("datetime", start.toISOString())
    .lte("datetime", end.toISOString());

  if (error) throw new Error(`fetchAccountTxnSummary: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];

  // Aggregate per (category, currency) — amounts in different currencies must
  // not be summed together (e.g. ILS deposits vs USD dividends).
  const buckets = new Map<string, { category: string; currency: string; count: number; total: number }>();
  for (const row of rows) {
    const category = String(row.category ?? "other");
    const currency = String(row.currency ?? "—");
    const amount = Number(row.amount ?? 0);
    const key = `${category}|${currency}`;
    const b = buckets.get(key) ?? { category, currency, count: 0, total: 0 };
    b.count += 1;
    b.total += amount;
    buckets.set(key, b);
  }

  const byCategory = Array.from(buckets.values())
    .map((b) => ({
      category: b.category,
      label: categoryLabel(b.category),
      currency: b.currency,
      count: b.count,
      total: r(b.total, 2),
    }))
    .sort((a, b) => a.label.localeCompare(b.label) || a.currency.localeCompare(b.currency));

  return { byCategory, totalRows: rows.length };
}
