"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { CashQuery, Range } from "@/types";

export function useCash(params: CashQuery) {
  return useQuery({
    queryKey: qk.cash(params),
    queryFn: () => api.getCash(params),
    placeholderData: keepPreviousData,
  });
}

export function useCashSummary(range: Range) {
  return useQuery({
    queryKey: qk.cashSummary(range),
    queryFn: () => api.getCashSummary(range),
  });
}
