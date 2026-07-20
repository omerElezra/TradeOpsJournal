"use client";

import * as React from "react";
import { ChevronDown, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inputCls } from "@/components/journal/form-controls";
import {
  useDeleteScoringRule,
  useSaveScoringRule,
  useToggleScoringRule,
} from "@/hooks/use-entry-check";
import {
  SCORING_FIELDS,
  describeConditions,
  type RuleOp,
  type RulePredicate,
  type ScoringRule,
} from "@/lib/domain/scoring";

const OPS_BY_TYPE: Record<"number" | "boolean" | "enum", RuleOp[]> = {
  number: ["gt", "gte", "lt", "lte", "eq"],
  boolean: ["isTrue", "isFalse"],
  enum: ["eq", "neq"],
};

const OP_LABEL: Record<RuleOp, string> = {
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

const GROUPS = ["Stock", "Market", "Derived", "Checklist"] as const;

interface DraftPredicate {
  field: string;
  op: RuleOp;
  value: string;
}

interface DraftRule {
  id: number | null;
  label: string;
  points: string;
  note: string;
  conditions: DraftPredicate[];
}

function fieldDef(key: string) {
  return SCORING_FIELDS.find((f) => f.key === key);
}

function emptyPredicate(): DraftPredicate {
  const first = SCORING_FIELDS[0];
  return { field: first.key, op: OPS_BY_TYPE[first.type][0], value: "" };
}

function emptyDraft(): DraftRule {
  return { id: null, label: "", points: "1", note: "", conditions: [emptyPredicate()] };
}

function toDraft(rule: ScoringRule): DraftRule {
  return {
    id: rule.id,
    label: rule.label,
    points: String(rule.points),
    note: rule.note,
    conditions: rule.conditions.map((c) => ({
      field: c.field,
      op: c.op,
      value: c.value != null ? (Array.isArray(c.value) ? c.value.join(",") : String(c.value)) : "",
    })),
  };
}

function draftToPredicates(draft: DraftRule): RulePredicate[] {
  return draft.conditions.map((c) => {
    const def = fieldDef(c.field);
    if (def?.type === "boolean") return { field: c.field, op: c.op };
    if (def?.type === "number") return { field: c.field, op: c.op, value: Number(c.value) };
    return { field: c.field, op: c.op, value: c.value };
  });
}

function PredicateRow({
  pred,
  onChange,
  onRemove,
  removable,
}: {
  pred: DraftPredicate;
  onChange: (p: DraftPredicate) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const def = fieldDef(pred.field);
  const type = def?.type ?? "number";
  const ops = OPS_BY_TYPE[type];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select
        className={`${inputCls} max-w-56`}
        value={pred.field}
        onChange={(e) => {
          const nextDef = fieldDef(e.target.value);
          const nextType = nextDef?.type ?? "number";
          onChange({ field: e.target.value, op: OPS_BY_TYPE[nextType][0], value: "" });
        }}
      >
        {GROUPS.map((g) => (
          <optgroup key={g} label={g}>
            {SCORING_FIELDS.filter((f) => f.group === g).map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <select
        className={inputCls}
        value={pred.op}
        onChange={(e) => onChange({ ...pred, op: e.target.value as RuleOp })}
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABEL[op]}
          </option>
        ))}
      </select>
      {type === "number" && (
        <input
          type="number"
          step="any"
          className={`${inputCls} w-24`}
          value={pred.value}
          onChange={(e) => onChange({ ...pred, value: e.target.value })}
          placeholder="value"
        />
      )}
      {type === "enum" &&
        (def?.enumValues ? (
          <select
            className={inputCls}
            value={pred.value}
            onChange={(e) => onChange({ ...pred, value: e.target.value })}
          >
            <option value="">choose…</option>
            {def.enumValues.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <input
            className={`${inputCls} w-36`}
            value={pred.value}
            onChange={(e) => onChange({ ...pred, value: e.target.value })}
            placeholder="value"
          />
        ))}
      {removable && (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground"
          onClick={onRemove}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function RuleForm({
  draft,
  setDraft,
  onCancel,
  onSave,
  saving,
  error,
}: {
  draft: DraftRule;
  setDraft: (d: DraftRule) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
}) {
  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} w-64`}
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="Rule label (e.g. Overextended from MA20)"
        />
        <input
          type="number"
          step="1"
          className={`${inputCls} w-20`}
          value={draft.points}
          onChange={(e) => setDraft({ ...draft, points: e.target.value })}
          placeholder="±points"
        />
      </div>
      <div className="space-y-1.5">
        {draft.conditions.map((c, i) => (
          <PredicateRow
            key={i}
            pred={c}
            removable={draft.conditions.length > 1}
            onChange={(p) =>
              setDraft({
                ...draft,
                conditions: draft.conditions.map((x, j) => (j === i ? p : x)),
              })
            }
            onRemove={() =>
              setDraft({
                ...draft,
                conditions: draft.conditions.filter((_, j) => j !== i),
              })
            }
          />
        ))}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() =>
            setDraft({ ...draft, conditions: [...draft.conditions, emptyPredicate()] })
          }
        >
          <Plus className="h-3 w-3" /> AND condition
        </button>
      </div>
      <input
        className={`${inputCls} w-full`}
        value={draft.note}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        placeholder="Note shown when the rule fires (why it matters)"
      />
      {error && <p className="text-xs text-negative">{error}</p>}
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : draft.id == null ? "Add rule" : "Save rule"}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function RuleEditor({ rules }: { rules: ScoringRule[] }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<DraftRule | null>(null);
  const save = useSaveScoringRule();
  const toggle = useToggleScoringRule();
  const del = useDeleteScoringRule();

  const submit = () => {
    if (!draft) return;
    save.mutate(
      {
        id: draft.id,
        rule: {
          label: draft.label.trim(),
          conditions: draftToPredicates(draft),
          points: Number(draft.points),
          note: draft.note,
          enabled: true,
        },
      },
      { onSuccess: () => setDraft(null) },
    );
  };

  return (
    <Card>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-foreground">
            Scoring Rules{" "}
            <span className="text-xs font-normal text-muted-foreground">
              ({rules.filter((r) => r.enabled).length} active)
            </span>
          </CardTitle>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <ul className="space-y-2">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className={`flex items-start justify-between gap-3 rounded-md border border-border p-2.5 ${
                  rule.enabled ? "" : "opacity-50"
                }`}
              >
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={rule.enabled}
                    onChange={(e) =>
                      rule.id != null &&
                      toggle.mutate({ id: rule.id, enabled: e.target.checked })
                    }
                  />
                  <span>
                    <span className="block text-sm font-medium">{rule.label}</span>
                    <span className="block text-xs text-muted-foreground">
                      {describeConditions(rule.conditions)}
                    </span>
                    {rule.note && (
                      <span className="block text-xs italic text-muted-foreground">
                        {rule.note}
                      </span>
                    )}
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className={`tabular inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${
                      rule.points > 0
                        ? "border-positive/50 bg-positive/10 text-positive"
                        : "border-negative/50 bg-negative/10 text-negative"
                    }`}
                  >
                    {rule.points > 0 ? `+${rule.points}` : rule.points}
                  </span>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => setDraft(toDraft(rule))}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-negative"
                    onClick={() => rule.id != null && del.mutate(rule.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {draft ? (
            <RuleForm
              draft={draft}
              setDraft={setDraft}
              onCancel={() => setDraft(null)}
              onSave={submit}
              saving={save.isPending}
              error={
                save.isError
                  ? save.error instanceof Error
                    ? save.error.message
                    : "Failed to save rule"
                  : null
              }
            />
          ) : (
            <Button size="sm" variant="outline" onClick={() => setDraft(emptyDraft())}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Add rule
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
