import { NextRequest, NextResponse } from "next/server";
import { upsertJournal } from "@/lib/queries/trades";

export async function POST(request: NextRequest) {
  const body = await request.json() as Record<string, unknown>;
  const row = await upsertJournal({
    symbol: body.symbol,
    entry_time: body.entryTime,
    setup: body.setup ?? null,
    psych_tags: body.psychTags ?? [],
    notes: body.notes ?? "",
    planned_stop: body.plannedStop ?? null,
    planned_target: body.plannedTarget ?? null,
    risk_amount: body.riskAmount ?? null,
  });

  return NextResponse.json({
    id: row.id,
    symbol: String(row.symbol),
    entryTime: String(row.entry_time),
    setup: (row.setup as string | null) ?? null,
    psychTags: ((row.psych_tags as string[] | null) ?? []),
    notes: String(row.notes ?? ""),
    plannedStop: row.planned_stop != null ? Number(row.planned_stop) : null,
    plannedTarget: row.planned_target != null ? Number(row.planned_target) : null,
    riskAmount: row.risk_amount != null ? Number(row.risk_amount) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  });
}
