import "server-only";
import { createHash } from "crypto";

/**
 * Canonical number string shared with scripts/ingest.py (canon_num).
 * Whole numbers render without a decimal (100 -> "100"); others use the
 * shortest round-trip form (213.5 -> "213.5"). This MUST stay in sync with
 * the Python side so manual rows and IBKR rows hash identically.
 */
function canonNum(x: number): string {
  if (!Number.isFinite(x)) return "";
  return String(x);
}

/**
 * exec_time fingerprint format: "YYYY-MM-DDTHH:MM:SS" (naive, seconds precision).
 * Matches the strftime("%Y-%m-%dT%H:%M:%S") format ingest.py writes.
 */
export function canonExecTime(execTime: string): string {
  // Accept "2026-06-26T14:30", "...:00", "...Z", "....000Z" → normalize to seconds, drop tz.
  const m = execTime.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return execTime;
  const [, date, hh, mm, ss] = m;
  return `${date}T${hh}:${mm}:${ss ?? "00"}`;
}

/** Trade dedup fingerprint — MUST match make_trade_content_hash() in scripts/ingest.py. */
export function tradeContentHash(
  execTime: string,
  symbol: string,
  quantity: number,
  price: number,
): string {
  const key = `${canonExecTime(execTime)}|${symbol}|${canonNum(quantity)}|${canonNum(price)}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}

/** Cash dedup fingerprint — MUST match make_cash_content_hash() in scripts/ingest.py. */
export function cashContentHash(
  execTime: string,
  symbol: string,
  quantity: number,
  rate: number | null | undefined,
): string {
  const rateStr = rate != null && Number.isFinite(rate) ? canonNum(rate) : "0";
  const key = `${canonExecTime(execTime)}|${symbol}|${canonNum(quantity)}|${rateStr}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 32);
}
