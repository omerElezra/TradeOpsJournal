/**
 * Parse CSV text into an array of row objects keyed by the header row.
 * Handles quoted fields, escaped quotes (""), and commas/newlines inside quotes.
 * Header names are preserved as-is; use case-insensitive lookup when reading.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0].trim() === "") continue; // skip blank lines
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] ?? "").trim();
    });
    out.push(obj);
  }
  return out;
}

/** Read a value from a parsed CSV row by any of the given header names (case-insensitive). */
export function csvField(row: Record<string, string>, ...names: string[]): string {
  for (const key of Object.keys(row)) {
    if (names.some((n) => n.toLowerCase() === key.toLowerCase())) return row[key];
  }
  return "";
}

/** Normalize an ISO/exported timestamp into the "YYYY-MM-DDTHH:MM:SS" form a datetime-local input accepts. */
export function toDatetimeLocal(s: string): string {
  if (!s) return "";
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return s;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4] ?? "00"}`;
}

export function downloadCsv(filename: string, rows: object[], columns: string[]) {
  function escape(v: unknown): string {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  }

  const lines = [
    columns.join(","),
    ...rows.map((r) => columns.map((c) => escape((r as Record<string, unknown>)[c])).join(",")),
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
