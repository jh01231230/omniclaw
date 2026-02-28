/**
 * PostgreSQL Manager for TARS Memory
 * Manages PostgreSQL lifecycle based on memorySearch.postgresql config
 */

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface PostgreSQLConfig {
  installPath?: string;
  dataPath?: string;
  port?: number;
  autoStart?: boolean;
}

export interface PostgreSQLStatus {
  running: boolean;
  mounted: boolean;
  version?: string;
  error?: string;
}

/**
 * Detect PostgreSQL installation
 */
export function detectPostgreSQL(): { found: boolean; path?: string; version?: string } {
  const possiblePaths = ["/usr/bin/postgres", "/usr/local/bin/postgres", process.env.POSTGRES_PATH];

  // Also check common install locations
  const commonPaths = [
    "/media/tars/TARS_MEMORY/postgresql-installed/bin/postgres",
    "/opt/postgresql/bin/postgres",
  ];

  for (const p of [...possiblePaths, ...commonPaths]) {
    if (!p) {
      continue;
    }
    try {
      if (fs.existsSync(p)) {
        const version = execSync(`${path.dirname(p)}/psql --version`, { encoding: "utf-8" }).trim();
        return { found: true, path: path.dirname(p), version };
      }
    } catch {
      // Continue checking
    }
  }

  // Try system postgres
  try {
    const version = execSync("psql --version", { encoding: "utf-8" }).trim();
    return { found: true, path: "/usr/bin", version };
  } catch {
    return { found: false };
  }
}

/**
 * Start PostgreSQL based on config
 */
export function startPostgreSQL(config: PostgreSQLConfig): { success: boolean; error?: string } {
  const installPath = config.installPath || "/media/tars/TARS_MEMORY/postgresql-installed";
  const dataPath = config.dataPath || "/media/tars/TARS_MEMORY/postgresql/data";
  const pg_ctl = path.join(installPath, "bin", "pg_ctl");

  // Check if already running
  try {
    const status = execSync(`${pg_ctl} -D ${dataPath} status`, { encoding: "utf-8" });
    if (status.includes("server is running")) {
      return { success: true };
    }
  } catch {
    // Not running, try to start
  }

  // Try to start
  try {
    // Mount check (if dataPath is on a mount)
    const dataDir = path.dirname(dataPath);
    if (dataDir.includes("/media/")) {
      try {
        execSync(`mountpoint -q ${dataDir}`, { stdio: "ignore" });
      } catch {
        // Try to mount - assume /dev/nvme0n1p1 or similar
        // This is simplified - could be enhanced
        console.log(`[PostgreSQL] Warning: ${dataDir} may not be mounted`);
      }
    }

    execSync(`${pg_ctl} -D ${dataPath} -l ${dataPath}/logfile start`, {
      timeout: 30000,
      stdio: "ignore",
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Stop PostgreSQL
 */
export function stopPostgreSQL(config: PostgreSQLConfig): { success: boolean; error?: string } {
  const installPath = config.installPath || "/media/tars/TARS_MEMORY/postgresql-installed";
  const dataPath = config.dataPath || "/media/tars/TARS_MEMORY/postgresql/data";

  const pg_ctl = path.join(installPath, "bin", "pg_ctl");

  try {
    execSync(`${pg_ctl} -D ${dataPath} stop`, { timeout: 10000, stdio: "ignore" });
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * Check PostgreSQL status
 */
export function checkPostgreSQLStatus(config: PostgreSQLConfig): PostgreSQLStatus {
  const installPath = config.installPath || "/media/tars/TARS_MEMORY/postgresql-installed";
  const dataPath = config.dataPath || "/media/tars/TARS_MEMORY/postgresql/data";

  const pg_ctl = path.join(installPath, "bin", "pg_ctl");

  // Check if data directory is mounted/accessible
  let mounted = false;
  try {
    fs.accessSync(dataPath, fs.constants.R_OK);
    mounted = true;
  } catch {
    mounted = false;
  }

  // Check if running
  let running = false;
  try {
    const status = execSync(`${pg_ctl} -D ${dataPath} status`, { encoding: "utf-8" });
    running = status.includes("server is running");
  } catch {
    running = false;
  }

  // Try to get version
  let version: string | undefined;
  try {
    version = execSync(`${path.join(installPath, "bin", "psql")} --version`, {
      encoding: "utf-8",
    }).trim();
  } catch {
    // Try system psql
    try {
      version = execSync("psql --version", { encoding: "utf-8" }).trim();
    } catch {
      // Ignore
    }
  }

  return { running, mounted, version };
}
