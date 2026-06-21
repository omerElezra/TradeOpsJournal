"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export function useTransactionsSummary() {
  return useQuery({
    queryKey: qk.transactionsSummary(),
    queryFn: () => api.getTransactionsSummary(),
  });
}
