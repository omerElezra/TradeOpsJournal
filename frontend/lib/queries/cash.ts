import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

const CASH_COL: Record<string, string> = {
  execTime: "exec_time",
  symbol: "symbol",
  quantity: "quantity",
  netCash: "net_cash",
  commission: "commission",
  rate: "rate",
};

function r(n: number, d: number) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

export async function fetchCashPage(
  start: Date,
  end: Date,
  offset = 0,
  limit = 50,
  sort = "execTime",
  dir = "desc",
  symbol?: string,
): Promise<[Record<string, unknown>[], number]> {
  const db = getSupabaseAdmin();
  const col = CASH_COL[sort] ?? "exec_time";

  let q = db
    .from("cash_transactions")
    .select(
      "transaction_id, exec_time, symbol, description, action, currency, quantity, rate, net_cash, commission",
      { count: "exact" },
    )
    .gte("exec_time", start.toISOString())
    .lte("exec_time", end.toISOString())
    .order(col, { ascending: dir.toLowerCase() === "asc" })
    .range(offset, offset + limit - 1);

  if (symbol) q = q.ilike("symbol", `%${symbol}%`);

  const { data, count, error } = await q;
  if (error) throw new Error(`fetchCashPage: ${error.message}`);
  return [(data ?? []) as Record<string, unknown>[], count ?? 0];
}

export async function fetchCashSummary(
  start: Date,
  end: Date,
): Promise<Record<string, unknown>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("cash_transactions")
    .select("quantity, rate, net_cash, commission, symbol, currency")
    .gte("exec_time", start.toISOString())
    .lte("exec_time", end.toISOString());

  if (error) throw new Error(`fetchCashSummary: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];

  let totalNet = 0, totalInflows = 0, totalOutflows = 0, totalCommission = 0, totalDepositedUsd = 0;
  for (const row of rows) {
    const nc = Number(row.net_cash ?? 0);
    totalNet += nc;
    if (nc > 0) totalInflows += nc; else totalOutflows += nc;
    totalCommission += Number(row.commission ?? 0);
    const qty = Number(row.quantity ?? 0);
    const rate = Number(row.rate ?? 0);
    if (qty > 50 && String(row.symbol ?? "").toUpperCase().includes(".ILS")) {
      totalDepositedUsd += rate > 0 ? qty / rate : 0;
    }
  }

  return {
    totalTransactions: rows.length,
    netCash: r(totalNet, 2),
    totalInflows: r(totalInflows, 2),
    totalOutflows: r(totalOutflows, 2),
    totalCommission: r(totalCommission, 2),
    totalDepositedUsd: r(totalDepositedUsd, 2),
  };
}
