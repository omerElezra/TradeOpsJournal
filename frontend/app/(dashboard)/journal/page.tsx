"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, NotebookPen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PnLCell, ResultBadge, SideBadge } from "@/components/table/cells";
import { useRange } from "@/components/range-context";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { formatDateTime } from "@/lib/format";
import type { JournalEntry, JournalListItem } from "@/types";

export default function JournalPage() {
  const { range } = useRange();
  const { data, isLoading } = useQuery({
    queryKey: qk.journal(range),
    queryFn: () => api.getJournal(range),
  });
  const [expanded, setExpanded] = React.useState<string | null>(null);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Journal</h1>
        <p className="text-sm text-muted-foreground">
          Every trade you journaled — numbers and your inputs side by side.
        </p>
      </div>

      {!data?.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
            <NotebookPen className="h-6 w-6" />
            <p className="text-sm">No journaled trades in this range.</p>
            <p className="text-xs">
              Open a trade from the{" "}
              <Link href="/trades" className="underline hover:text-foreground">
                Trades
              </Link>{" "}
              page and fill in its journal.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Net P&amp;L</TableHead>
                  <TableHead>Setup</TableHead>
                  <TableHead className="text-center">Conviction</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead className="w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((item) => (
                  <JournalRow
                    key={item.tradeId}
                    item={item}
                    expanded={expanded === item.tradeId}
                    onToggle={() =>
                      setExpanded((cur) =>
                        cur === item.tradeId ? null : item.tradeId,
                      )
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function JournalRow({
  item,
  expanded,
  onToggle,
}: {
  item: JournalListItem;
  expanded: boolean;
  onToggle: () => void;
}) {
  const j = item.journal;
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell className="tabular whitespace-nowrap text-muted-foreground">
          {formatDateTime(item.entryTime)}
        </TableCell>
        <TableCell className="font-medium">{item.symbol}</TableCell>
        <TableCell>
          <SideBadge side={item.side} />
        </TableCell>
        <TableCell>
          <ResultBadge result={item.result} />
        </TableCell>
        <TableCell className="text-right">
          <PnLCell value={item.netPnl} currency={item.currency} />
        </TableCell>
        <TableCell className="text-muted-foreground">{j.setup ?? "—"}</TableCell>
        <TableCell className="tabular text-center text-muted-foreground">
          {j.convictionLevel != null ? `${j.convictionLevel}/10` : "—"}
        </TableCell>
        <TableCell className="tabular text-center text-muted-foreground">
          {j.tradeScore != null ? `${j.tradeScore}/10` : "—"}
        </TableCell>
        <TableCell>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="hover:bg-transparent">
          <TableCell colSpan={9} className="bg-background/40 p-4">
            <JournalDetails item={item} journal={j} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function JournalDetails({
  item,
  journal: j,
}: {
  item: JournalListItem;
  journal: JournalEntry;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <DetailGroup title="Pre-Entry Checklist">
          <Detail label="Candle" value={j.candlePattern} />
          <Detail label="Trend" value={j.recentTrend} />
          <Detail label="Volume" value={j.volumeVsTrend} />
          <TagDetail label="MAs" values={j.maRelation} />
          <TagDetail label="Gaps" values={j.openGaps} />
          <TagDetail label="Levels" values={j.supportResFib} />
        </DetailGroup>
        <DetailGroup title="Plan & Execution">
          <Detail
            label="Stop / Target"
            value={
              j.plannedStop != null || j.plannedTarget != null
                ? `${j.plannedStop ?? "—"} / ${j.plannedTarget ?? "—"}`
                : null
            }
          />
          <Detail
            label="Risk"
            value={j.riskAmount != null ? `$${j.riskAmount}` : null}
          />
          <Detail label="Entry reason" value={j.entryReason} />
          <Detail label="Exit reason" value={j.exitReason} />
        </DetailGroup>
        <DetailGroup title="Psychology & Review">
          <TagDetail label="Emotions" values={j.psychTags} />
          <TagDetail label="Mistakes" values={j.mistakesTags} />
          <Detail label="Notes" value={j.notes || null} />
        </DetailGroup>
      </div>
      <Link
        href={`/trades/${encodeURIComponent(item.tradeId)}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        Open trade & edit journal
        <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}

function DetailGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <dl className="space-y-1">{children}</dl>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd>{value}</dd>
    </div>
  );
}

function TagDetail({ label, values }: { label: string; values: string[] }) {
  if (!values.length) return null;
  return (
    <div className="flex gap-2 text-xs">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="flex flex-wrap gap-1">
        {values.map((v) => (
          <span
            key={v}
            className="rounded-full border border-border bg-background px-1.5 py-0.5 text-[10px]"
          >
            {v}
          </span>
        ))}
      </dd>
    </div>
  );
}
