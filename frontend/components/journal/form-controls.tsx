"use client";

// Shared journal-style form building blocks (chips, scales, fields), used by
// the trade journal form and the pre-entry check page.

import * as React from "react";
import { HelpCircle, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LABEL_HELP, OPTION_HELP, SECTION_HELP } from "@/components/journal/journal-presets";

const chipBase =
  "rounded-full border px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
export const chipOff = `${chipBase} border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground`;
export const chipOn = `${chipBase} border-primary/50 bg-primary/15 text-primary`;

export const inputCls =
  "h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";

/** Hover tooltip (Hebrew, RTL). Parent element must have `relative group`. */
export function Tip({ text }: { text: string }) {
  return (
    <span
      dir="rtl"
      className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 hidden w-max max-w-[260px] -translate-x-1/2 whitespace-normal rounded-md border border-border bg-card px-2.5 py-1.5 text-right text-[11px] font-normal normal-case leading-relaxed tracking-normal text-foreground shadow-lg group-hover:block"
    >
      {text}
    </span>
  );
}

export function Field({
  label,
  auto,
  help,
  children,
}: {
  label: string;
  auto?: boolean;
  /** Hover explanation; defaults to the shared LABEL_HELP entry for this label. */
  help?: string;
  children: React.ReactNode;
}) {
  const tip = help ?? LABEL_HELP[label];
  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {tip ? (
          <span className="group relative inline-flex cursor-help items-center gap-1">
            {label}
            <HelpCircle className="h-3 w-3 opacity-60" />
            <Tip text={tip} />
          </span>
        ) : (
          label
        )}
        {auto && (
          <span className="inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 px-1.5 py-px text-[10px] normal-case text-primary">
            <Sparkles className="h-2.5 w-2.5" />
            auto
          </span>
        )}
      </p>
      {children}
    </div>
  );
}

/** Single choice chip group with an "Other…" free-text option. */
export function SingleChoice({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const isCustom = value != null && !options.includes(value);
  const [showOther, setShowOther] = React.useState(isCustom);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`${value === opt ? chipOn : chipOff} group relative`}
            onClick={() => {
              setShowOther(false);
              onChange(value === opt ? null : opt);
            }}
          >
            {opt}
            {OPTION_HELP[opt] && <Tip text={OPTION_HELP[opt]} />}
          </button>
        ))}
        <button
          type="button"
          className={showOther || isCustom ? chipOn : chipOff}
          onClick={() => {
            if (showOther || isCustom) {
              setShowOther(false);
              if (isCustom) onChange(null);
            } else {
              setShowOther(true);
              if (!isCustom) onChange(null);
            }
          }}
        >
          Other…
        </button>
      </div>
      {(showOther || isCustom) && (
        <input
          autoFocus
          dir="auto"
          value={isCustom ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Type a custom value…"
          className={`${inputCls} w-full max-w-xs`}
        />
      )}
    </div>
  );
}

/** Multi-select chip group with an "Other…" free-text adder. */
export function MultiChoice({
  options,
  values,
  onChange,
}: {
  options: string[];
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const [showOther, setShowOther] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const customValues = values.filter((v) => !options.includes(v));

  const toggle = (opt: string) =>
    onChange(
      values.includes(opt) ? values.filter((v) => v !== opt) : [...values, opt],
    );

  const addCustom = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            className={`${values.includes(opt) ? chipOn : chipOff} group relative`}
            onClick={() => toggle(opt)}
          >
            {opt}
            {OPTION_HELP[opt] && <Tip text={OPTION_HELP[opt]} />}
          </button>
        ))}
        {customValues.map((v) => (
          <button
            key={v}
            type="button"
            className={`${chipOn} inline-flex items-center gap-1`}
            onClick={() => onChange(values.filter((x) => x !== v))}
          >
            {v}
            <X className="h-3 w-3" />
          </button>
        ))}
        <button
          type="button"
          className={showOther ? chipOn : chipOff}
          onClick={() => setShowOther((s) => !s)}
        >
          Other…
        </button>
      </div>
      {showOther && (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            dir="auto"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Type a custom value…"
            className={`${inputCls} w-full max-w-xs`}
          />
          <Button variant="outline" size="sm" onClick={addCustom} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      )}
    </div>
  );
}

/** 1–10 button scale. Click the active value again to clear. */
export function Scale({
  value,
  onChange,
  lowLabel,
  highLabel,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  lowLabel: string;
  highLabel: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            className={`h-8 w-8 rounded-md border text-xs tabular transition-colors ${
              value === n
                ? "border-primary/50 bg-primary/15 font-semibold text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            }`}
            onClick={() => onChange(value === n ? null : n)}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="flex max-w-[352px] justify-between text-[10px] text-muted-foreground">
        <span>1 = {lowLabel}</span>
        <span>10 = {highLabel}</span>
      </div>
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  placeholder,
  auto,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  auto?: boolean;
}) {
  return (
    <Field label={label} auto={auto}>
      <input
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputCls} w-32`}
      />
    </Field>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  const tip = typeof children === "string" ? SECTION_HELP[children] : undefined;
  return (
    <h3 className="border-b border-border pb-1.5 text-sm font-semibold">
      {tip ? (
        <span className="group relative inline-flex cursor-help items-center gap-1.5">
          {children}
          <HelpCircle className="h-3 w-3 text-muted-foreground opacity-60" />
          <Tip text={tip} />
        </span>
      ) : (
        children
      )}
    </h3>
  );
}
