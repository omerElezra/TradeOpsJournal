"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { AccountTxnQuery, Range } from "@/types";

export function useAccountTxns(params: AccountTxnQuery) {
  return useQuery({
    queryKey: qk.accountTxns(params),
    queryFn: () => api.getAccountTxns(params),
    placeholderData: keepPreviousData,
  });
}

export function useAccountTxnSummary(range: Range) {
  return useQuery({
    queryKey: qk.accountTxnsSummary(range),
    queryFn: () => api.getAccountTxnSummary(range),
  });
}

export function useInterestAccruals(range: Range) {
  return useQuery({
    queryKey: qk.interestAccruals(range),
    queryFn: () => api.getInterestAccruals(range),
  });
}
