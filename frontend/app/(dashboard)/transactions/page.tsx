"use client";

import * as React from "react";
import { useRange } from "@/components/range-context";
import { useExecutions } from "@/hooks/use-executions";
import { useTransactionsSummary } from "@/hooks/use-transactions";

import { Button } from "@/components/ui/button";
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
import { formatDateTime } from "@/lib/format";
import { Search } from "lucide-react";
import type { RawExecutionRow } from "@/types";

const ACTIONS = ["ALL", "BUY", "SELL"] as const;

function StatBadge({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular">{value}</p>
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

  const { data, isLoading, isFetching } = useExecutions({
    range,
    limit: 50,
    symbol: symbol || undefined,
    action: action === "ALL" ? undefined : action,
    cursor: cursor || undefined,
  });

  const { data: summary, isLoading: summaryLoading } = useTransactionsSummary();

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
              <StatBadge label="Imported Rows" value={summary.importedRows} />
              <StatBadge label="Trade Rows" value={summary.tradeRows} />
              <StatBadge label="Cash Rows" value={summary.cashRows} />
              <StatBadge label="Deposit Rows" value={summary.depositRows} />
              <StatBadge label="Sweep Rows" value={summary.sweepRows} />
              <StatBadge label="Fee / Commission Rows" value={summary.commissionRows} />
              <StatBadge
                label="Last Import Date"
                value={
                  summary.lastImportDate
                    ? formatDateTime(summary.lastImportDate)
                    : "—"
                }
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
                <TableHead>Classification</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
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
                      <span className="rounded bg-accent px-1.5 py-0.5 text-xs text-muted-foreground">
                        Trade
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={10}
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
            {nextCursor && (
              <Button
                variant="outline"
                size="sm"
                disabled={isFetching}
                onClick={() => {
                  isLoadMore.current = true;
                  setCursor(nextCursor);
                }}
              >
                {isFetching ? "Loading…" : "Load more"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
