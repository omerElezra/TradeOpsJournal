"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { TradeQuery } from "@/types";

export function useTrades(params: TradeQuery) {
  return useQuery({
    queryKey: qk.trades(params),
    queryFn: () => api.getTrades(params),
    placeholderData: keepPreviousData,
  });
}

export function useTrade(id: string) {
  return useQuery({
    queryKey: qk.trade(id),
    queryFn: () => api.getTrade(id),
    enabled: Boolean(id),
  });
}
