import "server-only";

export interface RawExecution {
  tradeId: string;
  execTime: Date;
  symbol: string;
  action: "BUY" | "SELL";
  quantity: number;
  price: number;
  proceeds: number | null;
  commission: number | null;
  realizedPnl: number | null;
  currency: string;
}

export interface GroupedTrade {
  id: string;
  symbol: string;
  side: "LONG" | "SHORT";
  status: "OPEN" | "CLOSED";
  result: "WIN" | "LOSS" | "BREAKEVEN";
  entryTime: Date;
  exitTime: Date | null;
  qty: number;
  avgEntry: number;
  avgExit: number | null;
  netPnl: number;
  realizedPnl: number;
  commission: number;
  returnPct: number;
  holdingMinutes: number | null;
  currency: string;
  executions: RawExecution[];
}
