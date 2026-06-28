"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { C } from "@/lib/chart-theme";
import type { AnalyticsTrade } from "@/types";

interface Props {
  data: AnalyticsTrade[];
  height?: number;
}

function fmtMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function calcAvg(minutes: (number | null)[]): number {
  const valid = minutes.filter((m): m is number => m !== null);
  if (!valid.length) return 0;
  return valid.reduce((s, m) => s + m, 0) / valid.length;
}

type ScatterPoint = { x: number; y: number; symbol: string };

export function HoldTimeChart({ data, height = 260 }: Props) {
  const withTime = data.filter(t => t.holdingMinutes != null);

  const winData: ScatterPoint[] = withTime
    .filter(t => t.result === "WIN")
    .map(t => ({ x: t.holdingMinutes!, y: t.netPnl, symbol: t.symbol }));

  const lossData: ScatterPoint[] = withTime
    .filter(t => t.result === "LOSS")
    .map(t => ({ x: t.holdingMinutes!, y: t.netPnl, symbol: t.symbol }));

  const beData: ScatterPoint[] = withTime
    .filter(t => t.result === "BREAKEVEN")
    .map(t => ({ x: t.holdingMinutes!, y: t.netPnl, symbol: t.symbol }));

  const avgWin = calcAvg(withTime.filter(t => t.result === "WIN").map(t => t.holdingMinutes));
  const avgLoss = calcAvg(withTime.filter(t => t.result === "LOSS").map(t => t.holdingMinutes));

  const bias =
    !winData.length || !lossData.length
      ? "insufficient_data"
      : avgLoss <= avgWin
      ? "healthy"
      : "warning";

  if (!withTime.length) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No hold-time data
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: C.positive }} />
          <span className="text-muted-foreground">Avg winner hold:</span>
          <span className="font-medium">{fmtMinutes(Math.round(avgWin))}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: C.negative }} />
          <span className="text-muted-foreground">Avg loser hold:</span>
          <span className="font-medium">{fmtMinutes(Math.round(avgLoss))}</span>
        </span>
        {bias !== "insufficient_data" && (
          <span
            className={`rounded px-2 py-0.5 font-medium ${
              bias === "healthy"
                ? "bg-emerald-900/40 text-emerald-400"
                : "bg-amber-900/40 text-amber-400"
            }`}
          >
            {bias === "healthy" ? "Healthy" : "Holding losers too long"}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
          <XAxis
            type="number"
            dataKey="x"
            name="Hold Time"
            tickFormatter={(v: number) => fmtMinutes(v)}
            tick={{ fill: C.text, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Net P&L"
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
            tick={{ fill: C.text, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <ReferenceLine y={0} stroke={C.axis} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3", stroke: C.axis }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as ScatterPoint;
              return (
                <div
                  style={{
                    background: C.tooltip.bg,
                    border: `1px solid ${C.tooltip.border}`,
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 12,
                    color: "#f4f4f5",
                  }}
                >
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>{d.symbol}</p>
                  <p style={{ color: "#a1a1aa" }}>
                    Hold:{" "}
                    <span style={{ color: "#f4f4f5" }}>{fmtMinutes(d.x)}</span>
                  </p>
                  <p style={{ color: "#a1a1aa" }}>
                    P&L:{" "}
                    <span style={{ color: d.y >= 0 ? C.positive : C.negative }}>
                      ${d.y.toFixed(2)}
                    </span>
                  </p>
                </div>
              );
            }}
          />
          {winData.length > 0 && (
            <Scatter name="Winners" data={winData} fill={C.positive} fillOpacity={0.7} r={4} />
          )}
          {lossData.length > 0 && (
            <Scatter name="Losers" data={lossData} fill={C.negative} fillOpacity={0.7} r={4} />
          )}
          {beData.length > 0 && (
            <Scatter name="Breakeven" data={beData} fill={C.neutral} fillOpacity={0.7} r={4} />
          )}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
