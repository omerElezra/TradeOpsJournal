"use client";

interface Payload {
  color?: string;
  name?: string;
  value?: number | string;
}

interface Props {
  active?: boolean;
  payload?: Payload[];
  label?: string | number;
  formatValue?: (v: number, name: string) => string;
  formatLabel?: (l: string | number) => string;
}

export function ChartTooltip({ active, payload, label, formatValue, formatLabel }: Props) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-[#2a2a32] bg-[#1c1c22] px-3 py-2 shadow-lg text-xs text-[#f4f4f5]">
      {label !== undefined && (
        <p className="mb-1.5 font-medium text-white/70">
          {formatLabel ? formatLabel(label) : String(label)}
        </p>
      )}
      {payload.map((p, i) => (
        <p key={i} className="font-medium" style={{ color: p.color ?? "#fff" }}>
          {p.name !== "value" && p.name !== "netPnl" && p.name && (
            <span className="mr-1.5 text-white/50">{p.name}:</span>
          )}
          {formatValue && typeof p.value === "number"
            ? formatValue(p.value, p.name ?? "")
            : String(p.value ?? "")}
        </p>
      ))}
    </div>
  );
}
