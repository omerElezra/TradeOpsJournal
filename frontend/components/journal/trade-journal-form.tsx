"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Plus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
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

// ─── Small building blocks ─────────────────────────────────────────────────────

const chipBase =
  "rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
const chipOff = `${chipBase} border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground`;
const chipOn = `${chipBase} border-primary/50 bg-primary/15 text-primary`;

const inputCls =
  "h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
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
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(trade.journal));
  const [saved, setSaved] = React.useState<Draft>(() => toDraft(trade.journal));

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

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
          {/* ── Pre-Entry Checklist ── */}
          <section className="space-y-4">
            <SectionTitle>Pre-Entry Checklist</SectionTitle>
            <Field label="Candle pattern">
              <SingleChoice
                options={CANDLE_OPTIONS}
                value={draft.candlePattern}
                onChange={(v) => set("candlePattern", v)}
              />
            </Field>
            <Field label="Recent trend">
              <SingleChoice
                options={TREND_OPTIONS}
                value={draft.recentTrend}
                onChange={(v) => set("recentTrend", v)}
              />
            </Field>
            <Field label="Volume vs trend">
              <SingleChoice
                options={VOLUME_OPTIONS}
                value={draft.volumeVsTrend}
                onChange={(v) => set("volumeVsTrend", v)}
              />
            </Field>
            <Field label="Moving averages">
              <MultiChoice
                options={MA_OPTIONS}
                values={draft.maRelation}
                onChange={(v) => set("maRelation", v)}
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
          </section>

          {/* ── Planning & Setup ── */}
          <section className="space-y-4">
            <SectionTitle>Planning &amp; Setup</SectionTitle>
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
                placeholder="0.00"
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
            <Field label="Exit reason">
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

          {mutation.isError && (
            <p className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
              {mutation.error instanceof Error
                ? mutation.error.message
                : "Failed to save journal."}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
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
