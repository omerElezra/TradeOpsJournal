import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { fetchTransactionsSummary } from "@/lib/queries/cash";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range") ?? "all");
  return NextResponse.json(await fetchTransactionsSummary(start, end));
}
