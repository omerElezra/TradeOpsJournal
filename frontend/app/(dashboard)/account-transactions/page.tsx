"use client";

import * as React from "react";
import { useRange } from "@/components/range-context";
import {
  useAccountTxns,
  useAccountTxnSummary,
  useInterestAccruals,
} from "@/hooks/use-account-transactions";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { MetricCard } from "@/components/metrics/metric-card";
import { AccrualChart } from "@/components/charts/accrual-chart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Search } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { AccountTransaction, AccountTxnQuery } from "@/types";

const CSV_COLUMNS = [
  "datetime", "categoryLabel", "type", "symbol",
  "amount", "currency", "description", "source",
];

// Category filter chips. "ALL" plus the normalized slugs from the ingest mapping.
const CATEGORIES = [
  { slug: "ALL", label: "All" },
  { slug: "dividend", label: "Dividend" },
  { slug: "withholding_tax", label: "Withholding Tax" },
  { slug: "interest_received", label: "Interest Received" },
  { slug: "interest_paid", label: "Interest Paid" },
  { slug: "deposit_withdrawal", label: "Deposit / Withdrawal" },
  { slug: "fee", label: "Fee" },
  { slug: "other", label: "Other" },
] as const;

async function fetchAllAccountTxns(params: AccountTxnQuery): Promise<AccountTransaction[]> {
  const all: AccountTransaction[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.getAccountTxns({ ...params, cursor, limit: 200 });
    all.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

function amountClass(amount: number): string {
  if (amount > 0) return "text-positive";
  if (amount < 0) return "text-negative";
  return "text-muted-foreground";
}

function formatAmount(amount: number, currency: string | null): string {
  const sign = amount > 0 ? "+" : "";
  const cur = currency ? ` ${currency}` : "";
  return `${sign}${formatNumber(amount)}${cur}`;
}

export default function AccountTransactionsPage() {
  const { range } = useRange();
  const [symbol, setSymbol] = React.useState("");
  const [category, setCategory] = React.useState<string>("ALL");
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [allRows, setAllRows] = React.useState<AccountTransaction[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const isLoadMore = React.useRef(false);
  const [exporting, setExporting] = React.useState(false);
  const [loadingAll, setLoadingAll] = React.useState(false);

  const queryParams: AccountTxnQuery = {
    range,
    limit: 50,
    symbol: symbol || undefined,
    category: category === "ALL" ? undefined : category,
    cursor: cursor || undefined,
  };

  const { data, isLoading, isFetching } = useAccountTxns(queryParams);
  const { data: summary, isLoading: summaryLoading } = useAccountTxnSummary(range);
  const { data: accruals, isLoading: accrualsLoading } = useInterestAccruals(range);

  const resetFilters = () => {
    isLoadMore.current = false;
    setCursor(null);
  };

  React.useEffect(() => {
    if (!data) return;
    if (isLoadMore.current) {
      setAllRows((prev) => [...prev, ...data.data]);
    } else {
      setAllRows(data.data);
    }
    isLoadMore.current = false;
    setNextCursor(data.nextCursor);
    setTotal(data.total);
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Account Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Dividends, withholding tax, broker interest, and deposits/withdrawals
          imported from IBKR.
        </p>
      </div>

      {/* Per-category summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Summary by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="flex flex-wrap gap-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-40" />
              ))}
            </div>
          ) : summary && summary.byCategory.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {summary.byCategory.map((c) => (
                <div
                  key={`${c.category}-${c.currency}`}
                  className="rounded-md border border-border bg-card px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <span className="text-[10px] text-muted-foreground/60">
                      {c.currency}
                    </span>
                  </div>
                  <p className={`mt-0.5 text-sm font-semibold tabular ${amountClass(c.total)}`}>
                    {formatAmount(c.total, c.currency)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/60">
                    {c.count} row{c.count === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No account transactions in this range.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Interest accruals (IACC BASE_SUMMARY) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Interest Accruals</CardTitle>
          <p className="text-xs text-muted-foreground">
            Daily accrued (not-yet-posted) interest — distinct from the posted
            Broker Interest rows above.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              label="Total Accrued"
              value={accruals ? formatCurrency(accruals.summary.totalAccrued) : "—"}
              description="Sum of daily accruals in range"
              intent={
                accruals && accruals.summary.totalAccrued < 0 ? "negative" : "positive"
              }
              isLoading={accrualsLoading}
            />
            <MetricCard
              label="FX Translation"
              value={accruals ? formatCurrency(accruals.summary.totalFx) : "—"}
              description="Sum of FX translation in range"
              intent="neutral"
              isLoading={accrualsLoading}
            />
            <MetricCard
              label="Accrual Days"
              value={accruals ? String(accruals.summary.dayCount) : "—"}
              description="Days with a nonzero accrual"
              intent="neutral"
              isLoading={accrualsLoading}
            />
            <MetricCard
              label="Avg / Day"
              value={accruals ? formatCurrency(accruals.summary.avgDaily) : "—"}
              description="Total accrued ÷ accrual days"
              intent="neutral"
              isLoading={accrualsLoading}
            />
          </div>
          {accrualsLoading ? (
            <Skeleton className="h-[240px] w-full" />
          ) : (
            <AccrualChart data={accruals?.series ?? []} />
          )}

          {/* Daily accrual rows */}
          {!accrualsLoading && (accruals?.series.length ?? 0) > 0 && (
            <div className="max-h-80 overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Accrued</TableHead>
                    <TableHead className="text-right">Cumulative</TableHead>
                    <TableHead className="text-right">FX Translation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...(accruals?.series ?? [])].reverse().map((p) => (
                    <TableRow key={p.t}>
                      <TableCell className="tabular text-muted-foreground">{p.t}</TableCell>
                      <TableCell className={`tabular text-right ${amountClass(p.accrued)}`}>
                        {formatNumber(p.accrued, 4)}
                      </TableCell>
                      <TableCell className={`tabular text-right ${amountClass(p.cumulative)}`}>
                        {formatNumber(p.cumulative, 2)}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {p.fx ? formatNumber(p.fx, 4) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground/60">
            {accruals?.series.length ?? 0} day(s) in range · switch range to “All” to see the full history.
          </p>
        </CardContent>
      </Card>

      {/* Transaction log */}
      <Card>
        <CardHeader className="flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-foreground">Transaction Log</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={symbol}
                onChange={(e) => {
                  resetFilters();
                  setSymbol(e.target.value.toUpperCase());
                }}
                placeholder="Symbol"
                className="h-8 w-28 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              className="gap-1.5"
              onClick={async () => {
                setExporting(true);
                try {
                  const rows = await fetchAllAccountTxns({
                    range,
                    symbol: symbol || undefined,
                    category: category === "ALL" ? undefined : category,
                  });
                  downloadCsv(
                    `account-transactions-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
                    rows,
                    CSV_COLUMNS,
                  );
                } finally {
                  setExporting(false);
                }
              }}
            >
              <Download className="h-3.5 w-3.5" />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Category filter chips */}
          <div className="mb-4 flex flex-wrap items-center gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c.slug}
                onClick={() => {
                  resetFilters();
                  setCategory(c.slug);
                }}
                className={`rounded-md border px-2 py-1 text-xs transition-colors ${
                  category === c.slug
                    ? "border-border bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Source</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : allRows.length ? (
                allRows.map((row, i) => (
                  <TableRow key={`${row.transactionId}-${i}`}>
                    <TableCell className="tabular text-muted-foreground">
                      {formatDateTime(row.datetime)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="neutral">{row.categoryLabel}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {row.symbol || "—"}
                    </TableCell>
                    <TableCell className={`tabular text-right font-medium ${amountClass(row.amount)}`}>
                      {formatAmount(row.amount, row.currency)}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground" title={row.description ?? ""}>
                      {row.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.source === "manual" ? "positive" : "neutral"}>
                        {row.source === "manual" ? "Manual" : "IBKR"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No account transactions in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              {total > 0 ? `${allRows.length} of ${total} transactions` : ""}
            </span>
            <div className="flex items-center gap-2">
              {nextCursor && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isFetching || loadingAll}
                    onClick={async () => {
                      setLoadingAll(true);
                      try {
                        const rows = await fetchAllAccountTxns({
                          range,
                          symbol: symbol || undefined,
                          category: category === "ALL" ? undefined : category,
                        });
                        setAllRows(rows);
                        setNextCursor(null);
                        setTotal(rows.length);
                      } finally {
                        setLoadingAll(false);
                      }
                    }}
                  >
                    {loadingAll ? "Loading…" : "Load all"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isFetching || loadingAll}
                    onClick={() => {
                      isLoadMore.current = true;
                      setCursor(nextCursor);
                    }}
                  >
                    {isFetching ? "Loading…" : "Load more"}
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
