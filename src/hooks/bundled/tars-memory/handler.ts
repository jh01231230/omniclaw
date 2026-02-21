import type { HookHandler, InternalHookEvent } from "../../hooks.js";

const TARS_MEMORY_SCRIPT = "/home/tars/Workspace/scripts/tars-memory-auto.sh";

const startTarsMemory: HookHandler = async (event: InternalHookEvent) => {
  // Only run on gateway startup
  if (event.type !== "gateway" || event.action !== "startup") {
    return;
  }

  // Check if deployment is "full" (PostgreSQL)
  // This hook will auto-start TARS Memory services regardless
  // as it's needed for the database

  try {
    const { execSync } = await import("node:child_process");
    const result = execSync(`${TARS_MEMORY_SCRIPT} start`, {
      encoding: "utf-8",
      timeout: 30000,
    });
    console.log("[tars-memory] Auto-started:", result);
  } catch (err) {
    console.error("[tars-memory] Failed to auto-start:", err);
  }
};

export default startTarsMemory;
