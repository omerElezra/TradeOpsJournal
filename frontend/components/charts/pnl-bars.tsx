"use client";

import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { C } from "@/lib/chart-theme";
import { ChartTooltip } from "./chart-tooltip";
import type { AnalyticsTrade } from "@/types";

interface Props {
  data: AnalyticsTrade[];
  height?: number;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtUsd(v: number) {
  const abs = Math.abs(v);
  const prefix = v < 0 ? "-$" : "$";
  if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(1)}k`;
  return `${prefix}${abs.toFixed(0)}`;
}

export function PnlBars({ data, height = 220 }: Props) {
  if (!data.length) return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No closed trades in range
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={fmtDate}
          tick={{ fill: C.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tickFormatter={fmtUsd}
          tick={{ fill: C.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={48}
        />
        <Tooltip
          content={
            <ChartTooltip
              formatLabel={(l) => `${fmtDate(String(l))}`}
              formatValue={(v, _) => (v >= 0 ? "+" : "") + "$" + Math.abs(v).toFixed(2)}
            />
          }
        />
        <ReferenceLine y={0} stroke={C.axis} />

        <Bar dataKey="netPnl" name="P&L" radius={[2, 2, 0, 0]} maxBarSize={24}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={
                entry.result === "WIN"
                  ? C.positive
                  : entry.result === "LOSS"
                  ? C.negative
                  : C.neutral
              }
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
