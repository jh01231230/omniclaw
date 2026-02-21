import type { HookHandler, InternalHookEvent } from "../../hooks.js";
import { loadConfig } from "../../config/config.js";
import {
  startPostgreSQL,
  checkPostgreSQLStatus,
  type PostgreSQLConfig,
} from "../../memory/postgresql-manager.js";

const startTarsMemory: HookHandler = async (event: InternalHookEvent) => {
  // Only run on gateway startup
  if (event.type !== "gateway" || event.action !== "startup") {
    return;
  }

  // Load config to check memory settings
  const cfg = loadConfig();
  const memorySearch = cfg.agents?.defaults?.memorySearch;

  // Check if full deployment with PostgreSQL
  if (memorySearch?.deployment !== "full") {
    return; // Not using PostgreSQL, skip
  }

  const postgresqlConfig = memorySearch.postgresql;

  // Check if autoStart is enabled
  if (!postgresqlConfig?.autoStart) {
    console.log("[tars-memory] Auto-start disabled in config");
    return;
  }

  // Check PostgreSQL status first
  const pgConfig: PostgreSQLConfig = {
    installPath: postgresqlConfig.installPath,
    dataPath: postgresqlConfig.dataPath,
    port: postgresqlConfig.port,
  };

  const status = checkPostgreSQLStatus(pgConfig);
  console.log("[tars-memory] Status:", status);

  if (status.running) {
    console.log("[tars-memory] PostgreSQL already running");
    return;
  }

  // Try to start PostgreSQL
  console.log("[tars-memory] Starting PostgreSQL...");
  const result = startPostgreSQL(pgConfig);

  if (result.success) {
    console.log("[tars-memory] PostgreSQL started successfully");
  } else {
    console.error("[tars-memory] Failed to start PostgreSQL:", result.error);
  }
};

export default startTarsMemory;
