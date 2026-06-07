import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { loadGroups, journalKey } from "@/lib/queries/trades";
import { buildAnnotatedTrade, computePerformanceReport } from "@/lib/domain/performance";
import type { PerformanceFilter } from "@/lib/domain/performance";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range"), sp.get("from"), sp.get("to"));

  const [groups, journal] = await loadGroups(start, end);

  const annotated = groups.map(g =>
    buildAnnotatedTrade(g, journal.get(journalKey(g.symbol, g.entryTime))),
  );

  const filter: PerformanceFilter = {};
  const setup = sp.get("setup");
  const side = sp.get("side");
  if (setup) filter.setup = setup;
  if (side === "LONG" || side === "SHORT") filter.side = side;

  const report = computePerformanceReport(annotated, filter);

  return NextResponse.json(report);
}
