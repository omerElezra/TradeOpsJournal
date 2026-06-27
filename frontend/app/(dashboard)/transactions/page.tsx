"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRange } from "@/components/range-context";
import { useExecutions } from "@/hooks/use-executions";
import { useTransactionsSummary } from "@/hooks/use-transactions";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AddTradesSheet } from "@/components/trades/add-trades-sheet";
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
import { formatDateTime } from "@/lib/format";
import { Download, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/csv";
import type { RawExecutionRow, ExecutionQuery } from "@/types";

const CSV_COLUMNS = [
  "execTime", "symbol", "action", "quantity",
  "price", "proceeds", "commission", "realizedPnl", "currency",
];

async function fetchAllExecutions(params: ExecutionQuery): Promise<RawExecutionRow[]> {
  const all: RawExecutionRow[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.getExecutions({ ...params, cursor, limit: 200 });
    all.push(...page.data);
    cursor = page.nextCursor;
  } while (cursor);
  return all;
}

const ACTIONS = ["ALL", "BUY", "SELL"] as const;

function StatBadge({
  label,
  value,
  description,
}: {
  label: string;
  value: string | number;
  description?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular">{value}</p>
      {description && (
        <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground/60">
          {description}
        </p>
      )}
    </div>
  );
}

export default function TransactionsPage() {
  const { range } = useRange();
  const [symbol, setSymbol] = React.useState("");
  const [action, setAction] = React.useState<"ALL" | "BUY" | "SELL">("ALL");
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [allRows, setAllRows] = React.useState<RawExecutionRow[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const isLoadMore = React.useRef(false);
  const [exporting, setExporting] = React.useState(false);
  const [loadingAll, setLoadingAll] = React.useState(false);

  const { data, isLoading, isFetching } = useExecutions({
    range,
    limit: 50,
    symbol: symbol || undefined,
    action: action === "ALL" ? undefined : action,
    cursor: cursor || undefined,
  });

  const { data: summary, isLoading: summaryLoading } = useTransactionsSummary();

  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<RawExecutionRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [toast, setToast] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    isLoadMore.current = false;
    setCursor(null);
    queryClient.invalidateQueries({ queryKey: ["executions"] });
    queryClient.invalidateQueries({ queryKey: ["transactionsSummary"] });
  }, [queryClient]);

  React.useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const handleSaved = (result: { inserted: number; skipped: number }) => {
    setToast(
      `Added ${result.inserted} trade${result.inserted === 1 ? "" : "s"}` +
        (result.skipped ? ` · ${result.skipped} duplicate(s) skipped` : ""),
    );
    refresh();
  };

  const requestDelete = (row: RawExecutionRow) => {
    if (row.source === "ibkr") {
      setPendingDelete(row);
    } else {
      void runDelete(row);
    }
  };

  const runDelete = async (row: RawExecutionRow) => {
    setDeleting(true);
    try {
      await api.deleteExecution(row.tradeId);
      setAllRows((prev) => prev.filter((r) => r.tradeId !== row.tradeId));
      setTotal((t) => Math.max(0, t - 1));
      setToast(`Deleted ${row.symbol} ${row.action} ${row.quantity}`);
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

  const resetFilters = () => {
    isLoadMore.current = false;
    setCursor(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Raw imported data and classification health.
        </p>
      </div>

      {/* Data Health Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Data Health</CardTitle>
        </CardHeader>
        <CardContent>
          {summaryLoading ? (
            <div className="flex gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-24" />
              ))}
            </div>
          ) : summary ? (
            <div className="flex flex-wrap gap-3">
              <StatBadge
                label="Imported Rows"
                value={summary.importedRows}
                description="All rows across trades + cash tables"
              />
              <StatBadge
                label="Trade Rows"
                value={summary.tradeRows}
                description="Raw BUY/SELL execution rows"
              />
              <StatBadge
                label="Cash Rows"
                value={summary.cashRows}
                description="Deposit and sweep rows combined"
              />
              <StatBadge
                label="Deposit Rows"
                value={summary.depositRows}
                description="qty > 50 and USD.ILS pair"
              />
              <StatBadge
                label="Sweep Rows"
                value={summary.sweepRows}
                description="Internal FX movements"
              />
              <StatBadge
                label="Fee / Commission Rows"
                value={summary.commissionRows}
                description="Cash rows where commission ≠ 0"
              />
              <StatBadge
                label="Last Import Date"
                value={summary.lastImportDate ? formatDateTime(summary.lastImportDate) : "—"}
                description="Most recent row across all tables"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Raw Execution Log */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-foreground">Execution Log</CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={symbol}
                onChange={(e) => {
                  resetFilters();
                  setSymbol(e.target.value.toUpperCase());
                }}
                placeholder="Symbol"
                className="h-8 w-32 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center rounded-md border border-border bg-background p-0.5">
              {ACTIONS.map((a) => (
                <button
                  key={a}
                  onClick={() => {
                    resetFilters();
                    setAction(a);
                  }}
                  className={`rounded px-2 py-1 text-xs ${
                    action === a
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
            <Button
              size="sm"
              className="gap-1.5"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add trades
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              className="gap-1.5"
              onClick={async () => {
                setExporting(true);
                try {
                  const rows = await fetchAllExecutions({
                    range,
                    symbol: symbol || undefined,
                    action: action === "ALL" ? undefined : action,
                  });
                  downloadCsv(
                    `transactions-${range}-${new Date().toISOString().slice(0, 10)}.csv`,
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
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Time</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Proceeds</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Realized P&L</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 11 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : allRows.length ? (
                allRows.map((row, i) => (
                  <TableRow key={`${row.tradeId}-${i}`}>
                    <TableCell className="tabular text-muted-foreground">
                      {formatDateTime(row.execTime)}
                    </TableCell>
                    <TableCell className="font-semibold">{row.symbol}</TableCell>
                    <TableCell>
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          row.action === "BUY"
                            ? "bg-positive/10 text-positive"
                            : "bg-negative/10 text-negative"
                        }`}
                      >
                        {row.action}
                      </span>
                    </TableCell>
                    <TableCell className="tabular">{row.quantity}</TableCell>
                    <TableCell className="tabular">{row.price}</TableCell>
                    <TableCell className="tabular">
                      {row.proceeds ?? "—"}
                    </TableCell>
                    <TableCell className="tabular">
                      {row.commission ?? "—"}
                    </TableCell>
                    <TableCell
                      className={`tabular ${
                        row.realizedPnl != null
                          ? row.realizedPnl >= 0
                            ? "text-positive"
                            : "text-negative"
                          : "text-muted-foreground"
                      }`}
                    >
                      {row.realizedPnl ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.currency}
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
                        aria-label={`Delete ${row.symbol} ${row.action}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No executions in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              {total > 0 ? `${allRows.length} of ${total} executions` : ""}
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
                        const rows = await fetchAllExecutions({
                          range,
                          symbol: symbol || undefined,
                          action: action === "ALL" ? undefined : action,
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

      <AddTradesSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Delete IBKR-sourced trade?"
        destructive
        confirmLabel="Delete anyway"
        busy={deleting}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && runDelete(pendingDelete)}
        message={
          <>
            This trade was imported from IBKR and will re-appear on the next daily
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
