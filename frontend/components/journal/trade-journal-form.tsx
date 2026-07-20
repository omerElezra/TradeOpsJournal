"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useEnrichment } from "@/hooks/use-enrichment";
import {
  Field,
  MultiChoice,
  NumberField,
  Scale,
  SectionTitle,
  SingleChoice,
} from "@/components/journal/form-controls";
import {
  CANDLE_OPTIONS,
  EMOTION_OPTIONS,
  ENTRY_CONFIRMATION_OPTIONS,
  EXIT_REASON_OPTIONS,
  GAP_OPTIONS,
  LEVEL_OPTIONS,
  MA_OPTIONS,
  MISTAKE_OPTIONS,
  SETUP_OPTIONS,
  TREND_OPTIONS,
  VOLUME_OPTIONS,
  suggestFromStockContext,
} from "@/components/journal/journal-presets";
import type { JournalEntry, TradeGroupDetail } from "@/types";

/** Dollar risk = |entry − stop| × qty, once a stop is known. */
function suggestRisk(trade: TradeGroupDetail, stopStr: string): string | null {
  const stop = Number(stopStr);
  if (!stopStr || !Number.isFinite(stop) || stop <= 0) return null;
  return (Math.abs(trade.avgEntry - stop) * trade.qty).toFixed(2);
}

/** "Hit Stop"/"Hit Target" when the exit landed within 1.5% of (or beyond) the level. */
function suggestExitReason(
  trade: TradeGroupDetail,
  stopStr: string,
  targetStr: string,
): string | null {
  const exit = trade.avgExit;
  if (exit == null) return null;
  const long = trade.side === "LONG";
  const near = (level: number) => Math.abs(exit - level) / level <= 0.015;

  const stop = Number(stopStr);
  if (stopStr && Number.isFinite(stop) && stop > 0) {
    if (near(stop) || (long ? exit < stop : exit > stop)) return "Hit Stop";
  }
  const target = Number(targetStr);
  if (targetStr && Number.isFinite(target) && target > 0) {
    if (near(target) || (long ? exit > target : exit < target)) return "Hit Target";
  }
  return null;
}

// ─── Form state ────────────────────────────────────────────────────────────────

type Draft = {
  candlePattern: string | null;
  recentTrend: string | null;
  volumeVsTrend: string | null;
  maRelation: string[];
  openGaps: string[];
  supportResFib: string[];
  setup: string | null;
  plannedStop: string;
  plannedTarget: string;
  riskAmount: string;
  convictionLevel: number | null;
  entryReason: string | null;
  exitReason: string | null;
  psychTags: string[];
  tradeScore: number | null;
  mistakesTags: string[];
  notes: string;
};

function toDraft(j: JournalEntry | null): Draft {
  return {
    candlePattern: j?.candlePattern ?? null,
    recentTrend: j?.recentTrend ?? null,
    volumeVsTrend: j?.volumeVsTrend ?? null,
    maRelation: j?.maRelation ?? [],
    openGaps: j?.openGaps ?? [],
    supportResFib: j?.supportResFib ?? [],
    setup: j?.setup ?? null,
    plannedStop: j?.plannedStop != null ? String(j.plannedStop) : "",
    plannedTarget: j?.plannedTarget != null ? String(j.plannedTarget) : "",
    riskAmount: j?.riskAmount != null ? String(j.riskAmount) : "",
    convictionLevel: j?.convictionLevel ?? null,
    entryReason: j?.entryReason ?? null,
    exitReason: j?.exitReason ?? null,
    psychTags: j?.psychTags ?? [],
    tradeScore: j?.tradeScore ?? null,
    mistakesTags: j?.mistakesTags ?? [],
    notes: j?.notes ?? "",
  };
}

// ─── Main component ────────────────────────────────────────────────────────────

export function TradeJournalForm({ trade }: { trade: TradeGroupDetail }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(true);
  const [moreOpen, setMoreOpen] = React.useState(() => {
    const j = trade.journal;
    return Boolean(
      j?.candlePattern || j?.openGaps?.length || j?.supportResFib?.length,
    );
  });
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(trade.journal));
  const [saved, setSaved] = React.useState<Draft>(() => toDraft(trade.journal));
  /** Fields currently holding an auto-suggested value the user hasn't touched. */
  const [autoKeys, setAutoKeys] = React.useState<Set<keyof Draft>>(new Set());
  const touched = React.useRef<Set<keyof Draft>>(new Set());
  const draftRef = React.useRef(draft);
  draftRef.current = draft;

  const { data: enrichmentRow } = useEnrichment(trade.id);
  const enrichment = enrichmentRow?.enrichment ?? null;

  // Pre-fill empty fields once from measured data (Trade Context + trade plan).
  const prefilled = React.useRef(false);
  React.useEffect(() => {
    if (!enrichment || prefilled.current) return;
    prefilled.current = true;

    const d = draftRef.current;
    const updates: Partial<Draft> = {};
    const auto: (keyof Draft)[] = [];
    const s = suggestFromStockContext(enrichment.stockContext);

    if (s.recentTrend && !d.recentTrend) {
      updates.recentTrend = s.recentTrend;
      auto.push("recentTrend");
    }
    if (s.volumeVsTrend && !d.volumeVsTrend) {
      updates.volumeVsTrend = s.volumeVsTrend;
      auto.push("volumeVsTrend");
    }
    if (s.maRelation && d.maRelation.length === 0) {
      updates.maRelation = s.maRelation;
      auto.push("maRelation");
    }
    const risk = suggestRisk(trade, d.plannedStop);
    if (risk != null && !d.riskAmount) {
      updates.riskAmount = risk;
      auto.push("riskAmount");
    }
    const exit = suggestExitReason(trade, d.plannedStop, d.plannedTarget);
    if (exit && !d.exitReason) {
      updates.exitReason = exit;
      auto.push("exitReason");
    }

    if (auto.length) {
      setDraft((prev) => ({ ...prev, ...updates }));
      setAutoKeys(new Set(auto));
    }
  }, [enrichment, trade]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  /** User edit: value wins, "auto" flag drops; stop/target edits re-derive risk & exit. */
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    touched.current.add(key);
    const next = { ...draftRef.current, [key]: value };
    const nextAuto = new Set(autoKeys);
    nextAuto.delete(key);

    if (key === "plannedStop" && !touched.current.has("riskAmount")) {
      const risk = suggestRisk(trade, next.plannedStop);
      if (risk != null) {
        next.riskAmount = risk;
        nextAuto.add("riskAmount");
      }
    }
    if (
      (key === "plannedStop" || key === "plannedTarget") &&
      !touched.current.has("exitReason")
    ) {
      const exit = suggestExitReason(trade, next.plannedStop, next.plannedTarget);
      if (exit) {
        next.exitReason = exit;
        nextAuto.add("exitReason");
      }
    }

    setDraft(next);
    setAutoKeys(nextAuto);
  };

  const isAuto = (key: keyof Draft) => autoKeys.has(key);

  const mutation = useMutation({
    mutationFn: () =>
      api.upsertJournal({
        symbol: trade.symbol,
        entryTime: trade.entryTime,
        candlePattern: draft.candlePattern,
        recentTrend: draft.recentTrend,
        volumeVsTrend: draft.volumeVsTrend,
        maRelation: draft.maRelation,
        openGaps: draft.openGaps,
        supportResFib: draft.supportResFib,
        setup: draft.setup,
        plannedStop: draft.plannedStop ? Number(draft.plannedStop) : null,
        plannedTarget: draft.plannedTarget ? Number(draft.plannedTarget) : null,
        riskAmount: draft.riskAmount ? Number(draft.riskAmount) : null,
        convictionLevel: draft.convictionLevel,
        entryReason: draft.entryReason,
        exitReason: draft.exitReason,
        psychTags: draft.psychTags,
        tradeScore: draft.tradeScore,
        mistakesTags: draft.mistakesTags,
        notes: draft.notes,
        aiCoachingQuestion: trade.journal?.aiCoachingQuestion ?? null,
      }),
    onSuccess: () => {
      setSaved(draft);
      queryClient.invalidateQueries({ queryKey: qk.trade(trade.id) });
      queryClient.invalidateQueries({ queryKey: ["trades"] });
      queryClient.invalidateQueries({ queryKey: ["journal"] });
    },
  });

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground">Trade Journal</CardTitle>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-muted-foreground">Unsaved changes</span>
            )}
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-6">
          {/* ── Market read (auto-filled from Trade Context, editable) ── */}
          <section className="space-y-4">
            <SectionTitle>Market Read</SectionTitle>
            {enrichment ? (
              <p className="text-xs text-muted-foreground">
                Pre-filled from measured Trade Context data — review and correct if
                the chart told you otherwise.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Compute Trade Context above to pre-fill this section automatically.
              </p>
            )}
            <Field label="Recent trend" auto={isAuto("recentTrend")}>
              <SingleChoice
                options={TREND_OPTIONS}
                value={draft.recentTrend}
                onChange={(v) => set("recentTrend", v)}
              />
            </Field>
            <Field label="Volume vs trend" auto={isAuto("volumeVsTrend")}>
              <SingleChoice
                options={VOLUME_OPTIONS}
                value={draft.volumeVsTrend}
                onChange={(v) => set("volumeVsTrend", v)}
              />
            </Field>
            <Field label="Moving averages" auto={isAuto("maRelation")}>
              <MultiChoice
                options={MA_OPTIONS}
                values={draft.maRelation}
                onChange={(v) => set("maRelation", v)}
              />
            </Field>
          </section>

          {/* ── Setup & Plan ── */}
          <section className="space-y-4">
            <SectionTitle>Setup &amp; Plan</SectionTitle>
            <Field label="Technical setup">
              <SingleChoice
                options={SETUP_OPTIONS}
                value={draft.setup}
                onChange={(v) => set("setup", v)}
              />
            </Field>
            <div className="flex flex-wrap gap-4">
              <NumberField
                label="Planned stop loss"
                value={draft.plannedStop}
                onChange={(v) => set("plannedStop", v)}
                placeholder="0.00"
              />
              <NumberField
                label="Planned take profit"
                value={draft.plannedTarget}
                onChange={(v) => set("plannedTarget", v)}
                placeholder="0.00"
              />
              <NumberField
                label="Risk amount ($)"
                value={draft.riskAmount}
                onChange={(v) => set("riskAmount", v)}
                placeholder="auto from stop"
                auto={isAuto("riskAmount")}
              />
            </div>
            <Field label="Conviction level">
              <Scale
                value={draft.convictionLevel}
                onChange={(v) => set("convictionLevel", v)}
                lowLabel="Low confidence"
                highLabel="A+ setup"
              />
            </Field>
          </section>

          {/* ── Execution & Psychology ── */}
          <section className="space-y-4">
            <SectionTitle>Execution &amp; Psychology</SectionTitle>
            <Field label="Entry confirmation">
              <SingleChoice
                options={ENTRY_CONFIRMATION_OPTIONS}
                value={draft.entryReason}
                onChange={(v) => set("entryReason", v)}
              />
            </Field>
            <Field label="Exit reason" auto={isAuto("exitReason")}>
              <SingleChoice
                options={EXIT_REASON_OPTIONS}
                value={draft.exitReason}
                onChange={(v) => set("exitReason", v)}
              />
            </Field>
            <Field label="Emotions">
              <MultiChoice
                options={EMOTION_OPTIONS}
                values={draft.psychTags}
                onChange={(v) => set("psychTags", v)}
              />
            </Field>
          </section>

          {/* ── Review ── */}
          <section className="space-y-4">
            <SectionTitle>Review</SectionTitle>
            <Field label="Mistakes">
              <MultiChoice
                options={MISTAKE_OPTIONS}
                values={draft.mistakesTags}
                onChange={(v) => set("mistakesTags", v)}
              />
            </Field>
            <Field label="Trade score">
              <Scale
                value={draft.tradeScore}
                onChange={(v) => set("tradeScore", v)}
                lowLabel="Broke all rules"
                highLabel="Perfect plan execution"
              />
            </Field>
            <Field label="Notes">
              <textarea
                dir="auto"
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="General context, the story of the trade, what you saw…"
                rows={4}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </Field>
          </section>

          {/* ── More (optional, subjective chart details) ── */}
          <section className="space-y-4">
            <button
              type="button"
              className="flex w-full items-center justify-between border-b border-border pb-1.5 text-sm font-semibold"
              onClick={() => setMoreOpen((o) => !o)}
            >
              <span>
                Chart Details{" "}
                <span className="font-normal text-muted-foreground">(optional)</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${
                  moreOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            {moreOpen && (
              <>
                <Field label="Candle pattern">
                  <SingleChoice
                    options={CANDLE_OPTIONS}
                    value={draft.candlePattern}
                    onChange={(v) => set("candlePattern", v)}
                  />
                </Field>
                <Field label="Open gaps">
                  <MultiChoice
                    options={GAP_OPTIONS}
                    values={draft.openGaps}
                    onChange={(v) => set("openGaps", v)}
                  />
                </Field>
                <Field label="Support / Resistance / Fibonacci">
                  <MultiChoice
                    options={LEVEL_OPTIONS}
                    values={draft.supportResFib}
                    onChange={(v) => set("supportResFib", v)}
                  />
                </Field>
              </>
            )}
          </section>

          {mutation.isError && (
            <p className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Failed to save journal."}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            {autoKeys.size > 0 && dirty && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                {autoKeys.size} auto-filled — review, then save
              </span>
            )}
            {!dirty && !mutation.isPending && trade.journal && (
              <span className="text-xs text-muted-foreground">Saved</span>
            )}
            <Button
              size="sm"
              onClick={() => mutation.mutate()}
              disabled={!dirty || mutation.isPending}
            >
              {mutation.isPending ? "Saving…" : "Save journal"}
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
