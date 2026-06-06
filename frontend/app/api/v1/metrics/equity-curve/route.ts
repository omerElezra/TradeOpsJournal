import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { loadGroups } from "@/lib/queries/trades";
import { equityCurve } from "@/lib/domain/metrics";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range"), sp.get("from"), sp.get("to"));
  const [groups] = await loadGroups(start, end);

  return NextResponse.json(
    equityCurve(groups).map(p => ({
      t: p.t.toISOString(),
      equity: p.equity,
      drawdown: p.drawdown,
    })),
  );
}
