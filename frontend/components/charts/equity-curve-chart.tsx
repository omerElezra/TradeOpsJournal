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
import type { EquityPoint } from "@/types";

interface Props {
  data: EquityPoint[];
  height?: number;
  showDrawdown?: boolean;
}

function fmtDate(iso: string | number) {
  return new Date(String(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtUsd(v: number) {
  const abs = Math.abs(v);
  const prefix = v < 0 ? "-$" : "$";
  if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(1)}k`;
  return `${prefix}${abs.toFixed(0)}`;
}

export function EquityCurveChart({ data, height = 260, showDrawdown = false }: Props) {
  if (!data.length) return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No closed trades in range
    </div>
  );

  const last = data[data.length - 1];
  const isPositive = (last?.equity ?? 0) >= 0;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={isPositive ? C.positive : C.negative} stopOpacity={0.25} />
            <stop offset="95%" stopColor={isPositive ? C.positive : C.negative} stopOpacity={0.02} />
          </linearGradient>
          {showDrawdown && (
            <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={C.negative} stopOpacity={0.18} />
              <stop offset="95%" stopColor={C.negative} stopOpacity={0.02} />
            </linearGradient>
          )}
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
          width={48}
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
          dataKey="equity"
          name="Equity"
          stroke={isPositive ? C.positive : C.negative}
          strokeWidth={2}
          fill="url(#equityFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0 }}
        />

        {showDrawdown && (
          <Area
            type="monotone"
            dataKey="drawdown"
            name="Drawdown"
            stroke={C.negative}
            strokeWidth={1.5}
            fill="url(#ddFill)"
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
