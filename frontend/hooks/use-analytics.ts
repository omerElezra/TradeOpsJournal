"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { Range } from "@/types";

export function useAnalytics(range: Range) {
  return useQuery({
    queryKey: qk.analytics(range),
    queryFn: () => api.getAnalytics(range),
  });
}
