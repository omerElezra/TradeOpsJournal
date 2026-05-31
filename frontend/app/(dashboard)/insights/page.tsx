import { AIInsightPanel } from "@/components/ai/ai-insight-panel";

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">AI Insights</h1>
        <p className="text-sm text-muted-foreground">
          Behavioral analysis of your trading. (Mock data until the LLM is wired in.)
        </p>
      </div>
      <div className="max-w-2xl">
        <AIInsightPanel variant="full" />
      </div>
    </div>
  );
}
