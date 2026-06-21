"use client";

import * as React from "react";
import type { Range } from "@/types";

interface RangeContextValue {
  range: Range;
  setRange: (r: Range) => void;
}

const RangeContext = React.createContext<RangeContextValue | null>(null);

export function RangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = React.useState<Range>("ytd");
  return (
    <RangeContext.Provider value={{ range, setRange }}>
      {children}
    </RangeContext.Provider>
  );
}

export function useRange() {
  const ctx = React.useContext(RangeContext);
  if (!ctx) throw new Error("useRange must be used within RangeProvider");
  return ctx;
}
