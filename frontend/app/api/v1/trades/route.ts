import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { loadGroups, journalKey } from "@/lib/queries/trades";
import { rMultiple } from "@/lib/domain/metrics";
import type { GroupedTrade } from "@/lib/domain/models";

const SORT: Record<string, (t: ReturnType<typeof toDto>) => number | string> = {
  entryTime: t => t.entryTime,
  exitTime: t => t.exitTime ?? t.entryTime,
  netPnl: t => t.netPnl,
  returnPct: t => t.returnPct,
  symbol: t => t.symbol,
  side: t => t.side,
  result: t => t.result,
  qty: t => t.qty,
  avgEntry: t => t.avgEntry,
  rMultiple: t => t.rMultiple ?? -Infinity,
  holdingMinutes: t => t.holdingMinutes ?? -1,
};

function toDto(g: GroupedTrade, journal: Map<string, Record<string, unknown>>) {
  const jrow = journal.get(journalKey(g.symbol, g.entryTime));
  return {
    id: g.id,
    symbol: g.symbol,
    side: g.side,
    status: g.status,
    result: g.result,
    entryTime: g.entryTime.toISOString(),
    exitTime: g.exitTime?.toISOString() ?? null,
    qty: g.qty,
    avgEntry: g.avgEntry,
    avgExit: g.avgExit,
    netPnl: g.netPnl,
    realizedPnl: g.realizedPnl,
    commission: g.commission,
    returnPct: g.returnPct,
    rMultiple: rMultiple(g.netPnl, jrow?.risk_amount != null ? Number(jrow.risk_amount) : null),
    holdingMinutes: g.holdingMinutes,
    currency: g.currency,
    setup: (jrow?.setup as string | null) ?? null,
    psychTags: ((jrow?.psych_tags as string[] | null) ?? []),
    hasNotes: !!(jrow && String(jrow.notes ?? "").trim()),
  };
}

function encode(n: number) { return Buffer.from(String(n)).toString("base64url"); }
function decode(c: string | null) {
  if (!c) return 0;
  try { return parseInt(Buffer.from(c, "base64url").toString(), 10); } catch { return 0; }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range") ?? "90d");
  const [groups, journal] = await loadGroups(start, end);

  let items = groups.map(g => toDto(g, journal));

  const symbol = sp.get("symbol");
  const side = sp.get("side");
  const result = sp.get("result");
  if (symbol) items = items.filter(t => t.symbol.toUpperCase() === symbol.toUpperCase());
  if (side) items = items.filter(t => t.side === side.toUpperCase());
  if (result) items = items.filter(t => t.result === result.toUpperCase());

  const sort = sp.get("sort") ?? "entryTime";
  const desc = (sp.get("dir") ?? "desc").toLowerCase() === "desc";
  const keyFn = SORT[sort] ?? SORT.entryTime;
  items.sort((a, b) => {
    const ka = keyFn(a), kb = keyFn(b);
    return ka < kb ? (desc ? 1 : -1) : ka > kb ? (desc ? -1 : 1) : 0;
  });

  const offset = decode(sp.get("cursor"));
  const limit = Math.min(Number(sp.get("limit") ?? 25), 200);
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + limit;

  return NextResponse.json({
    data: page,
    nextCursor: nextOffset < items.length ? encode(nextOffset) : null,
    total: items.length,
  });
}
