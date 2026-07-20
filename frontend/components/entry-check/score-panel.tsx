"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ScoreResult } from "@/lib/domain/scoring";

function PointsChip({ points }: { points: number }) {
  const cls =
    points > 0
      ? "border-positive/50 bg-positive/10 text-positive"
      : "border-negative/50 bg-negative/10 text-negative";
  return (
    <span className={`tabular inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {points > 0 ? `+${points}` : points}
    </span>
  );
}

export function ScorePanel({ result }: { result: ScoreResult }) {
  const [showSkipped, setShowSkipped] = React.useState(false);
  const scoreCls =
    result.score > 0
      ? "text-positive"
      : result.score < 0
        ? "text-negative"
        : "text-foreground";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-foreground">Entry Score</CardTitle>
        <span className={`tabular text-3xl font-bold ${scoreCls}`}>
          {result.score > 0 ? `+${result.score}` : result.score}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {result.fired.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rules fired yet — fill the checklist and compute the context.
          </p>
        ) : (
          <ul className="space-y-2">
            {result.fired.map((f, i) => (
              <li
                key={`${f.label}-${i}`}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-2.5"
              >
                <div>
                  <p className="text-sm font-medium">{f.label}</p>
                  {f.note && <p className="text-xs text-muted-foreground">{f.note}</p>}
                </div>
                <PointsChip points={f.points} />
              </li>
            ))}
          </ul>
        )}

        {result.skipped.length > 0 && (
          <div className="space-y-1.5">
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowSkipped((s) => !s)}
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showSkipped ? "rotate-180" : ""}`}
              />
              {result.skipped.length} rule{result.skipped.length > 1 ? "s" : ""} not
              evaluated (missing data)
            </button>
            {showSkipped && (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {result.skipped.map((s, i) => (
                  <li key={`${s.label}-${i}`}>
                    {s.label} — {s.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
