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
import type { MonthlyPerformance } from "@/types";

interface Props {
  data: MonthlyPerformance[];
  height?: number;
}

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
  });
}

function fmtUsd(v: number) {
  const abs = Math.abs(v);
  const prefix = v < 0 ? "-$" : "$";
  if (abs >= 1000) return `${prefix}${(abs / 1000).toFixed(1)}k`;
  return `${prefix}${abs.toFixed(0)}`;
}

export function MonthlyPnlChart({ data, height = 220 }: Props) {
  if (!data.length) return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No data
    </div>
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
        <XAxis
          dataKey="month"
          tickFormatter={fmtMonth}
          tick={{ fill: C.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={fmtUsd}
          tick={{ fill: C.text, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip
          formatter={(value: unknown, _name: unknown, props: { payload?: MonthlyPerformance }) => {
            const v = Number(value ?? 0);
            const row = props.payload;
            return [
              `$${v.toFixed(2)} (${row?.wins ?? 0}W / ${row?.losses ?? 0}L)`,
              "Net P&L",
            ];
          }}
          labelFormatter={(label: unknown) => fmtMonth(String(label))}
          contentStyle={{
            background: C.tooltip.bg,
            border: `1px solid ${C.tooltip.border}`,
            borderRadius: 6,
            fontSize: 12,
            color: "#f4f4f5",
          }}
          labelStyle={{ color: "#a1a1aa" }}
          itemStyle={{ color: "#f4f4f5" }}
        />
        <ReferenceLine y={0} stroke={C.axis} />

        <Bar dataKey="netPnl" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {data.map((entry, i) => (
            <Cell key={i} fill={entry.netPnl >= 0 ? C.positive : C.negative} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
