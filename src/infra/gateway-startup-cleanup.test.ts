import { describe, expect, it, vi } from "vitest";
import { cleanupOrphanGatewayProcesses } from "./gateway-startup-cleanup.js";

vi.mock("./ports-inspect.js", () => ({
  inspectPortUsage: vi.fn(),
}));

vi.mock("./gateway-lock.js", () => ({
  removeStaleGatewayLocks: vi.fn().mockResolvedValue(0),
}));

describe("cleanupOrphanGatewayProcesses", () => {
  it("skips cleanup when OMNICLAW_ALLOW_MULTI_GATEWAY=1", async () => {
    const result = await cleanupOrphanGatewayProcesses(18789, {
      OMNICLAW_ALLOW_MULTI_GATEWAY: "1",
    });
    expect(result).toEqual({ killed: 0, locksRemoved: 0 });
  });

  it("skips cleanup in test env", async () => {
    const result = await cleanupOrphanGatewayProcesses(18789, {
      VITEST: "1",
    });
    expect(result).toEqual({ killed: 0, locksRemoved: 0 });
  });

  it("removes stale locks when port is free", async () => {
    const { inspectPortUsage } = await import("./ports-inspect.js");
    vi.mocked(inspectPortUsage).mockResolvedValue({
      port: 18789,
      status: "free",
      listeners: [],
      hints: [],
    });
    const { removeStaleGatewayLocks } = await import("./gateway-lock.js");
    vi.mocked(removeStaleGatewayLocks).mockResolvedValue(2);

    const result = await cleanupOrphanGatewayProcesses(18789, {});

    expect(result).toEqual({ killed: 0, locksRemoved: 2 });
  });
});
