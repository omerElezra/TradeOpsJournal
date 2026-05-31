"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { Range } from "@/types";

export function useMetrics(range: Range) {
  return useQuery({
    queryKey: qk.metrics(range),
    queryFn: () => api.getMetrics(range),
  });
}

export function useEquityCurve(range: Range) {
  return useQuery({
    queryKey: qk.equity(range),
    queryFn: () => api.getEquityCurve(range),
  });
}

export function useInsights(range: Range) {
  return useQuery({
    queryKey: qk.insights(range),
    queryFn: () => api.getInsights(range),
  });
}
