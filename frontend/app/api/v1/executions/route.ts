import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { fetchExecutionsPage } from "@/lib/queries/trades";

function encode(n: number) { return Buffer.from(String(n)).toString("base64url"); }
function decode(c: string | null) {
  if (!c) return 0;
  try { return parseInt(Buffer.from(c, "base64url").toString(), 10); } catch { return 0; }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range") ?? "90d");
  const offset = decode(sp.get("cursor"));
  const limit = Math.min(Number(sp.get("limit") ?? 50), 200);

  const [rows, total] = await fetchExecutionsPage(
    start, end, offset, limit,
    sp.get("sort") ?? "execTime",
    sp.get("dir") ?? "desc",
    sp.get("symbol") ?? undefined,
    sp.get("action") ?? undefined,
  );

  const data = rows.map(r => ({
    tradeId: String(r.trade_id),
    execTime: String(r.exec_time),
    symbol: String(r.symbol),
    action: r.action,
    quantity: Number(r.quantity),
    price: Number(r.price),
    proceeds: r.proceeds != null ? Number(r.proceeds) : null,
    commission: r.commission != null ? Number(r.commission) : null,
    realizedPnl: r.realized_pnl != null ? Number(r.realized_pnl) : null,
    currency: String(r.currency ?? "USD"),
    source: (r.source === "manual" ? "manual" : "ibkr"),
  }));

  const nextOffset = offset + limit;
  return NextResponse.json({
    data,
    nextCursor: nextOffset < total ? encode(nextOffset) : null,
    total,
  });
}
