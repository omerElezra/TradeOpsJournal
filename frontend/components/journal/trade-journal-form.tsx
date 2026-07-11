"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, Sparkles, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useEnrichment } from "@/hooks/use-enrichment";
import type { TradeContextEnrichment } from "@/lib/domain/enrichment";
import type { JournalEntry, TradeGroupDetail } from "@/types";

// ─── Preset options ────────────────────────────────────────────────────────────

const CANDLE_OPTIONS = [
  "Hammer",
  "Doji",
  "Bullish Engulfing",
  "Bearish Engulfing",
  "Inverted Hammer",
  "Marubozu",
  "None",
];

const TREND_OPTIONS = ["Up", "Down", "Consolidating"];

const VOLUME_OPTIONS = [
  "Volume supports trend",
  "Volume dropping (weakening)",
  "Climax volume",
];

const MA_OPTIONS = [
  "Above MA20",
  "Below MA20",
  "Bouncing on MA20",
  "Reclaiming MA20",
  "Overextended from MA20",
  "Above MA150/200",
  "Below MA150/200",
  "Trapped between MAs",
];

const GAP_OPTIONS = ["Open gap upside", "Open gap downside"];

const LEVEL_OPTIONS = [
  "Near strong support",
  "Breaking resistance",
  "Under near resistance",
  "On key Fibonacci",
];

const SETUP_OPTIONS = [
  "VCP",
  "Cup & Handle",
  "Breakout",
  "Pullback",
  "Flag/Pennant",
  "Double Bottom/Top",
  "Fakeout",
];

const ENTRY_REASON_OPTIONS = [
  "Critical resistance break",
  "MA bounce",
  "Planned execution",
  "Anticipating early",
  "FOMO",
  "Alert",
];

const EXIT_REASON_OPTIONS = [
  "Hit Target",
  "Hit Stop",
  "Broke MA",
  "Fear/Early exit",
  "Time stop",
];

const EMOTION_OPTIONS = [
  "Calm",
  "Anxiety",
  "Boredom",
  "Overconfidence",
  "FOMO",
  "Frustration",
];

const MISTAKE_OPTIONS = [
  "No mistakes (Perfect Execution)",
  "Chasing market",
  "Failed to take profit",
  "Overtrading",
  "Moved SL down",
];

// ─── Auto-fill suggestions from measured data ─────────────────────────────────
// Heuristics — never authoritative, so suggested values stay fully editable and
// are flagged "auto" until the user touches them.

function suggestFromEnrichment(e: TradeContextEnrichment): {
  recentTrend?: string;
  volumeVsTrend?: string;
  maRelation?: string[];
} {
  const s: { recentTrend?: string; volumeVsTrend?: string; maRelation?: string[] } = {};
  const sc = e.stockContext;

  if (sc.maAlignment === "BULLISH") s.recentTrend = "Up";
  else if (sc.maAlignment === "BEARISH") s.recentTrend = "Down";
  else if (sc.maAlignment === "MIXED") s.recentTrend = "Consolidating";

  const rv = sc.relativeVolume;
  if (rv != null) {
    if (rv >= 2.5) s.volumeVsTrend = "Climax volume";
    else if (rv >= 1.1) s.volumeVsTrend = "Volume supports trend";
    else if (rv < 0.9) s.volumeVsTrend = "Volume dropping (weakening)";
  }

  const ma: string[] = [];
  if (sc.aboveMa20 != null) ma.push(sc.aboveMa20 ? "Above MA20" : "Below MA20");
  const above150 = sc.aboveMa150 ?? null;
  if (above150 != null) ma.push(above150 ? "Above MA150/200" : "Below MA150/200");
  if (sc.distanceFromMa20Pct != null && sc.distanceFromMa20Pct > 7)
    ma.push("Overextended from MA20");
  if (ma.length) s.maRelation = ma;

  return s;
}

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

// ─── Small building blocks ─────────────────────────────────────────────────────

const chipBase =
  "rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const chipOff = `${chipBase} border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground`;
const chipOn = `${chipBase} border-primary/50 bg-primary/15 text-primary`;

const inputCls =
  "h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";

function Field({
  label,
  auto,
  children,
}: {
  label: string;
  auto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {auto && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] normal-case text-primary">
            <Sparkles className="h-2.5 w-2.5" />
            auto
          </span>
        )}
      </p>
      {children}
    </div>
  );
}

/** Single choice chip group with an "Other…" free-text option. */
function SingleChoice({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const isCustom = value != null && !options.includes(value);
  const [showOther, setShowOther] = React.useState(isCustom);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={value === opt ? chipOn : chipOff}
            onClick={() => {
              setShowOther(false);
              onChange(value === opt ? null : opt);
            }}
          >
            {opt}
          </button>
        ))}
        <button
          type="button"
          className={showOther || isCustom ? chipOn : chipOff}
          onClick={() => {
            if (showOther || isCustom) {
              setShowOther(false);
              if (isCustom) onChange(null);
            } else {
              setShowOther(true);
              if (!isCustom) onChange(null);
            }
          }}
        >
          Other…
        </button>
      </div>
      {(showOther || isCustom) && (
        <input
          autoFocus
          value={isCustom ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Type a custom value…"
          className={`${inputCls} w-full max-w-xs`}
        />
      )}
    </div>
  );
}

/** Multi-select chip group with an "Other…" free-text adder. */
function MultiChoice({
  options,
  values,
  onChange,
}: {
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [showOther, setShowOther] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const customValues = values.filter((v) => !options.includes(v));

  const toggle = (opt: string) =>
    onChange(
      values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt],
    );

  const addCustom = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={values.includes(opt) ? chipOn : chipOff}
            onClick={() => toggle(opt)}
          >
            {opt}
          </button>
        ))}
        {customValues.map((v) => (
          <button
            key={v}
            type="button"
            className={`${chipOn} inline-flex items-center gap-1`}
            onClick={() => onChange(values.filter((x) => x !== v))}
          >
            {v}
            <X className="h-3 w-3" />
          </button>
        ))}
        <button
          type="button"
          className={showOther ? chipOn : chipOff}
          onClick={() => setShowOther((s) => !s)}
        >
          Other…
        </button>
      </div>
      {showOther && (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Type a custom value…"
            className={`${inputCls} w-full max-w-xs`}
          />
          <Button variant="outline" size="sm" onClick={addCustom} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

/** 1–10 button scale. Click the active value again to clear. */
function Scale({
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`h-8 w-8 rounded-md border text-xs tabular transition-colors ${
              value === n
                ? "border-primary/50 bg-primary/15 font-semibold text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex max-w-[352px] justify-between text-[10px] text-muted-foreground">
        <span>1 = {lowLabel}</span>
        <span>10 = {highLabel}</span>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  auto,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  auto?: boolean;
}) {
  return (
    <Field label={label} auto={auto}>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} w-32`}
      />
    </Field>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="border-b border-border pb-1.5 text-sm font-semibold">
      {children}
    </h3>
  );
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
    const s = suggestFromEnrichment(enrichment);

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

          {/* ── Plan ── */}
          <section className="space-y-4">
            <SectionTitle>Plan</SectionTitle>
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
            <Field label="Entry reason">
              <SingleChoice
                options={ENTRY_REASON_OPTIONS}
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
                More{" "}
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
