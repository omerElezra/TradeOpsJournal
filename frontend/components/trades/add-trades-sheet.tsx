"use client";

import * as React from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { csvField, parseCsv, toDatetimeLocal } from "@/lib/csv";
import type { ManualTradeInput } from "@/types";

type Row = {
  execTime: string;
  symbol: string;
  action: "BUY" | "SELL";
  quantity: string;
  price: string;
  commission: string;
};

function blankRow(): Row {
  return { execTime: "", symbol: "", action: "BUY", quantity: "", price: "", commission: "" };
}

const inputCls =
  "h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring";

export function AddTradesSheet({
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
        const action = csvField(r, "action").toUpperCase() === "SELL" ? "SELL" : "BUY";
        return {
          execTime: toDatetimeLocal(csvField(r, "execTime", "exec_time", "time")),
          symbol: csvField(r, "symbol").toUpperCase(),
          action,
          quantity: csvField(r, "quantity", "qty"),
          price: csvField(r, "price"),
          commission: csvField(r, "commission", "comm"),
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
    const payload: ManualTradeInput[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.execTime || !r.symbol || !r.quantity || !r.price) {
        setError(`Row ${i + 1}: time, symbol, quantity, and price are required.`);
        return;
      }
      payload.push({
        execTime: r.execTime,
        symbol: r.symbol,
        action: r.action,
        quantity: Number(r.quantity),
        price: Number(r.price),
        commission: r.commission ? Number(r.commission) : null,
      });
    }

    setSaving(true);
    try {
      const result = await api.addManualTrades(payload);
      onSaved(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save trades.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add trades"
      description="Enter rows manually, or load a CSV that matches the Export CSV columns (execTime, symbol, action, quantity, price, commission). Manual rows merge automatically if the same trade later arrives from IBKR."
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : `Save ${rows.length} trade${rows.length > 1 ? "s" : ""}`}
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
                <th className="pb-2 pr-2 font-medium">Symbol</th>
                <th className="pb-2 pr-2 font-medium">Action</th>
                <th className="pb-2 pr-2 font-medium">Qty</th>
                <th className="pb-2 pr-2 font-medium">Price</th>
                <th className="pb-2 pr-2 font-medium">Commission</th>
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
                      placeholder="AAPL"
                      className={`${inputCls} w-24`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <select
                      value={r.action}
                      onChange={(e) => update(i, { action: e.target.value as "BUY" | "SELL" })}
                      className={`${inputCls} w-20`}
                    >
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
                      placeholder="100"
                      className={`${inputCls} w-20`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={r.price}
                      onChange={(e) => update(i, { price: e.target.value })}
                      placeholder="213.5"
                      className={`${inputCls} w-24`}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      step="any"
                      value={r.commission}
                      onChange={(e) => update(i, { commission: e.target.value })}
                      placeholder="1.0"
                      className={`${inputCls} w-20`}
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
