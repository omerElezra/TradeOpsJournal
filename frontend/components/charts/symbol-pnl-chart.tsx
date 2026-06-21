"use client";

import { C } from "@/lib/chart-theme";
import type { SymbolPerformance } from "@/types";

interface Props {
  data: SymbolPerformance[];
  totalPnl: number;
}

function fmt(v: number) {
  const sign = v >= 0 ? "+" : "";
  const abs = Math.abs(v);
  if (abs >= 1000) return `${sign}$${(v / 1000).toFixed(1)}k`;
  return `${sign}$${v.toFixed(0)}`;
}

export function SymbolPnlChart({ data, totalPnl }: Props) {
  if (!data.length) return (
    <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
      No data
    </div>
  );

  const maxAbs = Math.max(...data.map(d => Math.abs(d.netPnl)));

  return (
    <div className="space-y-0.5">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-1 pb-1 text-[11px] text-muted-foreground">
        <span>Symbol</span>
        <span className="text-right">Trades</span>
        <span className="text-right w-14">P&amp;L</span>
        <span className="text-right w-12">P&amp;L %</span>
        <span className="text-right w-14">Contrib</span>
      </div>

      {data.map(row => {
        const isPos = row.netPnl >= 0;
        const barPct = maxAbs > 0 ? (Math.abs(row.netPnl) / maxAbs) * 100 : 0;
        const contribution = totalPnl !== 0
          ? (row.netPnl / Math.abs(totalPnl)) * 100
          : 0;
        const color = isPos ? C.positive : C.negative;

        return (
          <div
            key={row.symbol}
            className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 items-center rounded-md px-1 py-1.5 hover:bg-accent/40 transition-colors"
          >
            {/* Symbol + mini bar */}
            <div className="min-w-0">
              <span className="text-xs font-medium">{row.symbol}</span>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${barPct}%`, background: color }}
                />
              </div>
            </div>

            <span className="text-[11px] tabular-nums text-muted-foreground">
              {row.tradeCount}
            </span>
            <span
              className="text-[11px] tabular-nums font-medium w-14 text-right"
              style={{ color }}
            >
              {fmt(row.netPnl)}
            </span>
            <span
              className="text-[11px] tabular-nums w-12 text-right"
              style={{ color }}
            >
              {row.returnPct >= 0 ? "+" : ""}{row.returnPct.toFixed(1)}%
            </span>
            <span
              className="text-[11px] tabular-nums w-14 text-right text-muted-foreground"
            >
              {contribution >= 0 ? "+" : ""}{contribution.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
