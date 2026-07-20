"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatPercent } from "@/lib/format";
import type { ForwardOutcome } from "@/lib/domain/pre-entry";

function pctCell(v: number | null) {
  if (v == null) return <span className="text-muted-foreground">—</span>;
  const cls = v > 0 ? "text-positive" : v < 0 ? "text-negative" : "";
  return <span className={`tabular ${cls}`}>{formatPercent(v, 1)}</span>;
}

function verdict(fo: ForwardOutcome): string {
  const st = fo.stopTarget;
  if (!st) return "";
  switch (st.firstHit) {
    case "STOP":
      return `Stop would have been hit first, after ${st.hitAfterDays} trading day${st.hitAfterDays === 1 ? "" : "s"}.`;
    case "TARGET":
      return `Target would have been hit first, after ${st.hitAfterDays} trading day${st.hitAfterDays === 1 ? "" : "s"}.`;
    case "AMBIGUOUS":
      return `Both stop and target were breached inside the same daily bar (day ${st.hitAfterDays}) — inconclusive on daily data.`;
    default:
      return `Neither stop nor target was hit within ${fo.barsAvailable} trading days.`;
  }
}

export function ForwardOutcomePanel({ outcome }: { outcome: ForwardOutcome }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-foreground">What Happened After</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          From reference price {formatNumber(outcome.refPrice)} —{" "}
          {outcome.barsAvailable} forward trading day
          {outcome.barsAvailable === 1 ? "" : "s"} available.
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-1.5 font-medium">Horizon</th>
              <th className="py-1.5 font-medium">Close</th>
              <th className="py-1.5 font-medium">Max High</th>
              <th className="py-1.5 font-medium">Min Low</th>
            </tr>
          </thead>
          <tbody>
            {outcome.horizons.map((h) => (
              <tr key={h.days} className="border-b border-border/50">
                <td className="py-1.5">{h.days}d</td>
                <td className="py-1.5">{pctCell(h.closePct)}</td>
                <td className="py-1.5">{pctCell(h.maxHighPct)}</td>
                <td className="py-1.5">{pctCell(h.minLowPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {outcome.stopTarget && (
          <p
            className={`rounded-md border p-2.5 text-sm ${
              outcome.stopTarget.firstHit === "TARGET"
                ? "border-positive/40 bg-positive/5"
                : outcome.stopTarget.firstHit === "STOP"
                  ? "border-negative/40 bg-negative/5"
                  : "border-border bg-accent/40"
            }`}
          >
            {verdict(outcome)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
