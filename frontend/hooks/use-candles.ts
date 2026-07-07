"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { CandleQuery } from "@/types";

export function useCandles(params: CandleQuery, enabled = true) {
  return useQuery({
    queryKey: qk.candles(params),
    queryFn: () => api.getCandles(params),
    // Historical candles never change — keep them for the session.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    enabled: enabled && Boolean(params.symbol),
  });
}
