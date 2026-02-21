import type { HookHandler, InternalHookEvent } from "../../hooks.js";

const startTarsMemory: HookHandler = async (event: InternalHookEvent) => {
  // Only run on gateway startup
  if (event.type !== "gateway" || event.action !== "startup") {
    return;
  }

  console.log("[tars-memory] Gateway started, checking memory services...");

  // The actual PostgreSQL management is now handled by the gateway's internal mechanisms
  // This hook can be used for additional startup tasks if needed
};

export default startTarsMemory;
