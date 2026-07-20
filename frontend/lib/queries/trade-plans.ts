import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type {
  ForwardOutcome,
  PreEntryContext,
  TradePlanRow,
  TradePlanStatus,
} from "@/lib/domain/pre-entry";
import type { EntryChecklist, ScoreResult } from "@/lib/domain/scoring";
import type { Side } from "@/types";

const TRADE_PLAN_SCHEMA_VERSION = 1;

export type { TradePlanRow, TradePlanStatus };

export interface TradePlanInsert {
  symbol: string;
  direction: Side;
  plannedAt: string;
  refPrice: number | null;
  context: PreEntryContext | null;
  checklist: EntryChecklist;
  score: number | null;
  scoreBreakdown: ScoreResult | null;
  forwardOutcome: ForwardOutcome | null;
  notes: string;
}

/** Partial update — light fields (status/notes/links) or a full re-save of an
 * edited plan (inputs + recomputed context/score/outcome). */
export interface TradePlanPatch {
  status?: TradePlanStatus;
  notes?: string;
  linkedGroupId?: string | null;
  linkedEntryTime?: string | null;
  symbol?: string;
  direction?: Side;
  plannedAt?: string;
  refPrice?: number | null;
  context?: PreEntryContext | null;
  checklist?: EntryChecklist;
  score?: number | null;
  scoreBreakdown?: ScoreResult | null;
  forwardOutcome?: ForwardOutcome | null;
}

export async function insertTradePlan(input: TradePlanInsert): Promise<TradePlanRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("trade_plans")
    .insert({
      symbol: input.symbol,
      direction: input.direction,
      planned_at: input.plannedAt,
      ref_price: input.refPrice,
      schema_version: TRADE_PLAN_SCHEMA_VERSION,
      context: input.context,
      checklist: input.checklist,
      score: input.score,
      score_breakdown: input.scoreBreakdown,
      forward_outcome: input.forwardOutcome,
      notes: input.notes,
    })
    .select()
    .single();
  if (error) throw new Error(`insertTradePlan: ${error.message}`);
  return toRow(data as Record<string, unknown>);
}

export async function listTradePlans(params: {
  status?: TradePlanStatus;
  symbol?: string;
  limit?: number;
}): Promise<TradePlanRow[]> {
  const db = getSupabaseAdmin();
  let q = db
    .from("trade_plans")
    .select("*")
    .order("planned_at", { ascending: false })
    .limit(params.limit ?? 50);
  if (params.status) q = q.eq("status", params.status);
  if (params.symbol) q = q.eq("symbol", params.symbol);
  const { data, error } = await q;
  if (error) throw new Error(`listTradePlans: ${error.message}`);
  return (data ?? []).map((r) => toRow(r as Record<string, unknown>));
}

export async function updateTradePlan(
  id: number,
  patch: TradePlanPatch,
): Promise<TradePlanRow> {
  const db = getSupabaseAdmin();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.linkedGroupId !== undefined) update.linked_group_id = patch.linkedGroupId;
  if (patch.linkedEntryTime !== undefined) update.linked_entry_time = patch.linkedEntryTime;
  if (patch.symbol !== undefined) update.symbol = patch.symbol;
  if (patch.direction !== undefined) update.direction = patch.direction;
  if (patch.plannedAt !== undefined) update.planned_at = patch.plannedAt;
  if (patch.refPrice !== undefined) update.ref_price = patch.refPrice;
  if (patch.context !== undefined) update.context = patch.context;
  if (patch.checklist !== undefined) update.checklist = patch.checklist;
  if (patch.score !== undefined) update.score = patch.score;
  if (patch.scoreBreakdown !== undefined) update.score_breakdown = patch.scoreBreakdown;
  if (patch.forwardOutcome !== undefined) update.forward_outcome = patch.forwardOutcome;
  const { data, error } = await db
    .from("trade_plans")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateTradePlan: ${error.message}`);
  return toRow(data as Record<string, unknown>);
}

export async function deleteTradePlan(id: number): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("trade_plans").delete().eq("id", id);
  if (error) throw new Error(`deleteTradePlan: ${error.message}`);
}

function toRow(row: Record<string, unknown>): TradePlanRow {
  return {
    id: Number(row.id),
    symbol: String(row.symbol),
    direction: (row.direction === "SHORT" ? "SHORT" : "LONG") as Side,
    plannedAt: String(row.planned_at),
    refPrice: row.ref_price != null ? Number(row.ref_price) : null,
    status: String(row.status) as TradePlanStatus,
    context: (row.context as PreEntryContext | null) ?? null,
    checklist: (row.checklist as EntryChecklist) ?? ({} as EntryChecklist),
    score: row.score != null ? Number(row.score) : null,
    scoreBreakdown: (row.score_breakdown as ScoreResult | null) ?? null,
    forwardOutcome: (row.forward_outcome as ForwardOutcome | null) ?? null,
    notes: row.notes != null ? String(row.notes) : "",
    linkedGroupId: row.linked_group_id != null ? String(row.linked_group_id) : null,
    linkedEntryTime: row.linked_entry_time != null ? String(row.linked_entry_time) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
