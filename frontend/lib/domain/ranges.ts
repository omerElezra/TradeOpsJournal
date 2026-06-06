import "server-only";

const VALID = new Set(["7d", "30d", "90d", "ytd", "all"]);
const DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export function resolveRange(
  range?: string | null,
  from?: string | null,
  to?: string | null,
): [Date, Date] {
  const now = new Date();

  if (from && to) return [new Date(from), new Date(to)];

  const key = (range ?? "30d").toLowerCase();
  if (!VALID.has(key)) return resolveRange("30d");
  if (key === "all") return [new Date(0), now];
  if (key === "ytd") return [new Date(now.getFullYear(), 0, 1), now];

  return [new Date(now.getTime() - DAYS[key] * 86400000), now];
}
