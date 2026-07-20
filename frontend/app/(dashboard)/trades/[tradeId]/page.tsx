"use client";

import { useParams } from "next/navigation";
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
import { Skeleton } from "@/components/ui/skeleton";
import { PnLCell, ResultBadge, SideBadge } from "@/components/table/cells";
import { TradeJournalForm } from "@/components/journal/trade-journal-form";
import { TradeContextCard } from "@/components/trades/trade-context-card";
import { TradePriceChart } from "@/components/charts/trade-price-chart";
import { useTrade } from "@/hooks/use-trades";
import {
  formatDateTime,
  formatNumber,
  formatPercent,
} from "@/lib/format";

export default function TradeDetailPage() {
  const params = useParams<{ tradeId: string }>();
  const { data, isLoading } = useTrade(params.tradeId);

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }
  if (!data) {
    return <p className="text-sm text-muted-foreground">Trade not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">{data.symbol}</h1>
        <SideBadge side={data.side} />
        <ResultBadge result={data.result} />
        <span className="ml-auto">
          <PnLCell value={data.netPnl} currency={data.currency} />
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Avg Entry" value={formatNumber(data.avgEntry)} />
        <Stat
          label="Avg Exit"
          value={data.avgExit != null ? formatNumber(data.avgExit) : "—"}
        />
        <Stat label="Return" value={formatPercent(data.returnPct, 2)} />
        <Stat label="R-Multiple" value={data.rMultiple != null ? `${data.rMultiple}R` : "—"} />
      </div>

      <TradePriceChart key={data.id} trade={data} />

      <TradeContextCard key={`ctx-${data.id}`} trade={data} />

      <TradeJournalForm key={data.id} trade={data} />

      <Card>
        <CardHeader>
          <CardTitle className="text-foreground">Executions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Time</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Commission</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.executions.map((e) => (
                <TableRow key={e.tradeId}>
                  <TableCell className="tabular text-muted-foreground">
                    {formatDateTime(e.execTime)}
                  </TableCell>
                  <TableCell
                    className={
                      e.action === "BUY" ? "text-positive" : "text-negative"
                    }
                  >
                    {e.action}
                  </TableCell>
                  <TableCell className="tabular">{e.quantity}</TableCell>
                  <TableCell className="tabular">{formatNumber(e.price)}</TableCell>
                  <TableCell className="tabular text-muted-foreground">
                    {e.commission != null ? formatNumber(e.commission) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="tabular mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
