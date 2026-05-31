import { TradeTable } from "@/components/table/trade-table";

export default function TradesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Trades</h1>
        <p className="text-sm text-muted-foreground">
          Every round-trip, grouped from raw executions.
        </p>
      </div>
      <TradeTable variant="full" pageSize={50} />
    </div>
  );
}
