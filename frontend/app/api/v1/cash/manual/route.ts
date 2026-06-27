import { NextRequest, NextResponse } from "next/server";
import { insertManualCash } from "@/lib/queries/cash";
import type { ManualCashInput } from "@/types";

function validate(t: unknown, i: number): ManualCashInput {
  const r = t as Record<string, unknown>;
  const execTime = String(r.execTime ?? "").trim();
  const symbol = String(r.symbol ?? "").trim();
  const quantity = Number(r.quantity);
  const action = r.action ? String(r.action).trim().toUpperCase() : null;

  if (!execTime) throw new Error(`Row ${i + 1}: execTime is required`);
  if (!symbol) throw new Error(`Row ${i + 1}: symbol is required`);
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error(`Row ${i + 1}: quantity must be a positive number`);
  if (action && action !== "BUY" && action !== "SELL")
    throw new Error(`Row ${i + 1}: action must be BUY, SELL, or empty`);

  return {
    execTime,
    symbol,
    quantity,
    rate: r.rate != null && r.rate !== "" ? Number(r.rate) : null,
    netCash: r.netCash != null && r.netCash !== "" ? Number(r.netCash) : null,
    action: (action as "BUY" | "SELL" | null) ?? null,
    description: r.description ? String(r.description) : null,
    commission:
      r.commission != null && r.commission !== "" ? Number(r.commission) : null,
    currency: r.currency ? String(r.currency) : undefined,
  };
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const list = Array.isArray(body) ? body : [body];
  if (list.length === 0)
    return NextResponse.json({ error: "No transactions provided" }, { status: 400 });

  let inputs: ManualCashInput[];
  try {
    inputs = list.map(validate);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Validation failed" },
      { status: 400 },
    );
  }

  try {
    const result = await insertManualCash(inputs);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Insert failed" },
      { status: 500 },
    );
  }
}
