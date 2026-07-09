import { describe, expect, it } from "vitest";
import { updateHealth } from "../src/health";

const now = "2026-07-03T12:00:00.000Z";

describe("updateHealth", () => {
  it("creates a fresh ok health record on first successful run", () => {
    const health = updateHealth(undefined, "source-a", { success: true, eventCount: 5 }, now);
    expect(health).toEqual({
      sourceId: "source-a",
      lastRunAt: now,
      lastSuccessAt: now,
      eventsFoundLastRun: 5,
      consecutiveFailures: 0,
      status: "ok",
    });
  });

  it("marks a source broken after 3 consecutive failures", () => {
    let health = updateHealth(undefined, "source-a", { success: false, eventCount: 0 }, now);
    expect(health.status).toBe("ok");
    health = updateHealth(health, "source-a", { success: false, eventCount: 0 }, now);
    expect(health.status).toBe("ok");
    health = updateHealth(health, "source-a", { success: false, eventCount: 0 }, now);
    expect(health.status).toBe("broken");
    expect(health.consecutiveFailures).toBe(3);
  });

  it("resets consecutiveFailures and returns to ok after a success", () => {
    let health = updateHealth(undefined, "source-a", { success: false, eventCount: 0 }, now);
    health = updateHealth(health, "source-a", { success: false, eventCount: 0 }, now);
    health = updateHealth(health, "source-a", { success: true, eventCount: 3 }, now);
    expect(health.status).toBe("ok");
    expect(health.consecutiveFailures).toBe(0);
    expect(health.eventsFoundLastRun).toBe(3);
  });

  it("marks degraded when a source that historically had events suddenly returns zero", () => {
    let health = updateHealth(undefined, "source-a", { success: true, eventCount: 4 }, now);
    health = updateHealth(health, "source-a", { success: true, eventCount: 0 }, now);
    expect(health.status).toBe("degraded");
    expect(health.consecutiveFailures).toBe(0);
  });
});
