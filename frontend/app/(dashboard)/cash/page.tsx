"use client";

import * as React from "react";
import { useRange } from "@/components/range-context";
import { useCash } from "@/hooks/use-cash";
import { formatDateTime, formatNumber } from "@/lib/format";
import { MetricCard } from "@/components/metrics/metric-card";
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
import { Search } from "lucide-react";
import type { CashTransaction } from "@/types";

export default function CashPage() {
  const { range } = useRange();
  const [symbol, setSymbol] = React.useState("");
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [allRows, setAllRows] = React.useState<CashTransaction[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const isLoadMore = React.useRef(false);

  const { data, isLoading, isFetching } = useCash({
    range,
    limit: 50,
    symbol: symbol || undefined,
    cursor: cursor || undefined,
  });

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

  // Summary stats across loaded rows
  const runningTotal = allRows.reduce((sum, r) => sum + (r.netCash ?? 0), 0);
  const totalCommission = allRows.reduce((sum, r) => sum + (r.commission ?? 0), 0);
  const totalInflows = allRows.reduce((sum, r) => sum + (r.netCash != null && r.netCash > 0 ? r.netCash : 0), 0);
  const totalOutflows = allRows.reduce((sum, r) => sum + (r.netCash != null && r.netCash < 0 ? r.netCash : 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Cash</h1>
        <p className="text-sm text-muted-foreground">
          FX conversions and cash income from the cash_transactions table.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard
          label="Total Transactions"
          value={total > 0 ? String(total) : "—"}
          intent="neutral"
          isLoading={isLoading}
        />
        <MetricCard
          label="Net Cash (loaded)"
          value={allRows.length ? formatNumber(runningTotal) : "—"}
          intent={runningTotal >= 0 ? "positive" : "negative"}
          isLoading={isLoading}
        />
        <MetricCard
          label="Inflows (loaded)"
          value={allRows.length ? formatNumber(totalInflows) : "—"}
          intent="positive"
          isLoading={isLoading}
        />
        <MetricCard
          label="Outflows (loaded)"
          value={allRows.length ? formatNumber(totalOutflows) : "—"}
          intent={totalOutflows < 0 ? "negative" : "neutral"}
          isLoading={isLoading}
        />
      </section>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
          <CardTitle className="text-foreground">Cash Transactions</CardTitle>
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
          </div>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Time</TableHead>
                <TableHead>Symbol / Pair</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Net Cash</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead>Currency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
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
                      {formatDateTime(row.execTime)}
                    </TableCell>
                    <TableCell className="font-semibold">{row.symbol}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-muted-foreground">
                      {row.description ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.action ?? "—"}
                    </TableCell>
                    <TableCell className="tabular">{row.quantity}</TableCell>
                    <TableCell className="tabular">
                      {row.rate != null ? formatNumber(row.rate, 4) : "—"}
                    </TableCell>
                    <TableCell
                      className={`tabular font-medium ${
                        (row.netCash ?? 0) >= 0 ? "text-positive" : "text-negative"
                      }`}
                    >
                      {row.netCash != null ? formatNumber(row.netCash) : "—"}
                    </TableCell>
                    <TableCell className="tabular">
                      {row.commission != null ? formatNumber(row.commission) : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.currency ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No cash transactions in this range.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              {total > 0 ? `${allRows.length} of ${total} transactions` : ""}
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
