import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { fetchAccountTxnSummary } from "@/lib/queries/account-transactions";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range") ?? "90d");
  const summary = await fetchAccountTxnSummary(start, end);
  return NextResponse.json(summary);
}
