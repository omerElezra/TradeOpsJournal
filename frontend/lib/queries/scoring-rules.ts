import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { RulePredicate, ScoringRule } from "@/lib/domain/scoring";

export interface ScoringRuleInsert {
  label: string;
  conditions: RulePredicate[];
  points: number;
  note: string;
  enabled: boolean;
  sortOrder?: number;
}

export async function listScoringRules(): Promise<ScoringRule[]> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("scoring_rules")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw new Error(`listScoringRules: ${error.message}`);
  return (data ?? []).map((r) => toRule(r as Record<string, unknown>));
}

export async function insertScoringRule(rule: ScoringRuleInsert): Promise<ScoringRule> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("scoring_rules")
    .insert({
      label: rule.label,
      conditions: rule.conditions,
      points: rule.points,
      note: rule.note,
      enabled: rule.enabled,
      sort_order: rule.sortOrder ?? 0,
    })
    .select()
    .single();
  if (error) throw new Error(`insertScoringRule: ${error.message}`);
  return toRule(data as Record<string, unknown>);
}

export async function updateScoringRule(
  id: number,
  patch: Partial<ScoringRuleInsert>,
): Promise<ScoringRule> {
  const db = getSupabaseAdmin();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.label !== undefined) update.label = patch.label;
  if (patch.conditions !== undefined) update.conditions = patch.conditions;
  if (patch.points !== undefined) update.points = patch.points;
  if (patch.note !== undefined) update.note = patch.note;
  if (patch.enabled !== undefined) update.enabled = patch.enabled;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { data, error } = await db
    .from("scoring_rules")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`updateScoringRule: ${error.message}`);
  return toRule(data as Record<string, unknown>);
}

export async function deleteScoringRule(id: number): Promise<void> {
  const db = getSupabaseAdmin();
  const { error } = await db.from("scoring_rules").delete().eq("id", id);
  if (error) throw new Error(`deleteScoringRule: ${error.message}`);
}

function toRule(row: Record<string, unknown>): ScoringRule {
  return {
    id: Number(row.id),
    label: String(row.label),
    conditions: (row.conditions as RulePredicate[]) ?? [],
    points: Number(row.points),
    note: row.note != null ? String(row.note) : "",
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order ?? 0),
  };
}
