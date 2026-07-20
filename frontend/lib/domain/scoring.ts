// Pre-entry scoring — transparent, user-editable rules over a curated fact
// catalog. Pure module (no server-only): the page evaluates the score live as
// the user edits the checklist, and the API re-evaluates authoritatively on
// save. No free-form expressions — a rule is an AND of typed predicates over
// known fields, so the score is always explainable ("which rules fired, why").

import type { Side } from "@/types";
import type { PreEntryContext } from "./pre-entry";

// ─── Checklist (manual answers saved with a plan) ────────────────────────────

/**
 * How the entry was (or will be) triggered — the discipline dimension, kept
 * separate from the technical setup. Canonical list lives here because the
 * scoring catalog exposes it as an enum; the UI re-exports it from
 * journal-presets. The last two options are the "no confirmation" entries.
 */
export const ENTRY_CONFIRMATION_OPTIONS = [
  "Breakout confirmed",
  "MA bounce confirmed",
  "Reclaim confirmed",
  "Planned alert triggered",
  "Anticipating early (no confirmation)",
  "FOMO / chasing",
];

export interface EntryChecklist {
  candlePattern: string | null;
  recentTrend: string | null;
  volumeVsTrend: string | null;
  maRelation: string[];
  openGaps: string[];
  supportResFib: string[];
  setup: string | null;
  entryConfirmation: string | null;
  plannedStop: number | null;
  plannedTarget: number | null;
  conviction: number | null;
}

export function emptyChecklist(): EntryChecklist {
  return {
    candlePattern: null,
    recentTrend: null,
    volumeVsTrend: null,
    maRelation: [],
    openGaps: [],
    supportResFib: [],
    setup: null,
    entryConfirmation: null,
    plannedStop: null,
    plannedTarget: null,
    conviction: null,
  };
}

// ─── Rule model ──────────────────────────────────────────────────────────────

export type RuleOp =
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "eq"
  | "neq"
  | "in"
  | "isTrue"
  | "isFalse";

export interface RulePredicate {
  field: string;
  op: RuleOp;
  value?: number | string | string[] | null;
}

export interface ScoringRule {
  /** Null before the rule is persisted. */
  id: number | null;
  label: string;
  /** ANDed predicates; must be non-empty. */
  conditions: RulePredicate[];
  points: number;
  note: string;
  enabled: boolean;
  sortOrder: number;
}

// ─── Curated fact catalog ────────────────────────────────────────────────────

export interface ScoringFieldDef {
  key: string;
  label: string;
  type: "number" | "boolean" | "enum";
  enumValues?: string[];
  group: "Stock" | "Market" | "Derived" | "Checklist";
}

const TREND_VALUES = ["BULLISH", "BEARISH", "MIXED", "UNKNOWN"];
const VIX_REGIMES = ["LOW", "NORMAL", "ELEVATED", "EXTREME", "UNKNOWN"];
const CHECKLIST_TRENDS = ["Up", "Down", "Consolidating"];
const CHECKLIST_VOLUMES = [
  "Volume supports trend",
  "Volume dropping (weakening)",
  "Climax volume",
];

export const SCORING_FIELDS: ScoringFieldDef[] = [
  { key: "stockContext.aboveMa20", label: "Above MA20", type: "boolean", group: "Stock" },
  { key: "stockContext.aboveMa50", label: "Above MA50", type: "boolean", group: "Stock" },
  { key: "stockContext.aboveMa150", label: "Above MA150", type: "boolean", group: "Stock" },
  { key: "stockContext.maAlignment", label: "MA alignment", type: "enum", enumValues: TREND_VALUES, group: "Stock" },
  { key: "stockContext.distanceFromMa20Pct", label: "Distance from MA20 (%)", type: "number", group: "Stock" },
  { key: "stockContext.distanceFromMa50Pct", label: "Distance from MA50 (%)", type: "number", group: "Stock" },
  { key: "stockContext.return5dPct", label: "Return 5d (%)", type: "number", group: "Stock" },
  { key: "stockContext.return20dPct", label: "Return 20d (%)", type: "number", group: "Stock" },
  { key: "stockContext.return60dPct", label: "Return 60d (%)", type: "number", group: "Stock" },
  { key: "stockContext.relativeVolume", label: "Relative volume (×)", type: "number", group: "Stock" },
  { key: "stockContext.atrPct", label: "ATR (%)", type: "number", group: "Stock" },
  { key: "marketContext.marketBias", label: "Market bias (SPY+QQQ)", type: "enum", enumValues: TREND_VALUES, group: "Market" },
  { key: "marketContext.marketSupportiveForTrade", label: "Market supports trade", type: "boolean", group: "Market" },
  { key: "marketContext.vix.level", label: "VIX level", type: "number", group: "Market" },
  { key: "marketContext.vix.regime", label: "VIX regime", type: "enum", enumValues: VIX_REGIMES, group: "Market" },
  { key: "marketContext.vix.return5dPct", label: "VIX 5d change (%)", type: "number", group: "Market" },
  { key: "derived.trendAgainstDirection", label: "MA trend against direction", type: "boolean", group: "Derived" },
  { key: "derived.vixAgainstDirection", label: "VIX regime against direction", type: "boolean", group: "Derived" },
  { key: "checklist.conviction", label: "Conviction (1–10)", type: "number", group: "Checklist" },
  { key: "checklist.recentTrend", label: "Recent trend (checklist)", type: "enum", enumValues: CHECKLIST_TRENDS, group: "Checklist" },
  { key: "checklist.volumeVsTrend", label: "Volume vs trend (checklist)", type: "enum", enumValues: CHECKLIST_VOLUMES, group: "Checklist" },
  { key: "checklist.setup", label: "Setup (checklist)", type: "enum", group: "Checklist" },
  { key: "checklist.entryConfirmation", label: "Entry confirmation (checklist)", type: "enum", enumValues: ENTRY_CONFIRMATION_OPTIONS, group: "Checklist" },
];

const FIELD_BY_KEY = new Map(SCORING_FIELDS.map((f) => [f.key, f]));

const OPS_BY_TYPE: Record<ScoringFieldDef["type"], RuleOp[]> = {
  number: ["gt", "gte", "lt", "lte", "eq"],
  boolean: ["isTrue", "isFalse"],
  enum: ["eq", "neq", "in"],
};

// ─── Facts ───────────────────────────────────────────────────────────────────

export type ScoringFacts = Record<string, number | string | boolean | null>;

/** Flatten context + checklist into the fact record the rules evaluate over. */
export function buildScoringFacts(
  ctx: PreEntryContext,
  checklist: EntryChecklist,
): ScoringFacts {
  const sc = ctx.stockContext;
  const mc = ctx.marketContext;
  const direction: Side = ctx.direction;

  const trendAgainstDirection =
    sc.maAlignment === "UNKNOWN"
      ? null
      : (direction === "LONG" && sc.maAlignment === "BEARISH") ||
        (direction === "SHORT" && sc.maAlignment === "BULLISH");
  const vixAgainstDirection =
    mc.vix.regime === "UNKNOWN"
      ? null
      : direction === "LONG" &&
        (mc.vix.regime === "ELEVATED" || mc.vix.regime === "EXTREME");

  return {
    "stockContext.aboveMa20": sc.aboveMa20,
    "stockContext.aboveMa50": sc.aboveMa50,
    "stockContext.aboveMa150": sc.aboveMa150,
    "stockContext.maAlignment": sc.maAlignment,
    "stockContext.distanceFromMa20Pct": sc.distanceFromMa20Pct,
    "stockContext.distanceFromMa50Pct": sc.distanceFromMa50Pct,
    "stockContext.return5dPct": sc.return5dPct,
    "stockContext.return20dPct": sc.return20dPct,
    "stockContext.return60dPct": sc.return60dPct,
    "stockContext.relativeVolume": sc.relativeVolume,
    "stockContext.atrPct": sc.atrPct,
    "marketContext.marketBias": mc.marketBias,
    "marketContext.marketSupportiveForTrade": mc.marketSupportiveForTrade,
    "marketContext.vix.level": mc.vix.level,
    "marketContext.vix.regime": mc.vix.regime,
    "marketContext.vix.return5dPct": mc.vix.return5dPct,
    "derived.trendAgainstDirection": trendAgainstDirection,
    "derived.vixAgainstDirection": vixAgainstDirection,
    "checklist.conviction": checklist.conviction,
    "checklist.recentTrend": checklist.recentTrend,
    "checklist.volumeVsTrend": checklist.volumeVsTrend,
    "checklist.setup": checklist.setup,
    "checklist.entryConfirmation": checklist.entryConfirmation,
  };
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

export interface FiredRule {
  ruleId: number | null;
  label: string;
  points: number;
  note: string;
}

export interface ScoreResult {
  score: number;
  fired: FiredRule[];
  /** Rules that could not be evaluated (missing data / malformed) — transparent, never a silent zero. */
  skipped: { label: string; reason: string }[];
}

type PredicateOutcome = { kind: "match" } | { kind: "noMatch" } | { kind: "skip"; reason: string };

function evalPredicate(p: RulePredicate, facts: ScoringFacts): PredicateOutcome {
  if (!(p.field in facts)) return { kind: "skip", reason: `unknown field: ${p.field}` };
  const fact = facts[p.field];
  if (fact == null || fact === "UNKNOWN")
    return { kind: "skip", reason: `missing data: ${p.field}` };

  switch (p.op) {
    case "isTrue":
      return fact === true ? { kind: "match" } : { kind: "noMatch" };
    case "isFalse":
      return fact === false ? { kind: "match" } : { kind: "noMatch" };
    case "eq":
      return fact === p.value ? { kind: "match" } : { kind: "noMatch" };
    case "neq":
      return fact !== p.value ? { kind: "match" } : { kind: "noMatch" };
    case "in":
      return Array.isArray(p.value) && p.value.includes(String(fact))
        ? { kind: "match" }
        : { kind: "noMatch" };
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (typeof fact !== "number" || typeof p.value !== "number")
        return { kind: "skip", reason: `non-numeric comparison: ${p.field}` };
      const ok =
        p.op === "gt" ? fact > p.value :
        p.op === "gte" ? fact >= p.value :
        p.op === "lt" ? fact < p.value :
        fact <= p.value;
      return ok ? { kind: "match" } : { kind: "noMatch" };
    }
    default:
      return { kind: "skip", reason: `unknown op: ${String(p.op)}` };
  }
}

/** Evaluate enabled rules over the facts. AND semantics per rule. */
export function evaluateScore(rules: ScoringRule[], facts: ScoringFacts): ScoreResult {
  const fired: FiredRule[] = [];
  const skipped: ScoreResult["skipped"] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
      skipped.push({ label: rule.label, reason: "rule has no conditions" });
      continue;
    }
    let matchedAll = true;
    let skipReason: string | null = null;
    for (const p of rule.conditions) {
      const out = evalPredicate(p, facts);
      if (out.kind === "skip") {
        skipReason = out.reason;
        break;
      }
      if (out.kind === "noMatch") {
        matchedAll = false;
        break;
      }
    }
    if (skipReason != null) {
      skipped.push({ label: rule.label, reason: skipReason });
    } else if (matchedAll) {
      fired.push({ ruleId: rule.id, label: rule.label, points: rule.points, note: rule.note });
    }
  }

  return { score: fired.reduce((s, f) => s + f.points, 0), fired, skipped };
}

// ─── Validation (API write path + rule editor) ───────────────────────────────

export function validateRule(
  raw: unknown,
): { ok: true; rule: Omit<ScoringRule, "id" | "sortOrder"> & { sortOrder?: number } } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw == null) return { ok: false, error: "rule must be an object" };
  const rule = raw as Record<string, unknown>;

  const label = typeof rule.label === "string" ? rule.label.trim() : "";
  if (!label) return { ok: false, error: "label is required" };

  const points = rule.points;
  if (typeof points !== "number" || !Number.isInteger(points) || Math.abs(points) > 10 || points === 0)
    return { ok: false, error: "points must be a non-zero integer between -10 and 10" };

  if (!Array.isArray(rule.conditions) || rule.conditions.length === 0)
    return { ok: false, error: "at least one condition is required" };

  for (const c of rule.conditions) {
    if (typeof c !== "object" || c == null) return { ok: false, error: "condition must be an object" };
    const p = c as Record<string, unknown>;
    const def = typeof p.field === "string" ? FIELD_BY_KEY.get(p.field) : undefined;
    if (!def) return { ok: false, error: `unknown field: ${String(p.field)}` };
    const op = p.op as RuleOp;
    if (!OPS_BY_TYPE[def.type].includes(op))
      return { ok: false, error: `op "${String(p.op)}" is not valid for ${def.type} field ${def.key}` };
    if (def.type === "number" && typeof p.value !== "number")
      return { ok: false, error: `field ${def.key} needs a numeric value` };
    if (def.type === "enum") {
      if (op === "in") {
        if (!Array.isArray(p.value) || !p.value.length || !p.value.every((v) => typeof v === "string"))
          return { ok: false, error: `field ${def.key} with "in" needs a string array value` };
      } else if (typeof p.value !== "string" || !p.value) {
        return { ok: false, error: `field ${def.key} needs a string value` };
      }
    }
  }

  return {
    ok: true,
    rule: {
      label,
      conditions: rule.conditions as RulePredicate[],
      points,
      note: typeof rule.note === "string" ? rule.note : "",
      enabled: rule.enabled !== false,
      sortOrder: typeof rule.sortOrder === "number" ? rule.sortOrder : undefined,
    },
  };
}

/** Mirrors the migration 010 seed — single source for tests and docs. */
export const DEFAULT_RULES: Omit<ScoringRule, "id">[] = [
  {
    label: "Above MA20 with supportive volume",
    conditions: [
      { field: "stockContext.aboveMa20", op: "isTrue" },
      { field: "stockContext.relativeVolume", op: "gte", value: 1.1 },
    ],
    points: 2,
    note: "Trend + participation aligned",
    enabled: true,
    sortOrder: 1,
  },
  {
    label: "Overextended from MA20",
    conditions: [{ field: "stockContext.distanceFromMa20Pct", op: "gt", value: 7 }],
    points: -3,
    note: "Chasing — high snap-back risk",
    enabled: true,
    sortOrder: 2,
  },
  {
    label: "VIX elevated against direction",
    conditions: [{ field: "derived.vixAgainstDirection", op: "isTrue" }],
    points: -3,
    note: "Risk-off regime punishes this side",
    enabled: true,
    sortOrder: 3,
  },
  {
    label: "Market bias supportive",
    conditions: [{ field: "marketContext.marketSupportiveForTrade", op: "isTrue" }],
    points: 2,
    note: "SPY+QQQ aligned with the trade",
    enabled: true,
    sortOrder: 4,
  },
  {
    label: "Against prevailing trend",
    conditions: [{ field: "derived.trendAgainstDirection", op: "isTrue" }],
    points: -2,
    note: "Fighting the MA stack",
    enabled: true,
    sortOrder: 5,
  },
  {
    label: "Low conviction",
    conditions: [{ field: "checklist.conviction", op: "lte", value: 4 }],
    points: -1,
    note: "If you don't believe it, size down or skip",
    enabled: true,
    sortOrder: 6,
  },
  {
    label: "Entered without confirmation",
    conditions: [
      {
        field: "checklist.entryConfirmation",
        op: "in",
        value: ["Anticipating early (no confirmation)", "FOMO / chasing"],
      },
    ],
    points: -2,
    note: "The pattern hasn't proven itself yet — wait for the close/volume",
    enabled: true,
    sortOrder: 7,
  },
];

/** Human-readable one-line summary of a rule's conditions for list rows. */
export function describeConditions(conditions: RulePredicate[]): string {
  const opText: Record<RuleOp, string> = {
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    eq: "=",
    neq: "≠",
    in: "in",
    isTrue: "is true",
    isFalse: "is false",
  };
  return conditions
    .map((c) => {
      const label = FIELD_BY_KEY.get(c.field)?.label ?? c.field;
      if (c.op === "isTrue" || c.op === "isFalse") return `${label} ${opText[c.op]}`;
      const v = Array.isArray(c.value) ? `[${c.value.join(", ")}]` : String(c.value);
      return `${label} ${opText[c.op]} ${v}`;
    })
    .join(" AND ");
}
