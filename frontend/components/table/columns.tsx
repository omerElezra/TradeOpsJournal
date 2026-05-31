"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PnLCell, ResultBadge, SideBadge } from "@/components/table/cells";
import {
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/lib/format";
import type { TradeGroup } from "@/types";

function sortHeader(label: string) {
  return ({ column }: { column: any }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 px-2 text-muted-foreground"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </Button>
  );
}

export const tradeColumns: ColumnDef<TradeGroup>[] = [
  {
    accessorKey: "symbol",
    header: sortHeader("Symbol"),
    cell: ({ row }) => (
      <span className="font-semibold">{row.original.symbol}</span>
    ),
  },
  {
    accessorKey: "side",
    header: "Side",
    cell: ({ row }) => <SideBadge side={row.original.side} />,
  },
  {
    accessorKey: "result",
    header: "Result",
    cell: ({ row }) => <ResultBadge result={row.original.result} />,
  },
  {
    accessorKey: "entryTime",
    header: sortHeader("Entry"),
    cell: ({ row }) => (
      <span className="tabular text-muted-foreground">
        {formatDateTime(row.original.entryTime)}
      </span>
    ),
  },
  {
    accessorKey: "qty",
    header: "Qty",
    cell: ({ row }) => <span className="tabular">{row.original.qty}</span>,
  },
  {
    accessorKey: "avgEntry",
    header: "Avg Entry",
    cell: ({ row }) => (
      <span className="tabular">{formatNumber(row.original.avgEntry)}</span>
    ),
  },
  {
    accessorKey: "netPnl",
    header: sortHeader("Net P&L"),
    cell: ({ row }) => (
      <PnLCell value={row.original.netPnl} currency={row.original.currency} />
    ),
  },
  {
    accessorKey: "returnPct",
    header: sortHeader("Return"),
    cell: ({ row }) => (
      <span
        className={`tabular ${
          row.original.returnPct >= 0 ? "text-positive" : "text-negative"
        }`}
      >
        {formatPercent(row.original.returnPct, 2)}
      </span>
    ),
  },
  {
    accessorKey: "rMultiple",
    header: "R",
    cell: ({ row }) =>
      row.original.rMultiple != null ? (
        <span className="tabular">{row.original.rMultiple}R</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    accessorKey: "holdingMinutes",
    header: "Hold",
    cell: ({ row }) => (
      <span className="tabular text-muted-foreground">
        {formatDuration(row.original.holdingMinutes)}
      </span>
    ),
  },
  {
    id: "notes",
    header: "",
    cell: ({ row }) =>
      row.original.hasNotes ? (
        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
      ) : null,
  },
];
