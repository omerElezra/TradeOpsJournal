"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  EntryCheckRequest,
  ScoringRuleInput,
  TradePlanCreate,
  TradePlanUpdate,
} from "@/lib/api";
import type { TradePlanQuery } from "@/lib/domain/pre-entry";
import { qk } from "@/lib/query-keys";

export function useComputeEntryCheck() {
  return useMutation({
    mutationFn: (body: EntryCheckRequest) => api.computeEntryCheck(body),
  });
}

export function useScoringRules() {
  return useQuery({
    queryKey: qk.scoringRules(),
    queryFn: () => api.getScoringRules(),
  });
}

export function useSaveScoringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rule }: { id: number | null; rule: ScoringRuleInput }) =>
      id == null ? api.createScoringRule(rule) : api.updateScoringRule(id, rule),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scoringRules() }),
  });
}

export function useToggleScoringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.updateScoringRule(id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scoringRules() }),
  });
}

export function useDeleteScoringRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteScoringRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.scoringRules() }),
  });
}

export function useTradePlans(params: TradePlanQuery = {}) {
  return useQuery({
    queryKey: qk.tradePlans(params),
    queryFn: () => api.listTradePlans(params),
  });
}

export function useSaveTradePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: TradePlanCreate) => api.createTradePlan(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradePlans"] }),
  });
}

export function useUpdateTradePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: TradePlanUpdate }) =>
      api.updateTradePlan(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradePlans"] }),
  });
}

export function useDeleteTradePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteTradePlan(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tradePlans"] }),
  });
}
