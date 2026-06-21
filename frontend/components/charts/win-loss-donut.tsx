"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { C } from "@/lib/chart-theme";

interface Props {
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
}

export function WinLossDonut({ wins, losses, breakevens, winRate }: Props) {
  const total = wins + losses + breakevens;
  if (!total) return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No closed trades
    </div>
  );

  const data = [
    { name: "Wins",       value: wins,       color: C.positive },
    { name: "Losses",     value: losses,     color: C.negative },
    { name: "Breakevens", value: breakevens, color: C.neutral  },
  ].filter(d => d.value > 0);

  return (
    <div className="relative flex items-center justify-center">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={62}
            outerRadius={88}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: unknown, name: unknown) => [`${value} trades`, String(name)]}
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
        </PieChart>
      </ResponsiveContainer>

      {/* Centre label */}
      <div className="pointer-events-none absolute flex flex-col items-center">
        <span className="text-2xl font-bold tabular" style={{ color: C.positive }}>
          {winRate.toFixed(1)}%
        </span>
        <span className="text-xs text-muted-foreground">win rate</span>
      </div>

      {/* Legend */}
      <div className="absolute bottom-0 flex gap-4 text-xs text-muted-foreground">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
            {d.name} ({d.value})
          </span>
        ))}
      </div>
    </div>
  );
}
