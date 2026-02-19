import { removeStaleGatewayLocks } from "./gateway-lock.js";
import { classifyPortListener } from "./ports-format.js";
/**
 * Cleans orphan gateway processes and stale locks before starting the gateway.
 * Ensures the latest run is the only run when starting or restarting.
 */
import { inspectPortUsage } from "./ports-inspect.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function killPid(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // Process may already be dead
  }
}

/**
 * Kills orphan gateway processes holding the target port and removes stale locks.
 * Call before acquiring the lock and binding in both CLI run and daemon restart.
 * Skips when OMNICLAW_ALLOW_MULTI_GATEWAY=1 or in tests.
 */
export async function cleanupOrphanGatewayProcesses(
  port: number,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ killed: number; locksRemoved: number }> {
  if (env.OMNICLAW_ALLOW_MULTI_GATEWAY === "1" || env.VITEST === "1" || env.NODE_ENV === "test") {
    return { killed: 0, locksRemoved: 0 };
  }

  const usage = await inspectPortUsage(port);
  if (usage.status !== "busy" || usage.listeners.length === 0) {
    const locksRemoved = await removeStaleGatewayLocks({ env });
    return { killed: 0, locksRemoved };
  }

  const gatewayListeners = usage.listeners.filter(
    (l) => l.pid && classifyPortListener(l, port) === "gateway",
  );
  const pidsToKill = [...new Set(gatewayListeners.map((l) => l.pid!))];

  for (const pid of pidsToKill) {
    killPid(pid, "SIGTERM");
  }
  if (pidsToKill.length > 0) {
    await sleep(500);
    for (const pid of pidsToKill) {
      try {
        process.kill(pid, 0);
        killPid(pid, "SIGKILL");
      } catch {
        // Already dead
      }
    }
    await sleep(200);
  }

  const locksRemoved = await removeStaleGatewayLocks({ env });
  return { killed: pidsToKill.length, locksRemoved };
}
