import type { Range, TradeQuery } from "@/types";

export const qk = {
  metrics: (range: Range) => ["metrics", range] as const,
  equity: (range: Range) => ["equity", range] as const,
  trades: (params: TradeQuery) => ["trades", params] as const,
  trade: (id: string) => ["trade", id] as const,
  insights: (range: Range) => ["insights", range] as const,
};
