import type { DataSource } from "./types";

/**
 * STUB: a real SAP export would be read here (for example an OData feed or a nightly file drop).
 * Not implemented. The class assignment simulates SAP with seed CSVs, see CsvSeedSource.
 */
export class SapSource implements DataSource {
  private notImplemented(): never {
    throw new Error("SapSource is a stub. Use CsvSeedSource until a real SAP export is wired in.");
  }

  getSkus(): never {
    return this.notImplemented();
  }

  getWeeklySales(): never {
    return this.notImplemented();
  }

  getStock(): never {
    return this.notImplemented();
  }

  getCalendar(): never {
    return this.notImplemented();
  }

  getOpenPos(): never {
    return this.notImplemented();
  }
}
