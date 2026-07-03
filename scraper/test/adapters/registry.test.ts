import { describe, expect, it, beforeEach } from "vitest";
import { adapterRegistry, getAdapter, registerAdapter, type EventAdapter } from "../../src/adapters/registry";

describe("adapter registry", () => {
  beforeEach(() => {
    adapterRegistry.clear();
  });

  it("registers and retrieves an adapter by type", () => {
    const dummy: EventAdapter = {
      type: "dummy",
      fetchEvents: async () => [],
    };
    registerAdapter(dummy);
    expect(getAdapter("dummy")).toBe(dummy);
  });

  it("throws a descriptive error for an unregistered type", () => {
    expect(() => getAdapter("does-not-exist")).toThrow(
      'No adapter registered for type "does-not-exist"',
    );
  });
});
