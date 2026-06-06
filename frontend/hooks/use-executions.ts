"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { ExecutionQuery } from "@/types";

export function useExecutions(params: ExecutionQuery) {
  return useQuery({
    queryKey: qk.executions(params),
    queryFn: () => api.getExecutions(params),
    placeholderData: keepPreviousData,
  });
}
