import { KpiRow } from "@/components/metrics/kpi-row";
import { EquityCurveCard } from "@/components/charts/equity-curve-card";
import { AIInsightPanel } from "@/components/ai/ai-insight-panel";
import { TradeTable } from "@/components/table/trade-table";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <KpiRow />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <EquityCurveCard />
        </div>
        <div className="lg:col-span-1">
          <AIInsightPanel variant="compact" />
        </div>
      </section>

      <section>
        <TradeTable variant="full" />
      </section>
    </div>
  );
}
