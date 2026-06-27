import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { groupExecutions } from "@/lib/domain/grouping";
import { canonExecTime, tradeContentHash } from "@/lib/hash";
import type { GroupedTrade, RawExecution } from "@/lib/domain/models";
import type { ManualTradeInput, ManualInsertResult, DeleteResult, TxnSource } from "@/types";

// Normalize a Date to seconds-precision key to avoid microsecond mismatches
// between exec_time stored in the trades table and entry_time in trade_journal
function tsKey(d: Date): string {
  return Math.floor(d.getTime() / 1000).toString();
}

export function journalKey(symbol: string, entryTime: Date): string {
  return `${symbol}|${tsKey(entryTime)}`;
}

export async function fetchExecutions(start: Date, end: Date): Promise<RawExecution[]> {
  const db = getSupabaseAdmin();
  const rows: Record<string, unknown>[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await db
      .from("trades")
      .select(
        "trade_id, exec_time, symbol, action, quantity, price, proceeds, commission, realized_pnl, currency",
      )
      .gte("exec_time", start.toISOString())
      .lte("exec_time", end.toISOString())
      .order("exec_time")
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`fetchExecutions: ${error.message}`);
    const batch = (data ?? []) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return rows.map(toRawExecution);
}

const EXEC_COL: Record<string, string> = {
  execTime: "exec_time",
  symbol: "symbol",
  action: "action",
  quantity: "quantity",
  price: "price",
  proceeds: "proceeds",
  commission: "commission",
  realizedPnl: "realized_pnl",
};

export async function fetchExecutionsPage(
  start: Date,
  end: Date,
  offset = 0,
  limit = 50,
  sort = "execTime",
  dir = "desc",
  symbol?: string,
  action?: string,
): Promise<[Record<string, unknown>[], number]> {
  const db = getSupabaseAdmin();
  const col = EXEC_COL[sort] ?? "exec_time";

  let q = db
    .from("trades")
    .select(
      "trade_id, exec_time, symbol, action, quantity, price, proceeds, commission, realized_pnl, currency, source",
      { count: "exact" },
    )
    .gte("exec_time", start.toISOString())
    .lte("exec_time", end.toISOString())
    .order(col, { ascending: dir.toLowerCase() === "asc" })
    .range(offset, offset + limit - 1);

  if (symbol) q = q.eq("symbol", symbol.toUpperCase());
  if (action) q = q.eq("action", action.toUpperCase());

  const { data, count, error } = await q;
  if (error) throw new Error(`fetchExecutionsPage: ${error.message}`);
  return [(data ?? []) as Record<string, unknown>[], count ?? 0];
}

export async function fetchJournalMap(
  start: Date,
  end: Date,
): Promise<Map<string, Record<string, unknown>>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("trade_journal")
    .select("*")
    .gte("entry_time", start.toISOString())
    .lte("entry_time", end.toISOString());

  if (error) throw new Error(`fetchJournalMap: ${error.message}`);
  const map = new Map<string, Record<string, unknown>>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const key = journalKey(String(row.symbol), new Date(String(row.entry_time)));
    map.set(key, row);
  }
  return map;
}

export async function upsertJournal(
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("trade_journal")
    .upsert(payload, { onConflict: "symbol,entry_time" })
    .select()
    .single();
  if (error) throw new Error(`upsertJournal: ${error.message}`);
  return data as Record<string, unknown>;
}

export async function loadGroups(
  start: Date,
  end: Date,
): Promise<[GroupedTrade[], Map<string, Record<string, unknown>>]> {
  // Fetch ALL executions up to end so trades that opened before the range
  // start still group correctly (e.g. a trade opened 40d ago but closed 28d
  // ago won't be seen as OPEN when the user selects a 30d range).
  const [execs, journal] = await Promise.all([
    fetchExecutions(new Date(0), end),
    fetchJournalMap(start, end),
  ]);

  const allGroups = groupExecutions(execs);

  // Keep only trades that were active during [start, end]:
  //   - still open (position was open at some point up to end), OR
  //   - closed and the exit falls within or after range start
  const groups = allGroups.filter(
    (g) =>
      g.entryTime <= end &&
      (g.status === "OPEN" || (g.exitTime !== null && g.exitTime >= start)),
  );

  return [groups, journal];
}

export async function insertManualTrades(
  inputs: ManualTradeInput[],
): Promise<ManualInsertResult> {
  const db = getSupabaseAdmin();

  const rows = inputs.map((t) => {
    const execTime = canonExecTime(t.execTime);
    const symbol = t.symbol.trim().toUpperCase();
    const quantity = Math.abs(Number(t.quantity));
    const price = Number(t.price);
    const contentHash = tradeContentHash(execTime, symbol, quantity, price);
    return {
      trade_id: contentHash,
      content_hash: contentHash,
      source: "manual" as const,
      trade_date: execTime.slice(0, 10),
      exec_time: execTime,
      symbol,
      action: t.action.toUpperCase(),
      quantity,
      price,
      proceeds: null,
      commission: t.commission != null ? Number(t.commission) : null,
      realized_pnl: null,
      currency: t.currency?.trim() || "USD",
    };
  });

  // Which fingerprints already exist? Those are skipped (idempotent).
  const hashes = rows.map((r) => r.content_hash);
  const { data: existing, error: selErr } = await db
    .from("trades")
    .select("content_hash")
    .in("content_hash", hashes);
  if (selErr) throw new Error(`insertManualTrades select: ${selErr.message}`);
  const existingHashes = new Set((existing ?? []).map((r) => String(r.content_hash)));

  // De-dupe within the submitted batch too.
  const seen = new Set<string>();
  const toInsert = rows.filter((r) => {
    if (existingHashes.has(r.content_hash) || seen.has(r.content_hash)) return false;
    seen.add(r.content_hash);
    return true;
  });

  if (toInsert.length) {
    const { error } = await db.from("trades").insert(toInsert);
    if (error) throw new Error(`insertManualTrades insert: ${error.message}`);
  }

  return { inserted: toInsert.length, skipped: rows.length - toInsert.length };
}

export async function deleteExecution(tradeId: string): Promise<DeleteResult> {
  const db = getSupabaseAdmin();
  const { data: existing, error: selErr } = await db
    .from("trades")
    .select("source")
    .eq("trade_id", tradeId)
    .maybeSingle();
  if (selErr) throw new Error(`deleteExecution select: ${selErr.message}`);
  if (!existing) return { deleted: false, source: "ibkr" };

  const { error } = await db.from("trades").delete().eq("trade_id", tradeId);
  if (error) throw new Error(`deleteExecution delete: ${error.message}`);
  return { deleted: true, source: (String(existing.source) as TxnSource) ?? "ibkr" };
}

function toRawExecution(r: Record<string, unknown>): RawExecution {
  return {
    tradeId: String(r.trade_id),
    execTime: new Date(String(r.exec_time)),
    symbol: String(r.symbol),
    action: String(r.action) as "BUY" | "SELL",
    quantity: Number(r.quantity),
    price: Number(r.price),
    proceeds: r.proceeds != null ? Number(r.proceeds) : null,
    commission: r.commission != null ? Number(r.commission) : null,
    realizedPnl: r.realized_pnl != null ? Number(r.realized_pnl) : null,
    currency: String(r.currency ?? "USD"),
  };
}
