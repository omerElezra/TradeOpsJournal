import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { EnrichmentRow, TradeContextEnrichment } from "@/lib/domain/enrichment";

// v2: stock context uses MA150 instead of MA200; market context gained VIX.
export const ENRICHMENT_SCHEMA_VERSION = 2;

/** Upsert the computed enrichment for a trade keyed by (symbol, entry_time). */
export async function upsertEnrichment(
  symbol: string,
  entryTime: string,
  groupId: string | null,
  enrichment: TradeContextEnrichment,
): Promise<EnrichmentRow> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("trade_context_enrichment")
    .upsert(
      {
        symbol,
        entry_time: entryTime,
        group_id: groupId,
        schema_version: ENRICHMENT_SCHEMA_VERSION,
        enrichment,
        computed_at: new Date().toISOString(),
      },
      { onConflict: "symbol,entry_time" },
    )
    .select()
    .single();
  if (error) throw new Error(`upsertEnrichment: ${error.message}`);
  return toRow(data as Record<string, unknown>);
}

/** Load the stored enrichment for a trade, or null when never computed. */
export async function fetchEnrichment(
  symbol: string,
  entryTime: string,
): Promise<EnrichmentRow | null> {
  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from("trade_context_enrichment")
    .select("*")
    .eq("symbol", symbol)
    .eq("entry_time", entryTime)
    .maybeSingle();
  if (error) throw new Error(`fetchEnrichment: ${error.message}`);
  return data ? toRow(data as Record<string, unknown>) : null;
}

function toRow(row: Record<string, unknown>): EnrichmentRow {
  return {
    groupId: row.group_id != null ? String(row.group_id) : null,
    schemaVersion: Number(row.schema_version ?? 1),
    enrichment: row.enrichment as TradeContextEnrichment,
    computedAt: String(row.computed_at),
  };
}
