"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRange } from "@/components/range-context";
import { useCash, useCashSummary } from "@/hooks/use-cash";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { MetricCard } from "@/components/metrics/metric-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AddCashSheet } from "@/components/cash/add-cash-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { Download, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { CashTransaction, CashQuery } from "@/types";

const CSV_COLUMNS = [
  "execTime", "txnType", "symbol", "action",
  "quantity", "rate", "netCash", "commission", "currency",
];

async function fetchAllCash(params: CashQuery): Promise<CashTransaction[]> {
  const all: CashTransaction[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.getCash({ ...params, cursor, limit: 200 });
    all.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

function movementType(row: CashTransaction): { label: string; kind: "deposit" | "sweep" } {
  if (row.txnType === "deposit") return { label: "Deposit", kind: "deposit" };
  return { label: "Sweep", kind: "sweep" };
}

export default function CashPage() {
  const { range } = useRange();
  const [symbol, setSymbol] = React.useState("");
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [allRows, setAllRows] = React.useState<CashTransaction[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const isLoadMore = React.useRef(false);
  const [exporting, setExporting] = React.useState(false);
  const [loadingAll, setLoadingAll] = React.useState(false);

  const { data, isLoading, isFetching } = useCash({
    range,
    limit: 50,
    symbol: symbol || undefined,
    cursor: cursor || undefined,
  });

  const { data: summary, isLoading: summaryLoading } = useCashSummary(range);

  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<CashTransaction | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    isLoadMore.current = false;
    setCursor(null);
    queryClient.invalidateQueries({ queryKey: ["cash"] });
    queryClient.invalidateQueries({ queryKey: ["cashSummary"] });
    queryClient.invalidateQueries({ queryKey: ["transactionsSummary"] });
  }, [queryClient]);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleSaved = (result: { inserted: number; skipped: number }) => {
    setToast(
      `Added ${result.inserted} transaction${result.inserted === 1 ? "" : "s"}` +
        (result.skipped ? ` · ${result.skipped} duplicate(s) skipped` : ""),
    );
    refresh();
  };

  const requestDelete = (row: CashTransaction) => {
    if (row.source === "ibkr") {
      setPendingDelete(row);
    } else {
      void runDelete(row);
    }
  };

  const runDelete = async (row: CashTransaction) => {
    setDeleting(true);
    try {
      await api.deleteCash(row.transactionId);
      setAllRows((prev) => prev.filter((r) => r.transactionId !== row.transactionId));
      setTotal((t) => Math.max(0, t - 1));
      setToast(`Deleted ${row.symbol} ${row.quantity}`);
      queryClient.invalidateQueries({ queryKey: ["cashSummary"] });
      queryClient.invalidateQueries({ queryKey: ["transactionsSummary"] });
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
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
        <h1 className="text-lg font-semibold">Cash &amp; FX</h1>
        <p className="text-sm text-muted-foreground">
          Deposits, withdrawals, FX movements, sweeps, and cash-related commissions.
        </p>
      </div>

      {/* Primary Cash Cards */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Deposits &amp; Withdrawals
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="Total Deposited USD"
            value={summary ? formatCurrency(summary.totalDepositedUsd) : "—"}
            description="Sum of all deposit amounts"
            intent="positive"
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Total Deposited ILS"
            value={summary ? formatNumber(summary.totalDepositedIls) + " ₪" : "—"}
            description="Qty × Rate for USD.ILS deposits"
            intent="positive"
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Total Withdrawn USD"
            value={summary ? formatCurrency(summary.totalWithdrawnUsd) : "—"}
            description="Sum of USD withdrawals"
            intent={summary && summary.totalWithdrawnUsd > 0 ? "negative" : "neutral"}
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Total Withdrawn ILS"
            value={summary ? formatNumber(summary.totalWithdrawnIls) + " ₪" : "—"}
            description="Sum of ILS withdrawals"
            intent={summary && summary.totalWithdrawnIls > 0 ? "negative" : "neutral"}
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Net Deposited USD"
            value={summary ? formatCurrency(summary.netDepositedUsd) : "—"}
            description="Deposited − Withdrawn"
            intent={summary && summary.netDepositedUsd >= 0 ? "positive" : "negative"}
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Net Deposited ILS"
            value={summary ? formatNumber(summary.netDepositedIls) + " ₪" : "—"}
            description="Deposited − Withdrawn in ILS"
            intent={summary && summary.netDepositedIls >= 0 ? "positive" : "negative"}
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Cash / FX Commission Paid"
            value={summary ? formatCurrency(summary.cashFxCommissionPaid) : "—"}
            description="Sum |commission| on all cash rows"
            intent="negative"
            isLoading={summaryLoading}
          />
        </div>
      </div>

      {/* Secondary Cash Cards */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Activity
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <MetricCard
            label="Deposit Count"
            value={summary ? String(summary.depositCount) : "—"}
            description="Number of deposit rows"
            intent="neutral"
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Withdrawal Count"
            value={summary ? String(summary.withdrawalCount) : "—"}
            description="Number of withdrawal rows"
            intent="neutral"
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Sweep Count"
            value={summary ? String(summary.sweepCount) : "—"}
            description="Internal FX movements, not deposits"
            intent="neutral"
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Average Deposit USD"
            value={summary ? formatCurrency(summary.avgDepositUsd) : "—"}
            description="Total Deposited / Deposit Count"
            intent="neutral"
            isLoading={summaryLoading}
          />
          <MetricCard
            label="First Deposit Date"
            value={summary?.firstDepositDate ? formatDateTime(summary.firstDepositDate) : "—"}
            description="Earliest deposit row"
            intent="neutral"
            isLoading={summaryLoading}
          />
          <MetricCard
            label="Last Deposit Date"
            value={summary?.lastDepositDate ? formatDateTime(summary.lastDepositDate) : "—"}
            description="Most recent deposit row"
            intent="neutral"
            isLoading={summaryLoading}
          />
        </div>
      </div>

      {/* Normalized Cash Movement Table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-foreground">Cash Movements</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={symbol}
                onChange={(e) => {
                  isLoadMore.current = false;
                  setCursor(null);
                  setSymbol(e.target.value.toUpperCase());
                }}
                placeholder="Symbol / pair"
                className="h-8 w-36 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add cash
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              className="gap-1.5"
              onClick={async () => {
                setExporting(true);
                try {
                  const rows = await fetchAllCash({ range, symbol: symbol || undefined });
                  downloadCsv(`cash-${range}-${new Date().toISOString().slice(0, 10)}.csv`, rows, CSV_COLUMNS);
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
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Movement Type</TableHead>
                <TableHead>Pair</TableHead>
                <TableHead>Action</TableHead>
                <TableHead className="text-right">Amount USD</TableHead>
                <TableHead className="text-right">Amount ILS</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 12 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : allRows.length ? (
                allRows.map((row, i) => {
                  const { label, kind } = movementType(row);
                  const isDeposit = kind === "deposit";
                  const amountUsd = isDeposit ? row.quantity : null;
                  const rate = row.rate ?? null;
                  const amountIls =
                    isDeposit && rate != null ? row.quantity * rate : null;

                  return (
                    <TableRow
                      key={`${row.transactionId}-${i}`}
                      className={isDeposit ? "bg-blue-500/5" : undefined}
                    >
                      <TableCell className="tabular text-muted-foreground">
                        {formatDateTime(row.execTime)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={isDeposit ? "positive" : "neutral"}>
                          {label}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold">{row.symbol}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.action ?? "—"}
                      </TableCell>
                      <TableCell className="tabular text-right font-medium text-positive">
                        {amountUsd != null ? formatCurrency(amountUsd) : "—"}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {amountIls != null ? formatNumber(amountIls) + " ₪" : "—"}
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {rate != null ? formatNumber(rate, 4) : "—"}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {row.commission != null && row.commission !== 0
                          ? formatCurrency(row.commission)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.currency ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {isDeposit ? "Real Cash Flow" : "Internal Movement"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={row.source === "manual" ? "positive" : "neutral"}>
                          {row.source === "manual" ? "Manual" : "IBKR"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <button
                          onClick={() => requestDelete(row)}
                          disabled={deleting}
                          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-negative disabled:opacity-30"
                          aria-label={`Delete ${row.symbol} ${row.quantity}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No cash movements in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              {total > 0 ? `${allRows.length} of ${total} movements` : ""}
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
                        const rows = await fetchAllCash({ range, symbol: symbol || undefined });
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

      <AddCashSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete IBKR-sourced cash transaction?"
        destructive
        confirmLabel="Delete anyway"
        busy={deleting}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && runDelete(pendingDelete)}
        message={
          <>
            This entry was imported from IBKR and will re-appear on the next daily
            sync. Delete anyway?
          </>
        }
      />

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md border border-border bg-card px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
