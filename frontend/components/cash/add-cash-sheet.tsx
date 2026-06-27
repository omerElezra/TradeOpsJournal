"use client";

import * as React from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { csvField, parseCsv, toDatetimeLocal } from "@/lib/csv";
import type { ManualCashInput } from "@/types";

type Row = {
  execTime: string;
  symbol: string;
  action: "" | "BUY" | "SELL";
  quantity: string;
  rate: string;
  netCash: string;
  commission: string;
  description: string;
};

function blankRow(): Row {
  return {
    execTime: "",
    symbol: "USD.ILS",
    action: "",
    quantity: "",
    rate: "",
    netCash: "",
    commission: "",
    description: "",
  };
}

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";

export function AddCashSheet({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (result: { inserted: number; skipped: number }) => void;
}) {
  const [rows, setRows] = React.useState<Row[]>([blankRow()]);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setRows([blankRow()]);
      setError(null);
      setSaving(false);
    }
  }, [open]);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    try {
      const parsed = parseCsv(await file.text());
      const mapped: Row[] = parsed.map((r) => {
        const a = csvField(r, "action").toUpperCase();
        return {
          execTime: toDatetimeLocal(csvField(r, "execTime", "exec_time", "time")),
          symbol: csvField(r, "symbol", "pair").toUpperCase() || "USD.ILS",
          action: a === "BUY" || a === "SELL" ? a : "",
          quantity: csvField(r, "quantity", "qty"),
          rate: csvField(r, "rate"),
          netCash: csvField(r, "netCash", "net_cash"),
          commission: csvField(r, "commission", "comm"),
          description: csvField(r, "description", "notes"),
        };
      });
      if (!mapped.length) {
        setError("No data rows found in CSV.");
        return;
      }
      setRows(mapped);
    } catch {
      setError("Could not read that CSV file.");
    }
  };

  const update = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, blankRow()]);
  const removeRow = (i: number) =>
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));

  const save = async () => {
    setError(null);
    const payload: ManualCashInput[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.execTime || !r.symbol || !r.quantity) {
        setError(`Row ${i + 1}: time, symbol, and quantity are required.`);
        return;
      }
      payload.push({
        execTime: r.execTime,
        symbol: r.symbol,
        action: r.action || null,
        quantity: Number(r.quantity),
        rate: r.rate ? Number(r.rate) : null,
        netCash: r.netCash ? Number(r.netCash) : null,
        commission: r.commission ? Number(r.commission) : null,
        description: r.description || null,
      });
    }

    setSaving(true);
    try {
      const result = await api.addManualCash(payload);
      onSaved(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save transactions.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add cash transactions"
      description="Enter rows manually, or load a CSV that matches the Export CSV columns (execTime, symbol, action, quantity, rate, netCash, commission). Manual rows merge automatically if the same row later arrives from IBKR."
      className="max-w-5xl"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving
              ? "Saving…"
              : `Save ${rows.length} transaction${rows.length > 1 ? "s" : ""}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 pr-2 font-medium">Time</th>
                <th className="pb-2 pr-2 font-medium">Pair</th>
                <th className="pb-2 pr-2 font-medium">Action</th>
                <th className="pb-2 pr-2 font-medium">Qty</th>
                <th className="pb-2 pr-2 font-medium">Rate</th>
                <th className="pb-2 pr-2 font-medium">Net Cash</th>
                <th className="pb-2 pr-2 font-medium">Commission</th>
                <th className="pb-2 pr-2 font-medium">Description</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2">
                    <input
                      type="datetime-local"
                      step={1}
                      value={r.execTime}
                      onChange={(e) => update(i, { execTime: e.target.value })}
                      className={`${inputCls} w-44`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={r.symbol}
                      onChange={(e) => update(i, { symbol: e.target.value.toUpperCase() })}
                      placeholder="USD.ILS"
                      className={`${inputCls} w-24`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      value={r.action}
                      onChange={(e) => update(i, { action: e.target.value as Row["action"] })}
                      className={`${inputCls} w-20`}
                    >
                      <option value="">—</option>
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={r.quantity}
                      onChange={(e) => update(i, { quantity: e.target.value })}
                      placeholder="1000"
                      className={`${inputCls} w-24`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      step="any"
                      value={r.rate}
                      onChange={(e) => update(i, { rate: e.target.value })}
                      placeholder="3.65"
                      className={`${inputCls} w-20`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      step="any"
                      value={r.netCash}
                      onChange={(e) => update(i, { netCash: e.target.value })}
                      placeholder="auto"
                      className={`${inputCls} w-24`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      step="any"
                      value={r.commission}
                      onChange={(e) => update(i, { commission: e.target.value })}
                      placeholder="0"
                      className={`${inputCls} w-20`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      value={r.description}
                      onChange={(e) => update(i, { description: e.target.value })}
                      placeholder="optional"
                      className={`${inputCls} w-32`}
                    />
                  </td>
                  <td className="py-1">
                    <button
                      onClick={() => removeRow(i)}
                      disabled={rows.length === 1}
                      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-negative disabled:opacity-30"
                      aria-label={`Remove row ${i + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={addRow} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Add row
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            className="gap-1.5"
          >
            <Upload className="h-3.5 w-3.5" />
            Load CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onFile}
            className="hidden"
          />
        </div>

        {error && (
          <p className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
