import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { fetchCashPage } from "@/lib/queries/cash";

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

  const [rows, total] = await fetchCashPage(
    start, end, offset, limit,
    sp.get("sort") ?? "execTime",
    sp.get("dir") ?? "desc",
    sp.get("symbol") ?? undefined,
  );

  const data = rows.map(r => ({
    transactionId: String(r.transaction_id),
    execTime: String(r.exec_time),
    symbol: String(r.symbol),
    description: r.description ? String(r.description) : null,
    action: r.action ? String(r.action) : null,
    currency: r.currency ? String(r.currency) : null,
    quantity: Number(r.quantity),
    rate: r.rate != null ? Number(r.rate) : null,
    netCash: r.net_cash != null ? Number(r.net_cash) : null,
    commission: r.commission != null ? Number(r.commission) : null,
    txnType: Number(r.quantity ?? 0) > 50 ? "deposit" : "sweep",
  }));

  const nextOffset = offset + limit;
  return NextResponse.json({
    data,
    nextCursor: nextOffset < total ? encode(nextOffset) : null,
    total,
  });
}
