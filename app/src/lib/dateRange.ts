export type ZeitraumOption = "alle" | "diese-woche" | "dieser-monat" | "zeitraum";

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMonday, 0, 0, 0, 0);
}

export function zeitraumToDateRange(
  zeitraum: ZeitraumOption,
  now: Date,
): { dateFrom?: string; dateTo?: string } {
  if (zeitraum === "diese-woche") {
    const monday = startOfWeekMonday(now);
    const sunday = new Date(
      monday.getFullYear(),
      monday.getMonth(),
      monday.getDate() + 6,
      23,
      59,
      59,
      999,
    );
    return { dateFrom: monday.toISOString(), dateTo: sunday.toISOString() };
  }

  if (zeitraum === "dieser-monat") {
    const first = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { dateFrom: first.toISOString(), dateTo: last.toISOString() };
  }

  return {};
}

export function toStartOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  const date = new Date(`${dateText}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

export function toEndOfDayIso(dateText: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return undefined;
  const date = new Date(`${dateText}T23:59:59.999Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}
