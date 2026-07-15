import { toEndOfDayIso, toStartOfDayIso, zeitraumToDateRange } from "../src/lib/dateRange";

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

describe("toStartOfDayIso", () => {
  it("converts a valid date to the start-of-day ISO string", () => {
    expect(toStartOfDayIso("2026-07-15")).toBe("2026-07-15T00:00:00.000Z");
  });

  it("returns undefined for a format-matching but invalid month (13)", () => {
    expect(toStartOfDayIso("2026-13-01")).toBeUndefined();
  });

  it("returns undefined for a format-matching but invalid day (32)", () => {
    expect(toStartOfDayIso("2026-01-32")).toBeUndefined();
  });

  it("returns undefined for a format-matching but invalid month (00)", () => {
    expect(toStartOfDayIso("2026-00-15")).toBeUndefined();
  });
});

describe("toEndOfDayIso", () => {
  it("converts a valid date to the end-of-day ISO string", () => {
    expect(toEndOfDayIso("2026-07-15")).toBe("2026-07-15T23:59:59.999Z");
  });

  it("returns undefined for a format-matching but invalid month (13)", () => {
    expect(toEndOfDayIso("2026-13-01")).toBeUndefined();
  });

  it("returns undefined for a format-matching but invalid day (32)", () => {
    expect(toEndOfDayIso("2026-01-32")).toBeUndefined();
  });

  it("returns undefined for a format-matching but invalid month (00)", () => {
    expect(toEndOfDayIso("2026-00-15")).toBeUndefined();
  });
});
