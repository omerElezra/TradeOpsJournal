"use client";

// Small badges/labels shared by the Trade Context card and the pre-entry
// check context panel.

import * as React from "react";
import { formatNumber, formatPercent } from "@/lib/format";
import { METRIC_HELP, METRIC_SECTION_HELP } from "@/lib/help";
import { Tip } from "@/components/journal/form-controls";
import type { Trend, VixRegime } from "@/lib/domain/enrichment";

const TREND_CLS: Record<Trend, string> = {
  BULLISH: "border-positive/50 bg-positive/10 text-positive",
  BEARISH: "border-negative/50 bg-negative/10 text-negative",
  MIXED: "border-border bg-accent text-foreground",
  UNKNOWN: "border-border bg-background text-muted-foreground",
};

export function TrendBadge({ trend }: { trend: Trend }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${TREND_CLS[trend]}`}
    >
      {trend}
    </span>
  );
}

const VIX_CLS: Record<VixRegime, string> = {
  LOW: "border-positive/50 bg-positive/10 text-positive",
  NORMAL: "border-border bg-accent text-foreground",
  ELEVATED: "border-negative/40 bg-negative/5 text-foreground",
  EXTREME: "border-negative/50 bg-negative/10 text-negative",
  UNKNOWN: "border-border bg-background text-muted-foreground",
};

export function VixBadge({ regime }: { regime: VixRegime }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${VIX_CLS[regime]}`}
    >
      {regime}
    </span>
  );
}

export function YesNo({ value }: { value: boolean | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  return value ? (
    <span className="text-positive">Yes</span>
  ) : (
    <span className="text-negative">No</span>
  );
}

export function num(value: number | null, digits = 2): string {
  return value != null ? formatNumber(value, digits) : "—";
}

export function pct(value: number | null, digits = 2): string {
  return value != null ? formatPercent(value, digits) : "—";
}

export function Item({ label, children }: { label: string; children: React.ReactNode }) {
  const tip = METRIC_HELP[label];
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {tip ? (
          <span className="group relative cursor-help underline decoration-dotted decoration-muted-foreground/40 underline-offset-2">
            {label}
            <Tip text={tip} />
          </span>
        ) : (
          label
        )}
      </p>
      <p className="tabular mt-0.5 text-sm font-medium">{children}</p>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const tip = METRIC_SECTION_HELP[title];
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {tip ? (
          <span className="group relative cursor-help">
            {title}
            <Tip text={tip} />
          </span>
        ) : (
          title
        )}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </div>
  );
}
