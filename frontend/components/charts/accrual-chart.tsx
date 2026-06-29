"use client";

import {
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { C } from "@/lib/chart-theme";
import { ChartTooltip } from "./chart-tooltip";
import type { AccrualPoint } from "@/types";

interface Props {
  data: AccrualPoint[];
  height?: number;
}

function fmtDate(iso: string | number) {
  return new Date(String(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtUsd(v: number) {
  const abs = Math.abs(v);
  const prefix = v < 0 ? "-$" : "$";
  if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(1)}k`;
  return `${prefix}${abs.toFixed(abs < 10 ? 2 : 0)}`;
}

export function AccrualChart({ data, height = 240 }: Props) {
  if (!data.length) return (
    <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height }}>
      No interest accruals in range
    </div>
  );

  // Accrued interest is typically a debit (negative). Colour the cumulative
  // line by its ending sign so a net charge reads red, a net credit green.
  const last = data[data.length - 1];
  const isPositive = (last?.cumulative ?? 0) >= 0;
  const color = isPositive ? C.positive : C.negative;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="accrualFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis
          dataKey="t"
          tickFormatter={fmtDate}
          tick={{ fill: C.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={60}
        />
        <YAxis
          tickFormatter={fmtUsd}
          tick={{ fill: C.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          content={
            <ChartTooltip
              formatLabel={fmtDate}
              formatValue={(v) => (v >= 0 ? "+" : "") + "$" + v.toFixed(2)}
            />
          }
        />
        <ReferenceLine y={0} stroke={C.axis} strokeDasharray="3 3" />

        <Area
          type="monotone"
          dataKey="cumulative"
          name="Cumulative accrued"
          stroke={color}
          strokeWidth={2}
          fill="url(#accrualFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
