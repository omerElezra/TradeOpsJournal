import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { fetchCashSummary } from "@/lib/queries/cash";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range") ?? "90d");
  return NextResponse.json(await fetchCashSummary(start, end));
}
