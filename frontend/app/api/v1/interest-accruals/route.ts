import { NextRequest, NextResponse } from "next/server";
import { resolveRange } from "@/lib/domain/ranges";
import { fetchAccruals } from "@/lib/queries/interest-accruals";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const [start, end] = resolveRange(sp.get("range") ?? "90d");
  const data = await fetchAccruals(start, end);
  return NextResponse.json(data);
}
