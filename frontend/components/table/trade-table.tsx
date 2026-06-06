"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { tradeColumns } from "@/components/table/columns";
import { useTrades } from "@/hooks/use-trades";
import { useRange } from "@/components/range-context";
import type { TradeResult, TradeGroup } from "@/types";

const RESULTS: (TradeResult | "ALL")[] = ["ALL", "WIN", "LOSS", "BREAKEVEN"];

export function TradeTable({
  variant = "full",
  pageSize = 25,
}: {
  variant?: "compact" | "full";
  pageSize?: number;
}) {
  const router = useRouter();
  const { range } = useRange();
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: "entryTime", desc: true },
  ]);
  const [symbol, setSymbol] = React.useState("");
  const [result, setResult] = React.useState<TradeResult | "ALL">("ALL");
  const [cursor, setCursor] = React.useState<string | null>(null);

  // Accumulated rows for load-more (full variant)
  const [allTrades, setAllTrades] = React.useState<TradeGroup[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const isLoadMore = React.useRef(false);

  const sortKey = sorting[0]?.id ?? "entryTime";
  const sortDir: "asc" | "desc" = sorting[0]?.desc === false ? "asc" : "desc";

  const { data, isLoading, isFetching } = useTrades({
    range,
    limit: variant === "compact" ? 8 : pageSize,
    symbol: symbol || undefined,
    result: result === "ALL" ? undefined : result,
    sort: sortKey,
    dir: sortDir,
    cursor: cursor || undefined,
  });

  // Merge fetched page into accumulated list
  React.useEffect(() => {
    if (!data || variant !== "full") return;
    if (isLoadMore.current) {
      setAllTrades((prev) => [...prev, ...data.data]);
    } else {
      setAllTrades(data.data);
    }
    isLoadMore.current = false;
    setNextCursor(data.nextCursor);
    setTotal(data.total);
  }, [data, variant]);

  const displayData = variant === "full" ? allTrades : (data?.data ?? []);

  const table = useReactTable({
    data: displayData,
    columns: tradeColumns,
    state: { sorting },
    onSortingChange: (updater) => {
      // Reset to first page whenever sort changes
      isLoadMore.current = false;
      setCursor(null);
      setSorting(updater);
    },
    getCoreRowModel: getCoreRowModel(),
    // Server handles sorting — no getSortedRowModel needed
    manualSorting: true,
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0">
        <CardTitle className="text-foreground">Trade History</CardTitle>
        {variant === "full" && (
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
                placeholder="Symbol"
                className="h-8 w-32 rounded-md border border-border bg-background pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex items-center rounded-md border border-border bg-background p-0.5">
              {RESULTS.map((r) => (
                <button
                  key={r}
                  onClick={() => {
                    isLoadMore.current = false;
                    setCursor(null);
                    setResult(r);
                  }}
                  className={`rounded px-2 py-1 text-xs ${
                    result === r
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  {tradeColumns.map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/trades/${row.original.id}`)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={tradeColumns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No trades in this range.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {variant === "full" && (
          <div className="flex items-center justify-between pt-4">
            <span className="text-xs text-muted-foreground">
              {total > 0
                ? `${allTrades.length} of ${total} trades`
                : ""}
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
        )}
      </CardContent>
    </Card>
  );
}

