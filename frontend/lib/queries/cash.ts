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

function isDeposit(row: Record<string, unknown>): boolean {
  const qty = Number(row.quantity ?? 0);
  const sym = String(row.symbol ?? "").toUpperCase();
  return qty > 50 && sym.includes(".ILS");
}

function isSweep(row: Record<string, unknown>): boolean {
  return !isDeposit(row);
}

export async function fetchCashSummary(
  start: Date,
  end: Date,
): Promise<Record<string, unknown>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("cash_transactions")
    .select("quantity, rate, net_cash, commission, symbol, currency, exec_time")
    .gte("exec_time", start.toISOString())
    .lte("exec_time", end.toISOString())
    .order("exec_time", { ascending: true });

  if (error) throw new Error(`fetchCashSummary: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];

  let totalDepositedUsd = 0;
  let totalDepositedIls = 0;
  let totalWithdrawnUsd = 0;
  let totalWithdrawnIls = 0;
  let cashFxCommission = 0;
  let depositCount = 0;
  let withdrawalCount = 0;
  let sweepCount = 0;
  let firstDepositDate: string | null = null;
  let lastDepositDate: string | null = null;

  for (const row of rows) {
    const qty = Number(row.quantity ?? 0);
    const rate = Number(row.rate ?? 0);
    const commission = Number(row.commission ?? 0);
    const execTime = String(row.exec_time ?? "");

    cashFxCommission += commission;

    if (isDeposit(row)) {
      // qty = USD amount, rate = USD/ILS rate
      const usd = Math.abs(qty);
      const ils = Math.abs(qty * rate);
      totalDepositedUsd += usd;
      totalDepositedIls += ils;
      depositCount++;
      if (!firstDepositDate) firstDepositDate = execTime;
      lastDepositDate = execTime;
    } else if (isSweep(row)) {
      sweepCount++;
    }
    // Withdrawals: no withdrawal rows currently observed; handle if qty < 0
    if (qty < 0 && isDeposit(row)) {
      totalWithdrawnUsd += Math.abs(qty);
      totalWithdrawnIls += Math.abs(qty * rate);
      withdrawalCount++;
    }
  }

  const netDepositedUsd = totalDepositedUsd - totalWithdrawnUsd;
  const netDepositedIls = totalDepositedIls - totalWithdrawnIls;
  const avgDepositUsd = depositCount > 0 ? totalDepositedUsd / depositCount : 0;

  return {
    totalDepositedUsd: r(totalDepositedUsd, 2),
    totalDepositedIls: r(totalDepositedIls, 2),
    totalWithdrawnUsd: r(totalWithdrawnUsd, 2),
    totalWithdrawnIls: r(totalWithdrawnIls, 2),
    netDepositedUsd: r(netDepositedUsd, 2),
    netDepositedIls: r(netDepositedIls, 2),
    cashFxCommissionPaid: r(Math.abs(cashFxCommission), 2),
    depositCount,
    withdrawalCount,
    sweepCount,
    avgDepositUsd: r(avgDepositUsd, 2),
    firstDepositDate: firstDepositDate || null,
    lastDepositDate: lastDepositDate || null,
  };
}

export async function fetchTransactionsSummary(
  start: Date,
  end: Date,
): Promise<Record<string, unknown>> {
  const db = getSupabaseAdmin();

  const [tradesResult, cashResult] = await Promise.all([
    db
      .from("trades")
      .select("commission, exec_time", { count: "exact" })
      .gte("exec_time", start.toISOString())
      .lte("exec_time", end.toISOString())
      .order("exec_time", { ascending: false })
      .limit(1),
    db
      .from("cash_transactions")
      .select("quantity, symbol, commission, exec_time", { count: "exact" })
      .gte("exec_time", start.toISOString())
      .lte("exec_time", end.toISOString()),
  ]);

  if (tradesResult.error) throw new Error(`fetchTransactionsSummary trades: ${tradesResult.error.message}`);
  if (cashResult.error) throw new Error(`fetchTransactionsSummary cash: ${cashResult.error.message}`);

  const tradeCount = tradesResult.count ?? 0;
  const cashRows = (cashResult.data ?? []) as Record<string, unknown>[];
  const cashCount = cashResult.count ?? 0;

  let depositRows = 0;
  let sweepRows = 0;
  let cashCommissionRows = 0;
  let lastCashDate: string | null = null;

  for (const row of cashRows) {
    if (isDeposit(row)) depositRows++; else sweepRows++;
    if (Number(row.commission ?? 0) !== 0) cashCommissionRows++;
    const t = String(row.exec_time ?? "");
    if (t && (!lastCashDate || t > lastCashDate)) lastCashDate = t;
  }

  const lastTradeDate = tradesResult.data?.[0]
    ? String(tradesResult.data[0].exec_time ?? "")
    : null;
  const lastImportDate = [lastTradeDate, lastCashDate]
    .filter(Boolean)
    .sort()
    .pop() ?? null;

  return {
    importedRows: tradeCount + cashCount,
    tradeRows: tradeCount,
    cashRows: cashCount,
    depositRows,
    sweepRows,
    commissionRows: cashCommissionRows,
    lastImportDate,
  };
}
