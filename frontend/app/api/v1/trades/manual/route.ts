import { NextRequest, NextResponse } from "next/server";
import { insertManualTrades } from "@/lib/queries/trades";
import type { ManualTradeInput } from "@/types";

function validate(t: unknown, i: number): ManualTradeInput {
  const r = t as Record<string, unknown>;
  const execTime = String(r.execTime ?? "").trim();
  const symbol = String(r.symbol ?? "").trim();
  const action = String(r.action ?? "").trim().toUpperCase();
  const quantity = Number(r.quantity);
  const price = Number(r.price);

  if (!execTime) throw new Error(`Row ${i + 1}: execTime is required`);
  if (!symbol) throw new Error(`Row ${i + 1}: symbol is required`);
  if (action !== "BUY" && action !== "SELL")
    throw new Error(`Row ${i + 1}: action must be BUY or SELL`);
  if (!Number.isFinite(quantity) || quantity <= 0)
    throw new Error(`Row ${i + 1}: quantity must be a positive number`);
  if (!Number.isFinite(price) || price <= 0)
    throw new Error(`Row ${i + 1}: price must be a positive number`);

  return {
    execTime,
    symbol,
    action: action as "BUY" | "SELL",
    quantity,
    price,
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
    return NextResponse.json({ error: "No trades provided" }, { status: 400 });

  let inputs: ManualTradeInput[];
  try {
    inputs = list.map(validate);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Validation failed" },
      { status: 400 },
    );
  }

  try {
    const result = await insertManualTrades(inputs);
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Insert failed" },
      { status: 500 },
    );
  }
}
