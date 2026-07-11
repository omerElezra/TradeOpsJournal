"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export function useEnrichment(tradeId: string) {
  return useQuery({
    queryKey: qk.enrichment(tradeId),
    queryFn: () => api.getTradeEnrichment(tradeId),
    enabled: Boolean(tradeId),
  });
}

export function useComputeEnrichment(tradeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.computeTradeEnrichment(tradeId),
    onSuccess: (row) => qc.setQueryData(qk.enrichment(tradeId), row),
  });
}
