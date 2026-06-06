/** Display formatters. All monetary/percent values render with tabular-nums. */

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatSignedCurrency(value: number, currency = "USD"): string {
  const sign = value > 0 ? "+" : "";
  return sign + formatCurrency(value, currency);
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatNumber(value: number, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function pnlIntent(value: number): "positive" | "negative" | "neutral" {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return "neutral";
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes}m`;

  const totalHours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (totalHours < 24) {
    return mins ? `${totalHours}h ${mins}m` : `${totalHours}h`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;

  if (days < 30) {
    return hours ? `${days}d ${hours}h` : `${days}d`;
  }

  const months = Math.floor(days / 30);
  const remDays = days % 30;
  return remDays ? `${months}mo ${remDays}d` : `${months}mo`;
}
