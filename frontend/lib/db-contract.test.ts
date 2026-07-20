// DB contract tests — guard the boundary between the SQL migrations
// (scripts/migrations/*.sql) and the code that reads/writes those tables.
//
// They fail when:
//   * a column the app writes or reads is missing from the migrations (broken),
//   * a migrated column is touched by nothing and not whitelisted (redundant),
//   * an upsert conflict key has no matching UNIQUE constraint,
//   * the scoring_rules seed drifts from DEFAULT_RULES or fails validateRule,
//   * migration files are misnumbered or seeds lose their idempotency guard.
//
// Run with the whole repo mounted (migrations live one level above frontend/):
//   docker run --rm -v <repo>:/repo -v /repo/frontend/node_modules \
//     -w /repo/frontend node:20 npm test
//
// The explicit column lists below ARE the contract: when a migration adds or
// removes a column, update the matching list here in the same change.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, validateRule } from "./domain/scoring";

// ─── Load migrations ─────────────────────────────────────────────────────────

const MIGRATIONS_DIR = path.resolve(process.cwd(), "..", "scripts", "migrations");

function loadMigrations(): { name: string; sql: string }[] {
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(
      `Migrations dir not found at ${MIGRATIONS_DIR}. ` +
        "Run tests with the repo root mounted (see header of this file) — " +
        "the DB contract tests need scripts/migrations/*.sql.",
    );
  }
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(MIGRATIONS_DIR, name), "utf8") }));
}

const migrations = loadMigrations();

// ─── Tiny SQL parser (CREATE TABLE / ALTER TABLE ADD COLUMN / UNIQUE) ────────

interface Schema {
  columns: Map<string, Set<string>>;
  uniques: Map<string, string[][]>;
}

function parseSchema(): Schema {
  const columns = new Map<string, Set<string>>();
  const uniques = new Map<string, string[][]>();
  const cols = (table: string) => {
    if (!columns.has(table)) columns.set(table, new Set());
    return columns.get(table)!;
  };

  for (const { sql } of migrations) {
    for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\);/g)) {
      const [, table, body] = m;
      for (const raw of body.split("\n")) {
        const line = raw.trim();
        if (!line || line.startsWith("--")) continue;
        const u = line.match(/UNIQUE\s*\(([^)]+)\)/i);
        if (u) {
          const key = u[1].split(",").map((s) => s.trim());
          uniques.set(table, [...(uniques.get(table) ?? []), key]);
        }
        if (/^(CONSTRAINT|UNIQUE|PRIMARY|CHECK|FOREIGN)\b/i.test(line)) continue;
        const cm = line.match(/^([a-z_][a-z0-9_]*)\s/);
        if (cm) cols(table).add(cm[1]);
      }
    }
    for (const m of sql.matchAll(/ALTER TABLE (\w+)\s+ADD COLUMN IF NOT EXISTS\s+(\w+)/g)) {
      cols(m[1]).add(m[2]);
    }
  }
  return { columns, uniques };
}

const schema = parseSchema();

function tableColumns(table: string): Set<string> {
  const cols = schema.columns.get(table);
  if (!cols) throw new Error(`Table ${table} not found in migrations`);
  return cols;
}

/** Source of a code file, for asserting the contract lists stay honest. */
function src(rel: string): string {
  return readFileSync(path.resolve(process.cwd(), rel), "utf8");
}

// ─── Migration hygiene ───────────────────────────────────────────────────────

describe("migration files", () => {
  it("are sequentially numbered with no gaps or duplicates", () => {
    const nums = migrations.map((m) => {
      const p = m.name.match(/^(\d{3})_/);
      expect(p, `${m.name} must start with NNN_`).not.toBeNull();
      return Number(p![1]);
    });
    expect(new Set(nums).size).toBe(nums.length);
    expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1));
  });

  it("define every table the query layer touches", () => {
    for (const t of [
      "trade_journal",
      "trade_context_enrichment",
      "trade_plans",
      "scoring_rules",
      "cash_transactions",
      "account_transactions",
      "interest_accruals",
    ]) {
      expect(schema.columns.has(t), `missing table ${t}`).toBe(true);
    }
  });
});

// ─── Per-table contracts ─────────────────────────────────────────────────────

interface TableContract {
  table: string;
  /** Columns the app writes (insert/update/upsert payload keys + filter keys). */
  written: string[];
  /** Columns the app reads back into DTOs. */
  read: string[];
  /** Columns intentionally untouched by app code (DB-managed / reserved). */
  allowedUnused: string[];
  /** Source files that must mention every written/read column (honesty check). */
  sources: string[];
}

const CONTRACTS: TableContract[] = [
  {
    table: "trade_journal",
    written: [
      "symbol", "entry_time", "group_id", "execution_ids",
      "candle_pattern", "recent_trend", "volume_vs_trend",
      "ma_relation", "open_gaps", "support_res_fib",
      "setup", "planned_stop", "planned_target", "risk_amount", "conviction_level",
      "entry_reason", "exit_reason", "psych_tags",
      "trade_score", "mistakes_tags", "notes", "updated_at",
    ],
    read: [
      "id", "symbol", "entry_time", "group_id", "execution_ids",
      "candle_pattern", "recent_trend", "volume_vs_trend",
      "ma_relation", "open_gaps", "support_res_fib",
      "setup", "planned_stop", "planned_target", "risk_amount", "conviction_level",
      "entry_reason", "exit_reason", "psych_tags",
      "trade_score", "mistakes_tags", "notes", "ai_coaching_question", "updated_at",
    ],
    // created_at: DB audit; ai_conversation: reserved for the AI-coaching feature.
    allowedUnused: ["created_at", "ai_conversation"],
    sources: ["lib/queries/trades.ts", "app/api/v1/journal/route.ts"],
  },
  {
    table: "trade_context_enrichment",
    written: ["symbol", "entry_time", "group_id", "schema_version", "enrichment", "computed_at"],
    read: ["symbol", "entry_time", "group_id", "schema_version", "enrichment", "computed_at"],
    allowedUnused: ["id", "created_at"],
    sources: ["lib/queries/enrichment.ts"],
  },
  {
    table: "trade_plans",
    written: [
      "symbol", "direction", "planned_at", "ref_price", "schema_version",
      "context", "checklist", "score", "score_breakdown", "forward_outcome",
      "notes", "status", "linked_group_id", "linked_entry_time", "updated_at",
    ],
    read: [
      "id", "symbol", "direction", "planned_at", "ref_price", "status",
      "context", "checklist", "score", "score_breakdown", "forward_outcome",
      "notes", "linked_group_id", "linked_entry_time", "created_at", "updated_at",
    ],
    allowedUnused: ["schema_version"],
    sources: ["lib/queries/trade-plans.ts"],
  },
  {
    table: "scoring_rules",
    written: ["label", "conditions", "points", "note", "enabled", "sort_order", "updated_at"],
    read: ["id", "label", "conditions", "points", "note", "enabled", "sort_order"],
    allowedUnused: ["created_at"],
    sources: ["lib/queries/scoring-rules.ts"],
  },
];

describe.each(CONTRACTS)("table $table", ({ table, written, read, allowedUnused, sources }) => {
  const sqlCols = () => tableColumns(table);
  const text = () => sources.map(src).join("\n");

  it("every column the app writes exists in the migrations", () => {
    for (const col of written) {
      expect(sqlCols().has(col), `written column ${col} missing from ${table} SQL`).toBe(true);
    }
  });

  it("every column the app reads exists in the migrations", () => {
    for (const col of read) {
      expect(sqlCols().has(col), `read column ${col} missing from ${table} SQL`).toBe(true);
    }
  });

  it("has no redundant columns (migrated but untouched and not whitelisted)", () => {
    const touched = new Set([...written, ...read, ...allowedUnused, "id"]);
    const redundant = [...sqlCols()].filter((c) => !touched.has(c));
    expect(redundant, `unused columns in ${table}: ${redundant.join(", ")}`).toEqual([]);
  });

  it("contract lists match the actual source code", () => {
    // Honesty check: the lists above must reflect real code. Every listed
    // column has to appear in the query/route sources; a rename or removal
    // in code without updating this contract fails here.
    const t = text();
    for (const col of new Set([...written, ...read])) {
      expect(t.includes(col), `${col} not referenced in ${sources.join(", ")}`).toBe(true);
    }
  });
});

// ─── Upsert conflict keys need a matching UNIQUE constraint ──────────────────

describe("upsert conflict keys", () => {
  const UPSERTS: { table: string; source: string }[] = [
    { table: "trade_journal", source: "lib/queries/trades.ts" },
    { table: "trade_context_enrichment", source: "lib/queries/enrichment.ts" },
  ];

  it.each(UPSERTS)("$table onConflict matches a UNIQUE constraint", ({ table, source }) => {
    const m = src(source).match(/onConflict:\s*"([^"]+)"/);
    expect(m, `no onConflict found in ${source}`).not.toBeNull();
    const key = m![1].split(",").map((s) => s.trim());
    const uniques = schema.uniques.get(table) ?? [];
    const matched = uniques.some(
      (u) => u.length === key.length && u.every((c, i) => c === key[i]),
    );
    expect(matched, `UNIQUE (${key.join(", ")}) not found for ${table}`).toBe(true);
  });
});

// ─── scoring_rules seed: valid, idempotent, in sync with DEFAULT_RULES ───────

describe("scoring_rules seed (migration 010)", () => {
  const sql010 = migrations.find((m) => m.name.startsWith("010_"))!.sql;

  const unq = (s: string) => s.replaceAll("''", "'");
  const seedRe =
    /\('((?:[^']|'')*)',\s*'(\[[\s\S]*?\])'::jsonb,\s*(-?\d+),\s*'((?:[^']|'')*)',\s*(\d+)\)/g;
  const seeds = [...sql010.matchAll(seedRe)].map((m) => ({
    label: unq(m[1]),
    conditions: JSON.parse(m[2]) as unknown,
    points: Number(m[3]),
    note: unq(m[4]),
    sortOrder: Number(m[5]),
  }));

  it("parses the expected number of seed rules", () => {
    expect(seeds.length).toBe(DEFAULT_RULES.length);
  });

  it("every seed rule passes validateRule (fields/ops exist in the catalog)", () => {
    for (const s of seeds) {
      const checked = validateRule({ ...s, enabled: true });
      expect(checked.ok, `${s.label}: ${checked.ok ? "" : checked.error}`).toBe(true);
    }
  });

  it("seed rules are identical to DEFAULT_RULES (single source of truth)", () => {
    expect(
      seeds.map((s) => ({ ...s, enabled: true })),
    ).toEqual(
      DEFAULT_RULES.map((r) => ({
        label: r.label,
        conditions: r.conditions,
        points: r.points,
        note: r.note,
        sortOrder: r.sortOrder,
        enabled: r.enabled,
      })),
    );
  });

  it("seed insert is idempotent (guarded by empty-table check)", () => {
    expect(sql010).toMatch(/WHERE NOT EXISTS \(SELECT 1 FROM scoring_rules\)/);
  });
});
