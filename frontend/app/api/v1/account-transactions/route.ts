import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { fetchAccountTxnPage, categoryLabel } from "@/lib/queries/account-transactions";

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

  const [rows, total] = await fetchAccountTxnPage(
    start, end, offset, limit,
    sp.get("category") ?? undefined,
    sp.get("symbol") ?? undefined,
  );

  const data = rows.map(r => ({
    transactionId: String(r.transaction_id),
    datetime: String(r.datetime),
    symbol: r.symbol ? String(r.symbol) : null,
    description: r.description ? String(r.description) : null,
    currency: r.currency ? String(r.currency) : null,
    amount: Number(r.amount),
    type: r.type ? String(r.type) : null,
    category: String(r.category ?? "other"),
    categoryLabel: categoryLabel(String(r.category ?? "other")),
    source: (r.source === "manual" ? "manual" : "ibkr"),
  }));

  const nextOffset = offset + limit;
  return NextResponse.json({
    data,
    nextCursor: nextOffset < total ? encode(nextOffset) : null,
    total,
  });
}
