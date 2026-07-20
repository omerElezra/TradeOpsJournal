"use client";

import * as React from "react";
import { Calculator, History, Pencil, Save, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, inputCls, chipOff, chipOn } from "@/components/journal/form-controls";
import { suggestFromStockContext } from "@/components/journal/journal-presets";
import { ContextPanel } from "./context-panel";
import { ChecklistSection, emptyChecklistDraft, type ChecklistDraft } from "./checklist-section";
import { ScorePanel } from "./score-panel";
import { ForwardOutcomePanel } from "./forward-outcome-panel";
import { RuleEditor } from "./rule-editor";
import { RecentPlans } from "./recent-plans";
import {
  useComputeEntryCheck,
  useSaveTradePlan,
  useScoringRules,
  useUpdateTradePlan,
} from "@/hooks/use-entry-check";
import {
  buildScoringFacts,
  emptyChecklist,
  evaluateScore,
  type EntryChecklist,
} from "@/lib/domain/scoring";
import { buildEntryPrompt } from "@/lib/domain/entry-prompt";
import { CopyPromptButton } from "./copy-prompt-button";
import { formatDateTime } from "@/lib/format";
import type { EntryCheckResponse, TradePlanRow } from "@/lib/domain/pre-entry";
import type { Side } from "@/types";

function toNum(s: string): number | null {
  const n = Number(s);
  return s && Number.isFinite(n) && n > 0 ? n : null;
}

/** ISO timestamp → value for a datetime-local input, in the local timezone. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toChecklist(d: ChecklistDraft): EntryChecklist {
  return {
    candlePattern: d.candlePattern,
    recentTrend: d.recentTrend,
    volumeVsTrend: d.volumeVsTrend,
    maRelation: d.maRelation,
    openGaps: d.openGaps,
    supportResFib: d.supportResFib,
    setup: d.setup,
    entryConfirmation: d.entryConfirmation,
    plannedStop: toNum(d.plannedStop),
    plannedTarget: toNum(d.plannedTarget),
    conviction: d.conviction,
  };
}

export function EntryCheckPage() {
  // ── Inputs bar ──
  const [symbol, setSymbol] = React.useState("");
  const [direction, setDirection] = React.useState<Side>("LONG");
  const [refPrice, setRefPrice] = React.useState("");
  const [asOfLocal, setAsOfLocal] = React.useState(""); // datetime-local; empty = now

  // ── Result + checklist state ──
  const [result, setResult] = React.useState<EntryCheckResponse | null>(null);
  const [draft, setDraft] = React.useState<ChecklistDraft>(emptyChecklistDraft());
  const [autoKeys, setAutoKeys] = React.useState<Set<keyof ChecklistDraft>>(new Set());
  const touched = React.useRef<Set<keyof ChecklistDraft>>(new Set());
  const [notes, setNotes] = React.useState("");

  /** Saved plan currently loaded into the form; Save updates it in place. */
  const [editingPlan, setEditingPlan] = React.useState<TradePlanRow | null>(null);
  const topRef = React.useRef<HTMLDivElement>(null);

  const compute = useComputeEntryCheck();
  const savePlan = useSaveTradePlan();
  const updatePlan = useUpdateTradePlan();
  const { data: rules } = useScoringRules();

  const set = <K extends keyof ChecklistDraft>(key: K, value: ChecklistDraft[K]) => {
    touched.current.add(key);
    setDraft((prev) => ({ ...prev, [key]: value }));
    setAutoKeys((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  const runCheck = () => {
    if (!symbol.trim()) return;
    compute.mutate(
      {
        symbol: symbol.trim().toUpperCase(),
        direction,
        asOf: asOfLocal ? new Date(asOfLocal).toISOString() : null,
        refPrice: toNum(refPrice),
        plannedStop: toNum(draft.plannedStop),
        plannedTarget: toNum(draft.plannedTarget),
      },
      {
        onSuccess: (res) => {
          setResult(res);
          // Auto-fill untouched checklist fields from the measured context.
          const s = suggestFromStockContext(res.context.stockContext);
          setDraft((prev) => {
            const next = { ...prev };
            const auto = new Set(autoKeys);
            if (s.recentTrend && !touched.current.has("recentTrend")) {
              next.recentTrend = s.recentTrend;
              auto.add("recentTrend");
            }
            if (s.volumeVsTrend && !touched.current.has("volumeVsTrend")) {
              next.volumeVsTrend = s.volumeVsTrend;
              auto.add("volumeVsTrend");
            }
            if (s.maRelation && !touched.current.has("maRelation")) {
              next.maRelation = s.maRelation;
              auto.add("maRelation");
            }
            setAutoKeys(auto);
            return next;
          });
        },
      },
    );
  };

  // Live score preview — recomputed as the user toggles chips; the saved score
  // is recomputed authoritatively on the server from the same pure code.
  const scoreResult = React.useMemo(() => {
    if (!result?.context || !rules) return null;
    return evaluateScore(
      rules.filter((r) => r.enabled),
      buildScoringFacts(result.context, toChecklist(draft)),
    );
  }, [result, rules, draft]);

  const isRetro = Boolean(asOfLocal) && new Date(asOfLocal).getTime() < Date.now() - 86400_000;

  // ── Edit an existing plan: load every parameter into the form ──
  const loadPlan = (plan: TradePlanRow) => {
    const c = { ...emptyChecklist(), ...plan.checklist };
    setEditingPlan(plan);
    setSymbol(plan.symbol);
    setDirection(plan.direction);
    setRefPrice(plan.refPrice != null ? String(plan.refPrice) : "");
    setAsOfLocal(toLocalInput(plan.plannedAt));
    setDraft({
      candlePattern: c.candlePattern,
      recentTrend: c.recentTrend,
      volumeVsTrend: c.volumeVsTrend,
      maRelation: c.maRelation,
      openGaps: c.openGaps,
      supportResFib: c.supportResFib,
      setup: c.setup,
      entryConfirmation: c.entryConfirmation,
      plannedStop: c.plannedStop != null ? String(c.plannedStop) : "",
      plannedTarget: c.plannedTarget != null ? String(c.plannedTarget) : "",
      conviction: c.conviction,
    });
    setNotes(plan.notes);
    setAutoKeys(new Set());
    // Saved answers are the user's — a later Calculate must not overwrite them
    // with auto-suggestions, so mark every filled field as touched.
    touched.current = new Set(
      (Object.keys(c) as (keyof ChecklistDraft)[]).filter((k) => {
        const v = c[k as keyof EntryChecklist];
        return Array.isArray(v) ? v.length > 0 : v != null;
      }),
    );
    setResult(
      plan.context
        ? { context: plan.context, forwardOutcome: plan.forwardOutcome }
        : null,
    );
    savePlan.reset();
    updatePlan.reset();
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startNewCheck = () => {
    setEditingPlan(null);
    setSymbol("");
    setDirection("LONG");
    setRefPrice("");
    setAsOfLocal("");
    setDraft(emptyChecklistDraft());
    setNotes("");
    setAutoKeys(new Set());
    touched.current = new Set();
    setResult(null);
    savePlan.reset();
    updatePlan.reset();
  };

  // ── AI coach prompt ──
  const buildPrompt = () =>
    result
      ? buildEntryPrompt({
          context: result.context,
          checklist: toChecklist(draft),
          score: scoreResult,
          forwardOutcome: result.forwardOutcome,
          notes,
        })
      : null;

  const saving = savePlan.isPending || updatePlan.isPending;

  const save = () => {
    if (!result) return;
    const body = {
      symbol: result.context.symbol,
      direction: result.context.direction,
      plannedAt: result.context.asOf,
      refPrice: toNum(refPrice),
      context: result.context,
      checklist: toChecklist(draft),
      forwardOutcome: result.forwardOutcome,
      notes,
    };
    if (editingPlan) {
      updatePlan.mutate(
        { id: editingPlan.id, patch: body },
        { onSuccess: (row) => setEditingPlan(row) },
      );
    } else {
      savePlan.mutate(body);
    }
  };

  return (
    <div ref={topRef} className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Entry Check</h1>
        <p className="text-sm text-muted-foreground">
          Check a stock before entering — measured context, your checklist, and a
          transparent score from your own rules. Leave the time empty for a live
          check, or pick a past time to practice retrospectively.
        </p>
      </div>

      {/* ── Edit-mode banner ── */}
      {editingPlan && (
        <div className="flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/10 px-3 py-2">
          <p className="flex items-center gap-2 text-sm text-primary">
            <Pencil className="h-3.5 w-3.5" />
            Editing saved plan: <span className="font-semibold">{editingPlan.symbol}</span>{" "}
            · {formatDateTime(editingPlan.plannedAt)} — every field below is the
            plan&apos;s data; Save updates this plan in place.
          </p>
          <Button size="sm" variant="outline" onClick={startNewCheck}>
            <X className="mr-1 h-3.5 w-3.5" />
            New check
          </Button>
        </div>
      )}

      {/* ── Inputs bar ── */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Symbol">
              <input
                className={`${inputCls} w-28 uppercase`}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && runCheck()}
                placeholder="AAPL"
              />
            </Field>
            <Field label="Direction">
              <div className="flex gap-1.5">
                {(["LONG", "SHORT"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    className={direction === d ? chipOn : chipOff}
                    onClick={() => setDirection(d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Possible entry price (optional)">
              <input
                type="number"
                step="any"
                min="0"
                className={`${inputCls} w-32`}
                value={refPrice}
                onChange={(e) => setRefPrice(e.target.value)}
                placeholder="last close"
              />
            </Field>
            <Field label="Possible entry time (optional)">
              <input
                type="datetime-local"
                className={`${inputCls} w-52`}
                value={asOfLocal}
                onChange={(e) => setAsOfLocal(e.target.value)}
              />
            </Field>
            <div className="flex items-center gap-2">
              <Button onClick={runCheck} disabled={!symbol.trim() || compute.isPending}>
                <Calculator className="mr-1.5 h-4 w-4" />
                {compute.isPending ? "Calculating…" : "Calculate"}
              </Button>
              {isRetro && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border bg-accent px-2 py-0.5 text-xs text-foreground">
                  <History className="h-3 w-3" />
                  retrospective
                </span>
              )}
            </div>
          </div>
          {compute.isError && (
            <p className="mt-3 rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
              {compute.error instanceof Error
                ? compute.error.message
                : "Failed to compute context"}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Results ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          {result && <ContextPanel ctx={result.context} />}
          {result?.forwardOutcome && (
            <ForwardOutcomePanel outcome={result.forwardOutcome} />
          )}
          <ChecklistSection
            draft={draft}
            set={set}
            isAuto={(k) => autoKeys.has(k)}
            hasContext={Boolean(result)}
          />
        </div>
        <div className="space-y-4">
          {scoreResult && <ScorePanel result={scoreResult} />}
          {rules && <RuleEditor rules={rules} />}

          {/* ── Save bar ── */}
          {result && (
            <Card>
              <CardContent className="space-y-3 pt-6">
                <Field label="Notes">
                  <textarea
                    dir="auto"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Why this trade, what confirmation you're waiting for…"
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
                  />
                </Field>
                {(savePlan.isError || updatePlan.isError) && (
                  <p className="text-xs text-negative">
                    {(savePlan.error ?? updatePlan.error) instanceof Error
                      ? ((savePlan.error ?? updatePlan.error) as Error).message
                      : "Failed to save plan"}
                  </p>
                )}
                <div className="flex items-center justify-end gap-2">
                  {savePlan.isSuccess && (
                    <span className="text-xs text-muted-foreground">Plan saved</span>
                  )}
                  {updatePlan.isSuccess && (
                    <span className="text-xs text-muted-foreground">Plan updated</span>
                  )}
                  <CopyPromptButton buildPrompt={buildPrompt} />
                  <Button size="sm" onClick={save} disabled={saving}>
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                    {saving ? "Saving…" : editingPlan ? "Update plan" : "Save plan"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <RecentPlans onEdit={loadPlan} editingId={editingPlan?.id ?? null} />
        </div>
      </div>
    </div>
  );
}
