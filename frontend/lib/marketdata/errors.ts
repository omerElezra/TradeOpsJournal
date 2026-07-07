import "server-only";

export class MarketDataError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = "MarketDataError";
  }
}
