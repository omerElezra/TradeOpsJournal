"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  ENTRY_CONFIRMATION_OPTIONS,
  GAP_OPTIONS,
  LEVEL_OPTIONS,
  MA_OPTIONS,
  SETUP_OPTIONS,
  TREND_OPTIONS,
  VOLUME_OPTIONS,
} from "@/components/journal/journal-presets";

/** Checklist form state — stop/target as strings for the inputs. */
export type ChecklistDraft = {
  candlePattern: string | null;
  recentTrend: string | null;
  volumeVsTrend: string | null;
  maRelation: string[];
  openGaps: string[];
  supportResFib: string[];
  setup: string | null;
  entryConfirmation: string | null;
  plannedStop: string;
  plannedTarget: string;
  conviction: number | null;
};

export function emptyChecklistDraft(): ChecklistDraft {
  return {
    candlePattern: null,
    recentTrend: null,
    volumeVsTrend: null,
    maRelation: [],
    openGaps: [],
    supportResFib: [],
    setup: null,
    entryConfirmation: null,
    plannedStop: "",
    plannedTarget: "",
    conviction: null,
  };
}

export function ChecklistSection({
  draft,
  set,
  isAuto,
  hasContext,
}: {
  draft: ChecklistDraft;
  set: <K extends keyof ChecklistDraft>(key: K, value: ChecklistDraft[K]) => void;
  isAuto: (key: keyof ChecklistDraft) => boolean;
  hasContext: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">Pre-Entry Checklist</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4">
          <SectionTitle>Market Read</SectionTitle>
          <p className="text-xs text-muted-foreground">
            {hasContext
              ? "Pre-filled from measured data — review and correct if the chart told you otherwise."
              : "Calculate the context to pre-fill this section automatically."}
          </p>
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

        <section className="space-y-4">
          <SectionTitle>Setup &amp; Plan</SectionTitle>
          <Field label="Technical setup">
            <SingleChoice
              options={SETUP_OPTIONS}
              value={draft.setup}
              onChange={(v) => set("setup", v)}
            />
          </Field>
          <Field label="Entry confirmation">
            <SingleChoice
              options={ENTRY_CONFIRMATION_OPTIONS}
              value={draft.entryConfirmation}
              onChange={(v) => set("entryConfirmation", v)}
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
          </div>
          <Field label="Conviction level">
            <Scale
              value={draft.conviction}
              onChange={(v) => set("conviction", v)}
              lowLabel="Low confidence"
              highLabel="A+ setup"
            />
          </Field>
        </section>

        <section className="space-y-4">
          <SectionTitle>Chart Details (optional)</SectionTitle>
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
        </section>
      </CardContent>
    </Card>
  );
}
