import { zeitraumToDateRange } from "../src/lib/dateRange";

describe("zeitraumToDateRange", () => {
  it("returns no bounds for 'alle'", () => {
    const result = zeitraumToDateRange("alle", new Date("2026-07-15T12:00:00.000Z"));
    expect(result).toEqual({});
  });

  it("returns the calendar week (Monday to Sunday) for 'diese-woche'", () => {
    // 2026-07-15 is a Wednesday
    const result = zeitraumToDateRange("diese-woche", new Date("2026-07-15T12:00:00.000Z"));
    expect(result.dateFrom).toBe(new Date(2026, 6, 13, 0, 0, 0, 0).toISOString());
    expect(result.dateTo).toBe(new Date(2026, 6, 19, 23, 59, 59, 999).toISOString());
  });

  it("handles a Sunday correctly for 'diese-woche' (week already started Monday)", () => {
    // 2026-07-19 is a Sunday
    const result = zeitraumToDateRange("diese-woche", new Date("2026-07-19T12:00:00.000Z"));
    expect(result.dateFrom).toBe(new Date(2026, 6, 13, 0, 0, 0, 0).toISOString());
    expect(result.dateTo).toBe(new Date(2026, 6, 19, 23, 59, 59, 999).toISOString());
  });

  it("returns the calendar month for 'dieser-monat'", () => {
    const result = zeitraumToDateRange("dieser-monat", new Date("2026-07-15T12:00:00.000Z"));
    expect(result.dateFrom).toBe(new Date(2026, 6, 1, 0, 0, 0, 0).toISOString());
    expect(result.dateTo).toBe(new Date(2026, 6, 31, 23, 59, 59, 999).toISOString());
  });

  it("returns no bounds for 'zeitraum' (custom range handled separately by the caller)", () => {
    const result = zeitraumToDateRange("zeitraum", new Date("2026-07-15T12:00:00.000Z"));
    expect(result).toEqual({});
  });
});
