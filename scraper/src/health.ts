import type { SourceHealth } from "./types";

const BROKEN_AFTER_FAILURES = 3;

export function updateHealth(
  previous: SourceHealth | undefined,
  sourceId: string,
  result: { success: boolean; eventCount: number },
  nowIso: string,
): SourceHealth {
  const consecutiveFailures = result.success ? 0 : (previous?.consecutiveFailures ?? 0) + 1;
  const lastSuccessAt = result.success ? nowIso : previous?.lastSuccessAt;

  const hadEventsBefore = (previous?.eventsFoundLastRun ?? 0) > 0;
  const wentToZero = result.success && result.eventCount === 0 && hadEventsBefore;

  let status: SourceHealth["status"] = "ok";
  if (consecutiveFailures >= BROKEN_AFTER_FAILURES) {
    status = "broken";
  } else if (wentToZero) {
    status = "degraded";
  }

  return {
    sourceId,
    lastRunAt: nowIso,
    lastSuccessAt,
    eventsFoundLastRun: result.eventCount,
    consecutiveFailures,
    status,
  };
}
