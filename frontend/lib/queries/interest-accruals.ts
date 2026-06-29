import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

function r(n: number, d: number) {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

/**
 * Load the daily interest-accrual series (IBKR IACC BASE_SUMMARY) within a range,
 * with a running cumulative total, plus summary stats.
 */
export async function fetchAccruals(
  start: Date,
  end: Date,
): Promise<Record<string, unknown>> {
  const db = getSupabaseAdmin();
  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  const { data, error } = await db
    .from("interest_accruals")
    .select("to_date, interest_accrued, fx_translation")
    .gte("to_date", startDate)
    .lte("to_date", endDate)
    .order("to_date", { ascending: true });

  if (error) throw new Error(`fetchAccruals: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];

  let cumulative = 0;
  let totalAccrued = 0;
  let totalFx = 0;
  let latestDate: string | null = null;

  const series = rows.map((row) => {
    const accrued = Number(row.interest_accrued ?? 0);
    const fx = Number(row.fx_translation ?? 0);
    const t = String(row.to_date ?? "");
    cumulative += accrued;
    totalAccrued += accrued;
    totalFx += fx;
    latestDate = t || latestDate;
    return { t, accrued: r(accrued, 4), cumulative: r(cumulative, 4), fx: r(fx, 4) };
  });

  const dayCount = rows.length;
  return {
    series,
    summary: {
      totalAccrued: r(totalAccrued, 2),
      totalFx: r(totalFx, 2),
      dayCount,
      avgDaily: dayCount > 0 ? r(totalAccrued / dayCount, 4) : 0,
      latestDate,
    },
  };
}
