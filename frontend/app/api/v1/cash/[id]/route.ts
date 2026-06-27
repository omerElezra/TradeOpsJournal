import { NextRequest, NextResponse } from "next/server";
import { deleteCash } from "@/lib/queries/cash";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const transactionId = decodeURIComponent(id);

  try {
    const result = await deleteCash(transactionId);
    if (!result.deleted)
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}
