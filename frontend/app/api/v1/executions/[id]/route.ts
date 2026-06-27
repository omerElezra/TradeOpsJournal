import { NextRequest, NextResponse } from "next/server";
import { deleteExecution } from "@/lib/queries/trades";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const tradeId = decodeURIComponent(id);

  try {
    const result = await deleteExecution(tradeId);
    if (!result.deleted)
      return NextResponse.json({ error: "Execution not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}
