import { execSync } from "node:child_process";
import type { OmniClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";
import { defaultRuntime } from "../runtime.js";

export type MemoryDeploymentType = "minimal" | "full";

export interface MemoryDeploymentConfig {
  type: MemoryDeploymentType;
  enableCredentials?: boolean; // Whether to create credentials partition
  postgresql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    installPath?: string; // Path to PostgreSQL installation
    dataPath?: string; // Path to data directory
    autoStart?: boolean; // Auto-start on gateway boot
  };
  dataPath?: string; // For minimal: ~/.omniclaw/memory; For full: custom PostgreSQL path
}

/**
 * Initialize credentials table in PostgreSQL
 */
export async function initializeCredentialsPartition(
  pgConfig: { host: string; port: number; database: string; user: string; password?: string },
  runtime: RuntimeEnv = defaultRuntime,
): Promise<boolean> {
  const { host, port, database, user, password } = pgConfig;

  const env = { ...process.env, PGPASSWORD: password || "" };

  try {
    // Create credentials table
    const createTableSQL = `
CREATE TABLE IF NOT EXISTS credentials (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    service TEXT NOT NULL,
    username TEXT,
    encrypted_data TEXT NOT NULL DEFAULT '',
    extra JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_credentials_category ON credentials(category);
CREATE INDEX IF NOT EXISTS idx_credentials_service ON credentials(service);
CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_unique ON credentials(category, service);
`.replace(/\n/g, " ");

    execSync(
      `psql -h "${host}" -p "${port}" -U "${user}" -d "${database}" -c "${createTableSQL}"`,
      { env, stdio: "pipe" },
    );

    runtime.log(`Credentials partition created in ${database}`);
    return true;
  } catch (error) {
    runtime.error(`Failed to create credentials partition: ${error}`);
    return false;
  }
}

/**
 * Prompt user to set up credentials storage
 */
export async function promptCredentialsSetup(
  prompter: WizardPrompter,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<boolean> {
  const setup = await prompter.confirm({
    message: "Create secure credentials partition?",

    initialValue: true,
  });

  if (setup) {
    await prompter.note(
      [
        "Credentials will be stored encrypted in the PostgreSQL database.",
        "",
        "Use the credentials CLI to manage:",
        "  ./tars-credentials.sh add <category> <service> <data>",
        "",
        "Categories: email, server, website, api, etc.",
      ].join("\n"),
      "Credentials",
    );
  }

  return setup;
}

/**
 * Check if PostgreSQL is installed and meets minimum version requirement (17+)
 */
export async function checkPostgreSQLInstallation(): Promise<{
  installed: boolean;
  version?: string;
  versionNumber?: number;
  error?: string;
}> {
  try {
    const result = execSync("psql --version", { encoding: "utf-8" });
    const match = result.match(/psql \(PostgreSQL\) (\d+)\./);
    if (match) {
      const versionNumber = parseInt(match[1], 10);
      return {
        installed: true,
        version: result.trim(),
        versionNumber,
      };
    }
    return { installed: false, error: "Could not parse version" };
  } catch {
    return { installed: false, error: "PostgreSQL not found" };
  }
}

/**
 * Prompt user to install PostgreSQL if not present
 */
export async function ensurePostgreSQL(
  prompter: WizardPrompter,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<boolean> {
  const pgCheck = await checkPostgreSQLInstallation();

  if (pgCheck.installed && pgCheck.versionNumber && pgCheck.versionNumber >= 17) {
    await prompter.note(`PostgreSQL ${pgCheck.version} found.`, "PostgreSQL");
    return true;
  }

  await prompter.note(
    [
      "PostgreSQL 17+ is required for full memory deployment.",
      "",
      "Installation options:",
      "1. Ubuntu/Debian: sudo apt install postgresql-17",
      "2. Use the TARS Memory installer:",
      "   bash /home/tars/Workspace/scripts/install_tars_memory.sh",
      "3. Or compile from source:",
      "   https://www.postgresql.org/download/",
    ].join("\n"),
    "PostgreSQL Required",
  );

  const install = await prompter.confirm({
    message: "Have you installed PostgreSQL 17+? Continue?",
    initialValue: false,
  });

  return install;
}

export async function promptMemoryDeployment(
  prompter: WizardPrompter,
  runtime: RuntimeEnv,
): Promise<MemoryDeploymentConfig> {
  const type = await prompter.select({
    message: "Choose memory deployment type",
    options: [
      {
        value: "minimal",
        label: "Minimal (SQLite)",
        hint: "Lightweight file-based storage. Memory files in ~/.omniclaw/memory",
      },
      {
        value: "full",
        label: "Full (PostgreSQL)",
        hint: "Full-featured vector database. Requires PostgreSQL 17+",
      },
    ],
    initialValue: "minimal",
  });

  const config: MemoryDeploymentConfig = { type: type as MemoryDeploymentType };

  // For full deployment, check PostgreSQL installation
  if (type === "full") {
    const pgReady = await ensurePostgreSQL(prompter, runtime);
    if (!pgReady) {
      // Fall back to minimal if PostgreSQL not available
      await prompter.note("Falling back to minimal memory deployment.", "PostgreSQL");
      config.type = "minimal";
    }
  }

  if (config.type === "full") {
    // For full deployment, prompt for PostgreSQL configuration
    const useDefault = await prompter.confirm({
      message: "Use default PostgreSQL at localhost:5432?",
      initialValue: true,
    });

    if (!useDefault) {
      const host = await prompter.text({
        message: "PostgreSQL host",
        initialValue: "localhost",
      });
      const port = await prompter.text({
        message: "PostgreSQL port",
        initialValue: "5432",
      });
      const database = await prompter.text({
        message: "Database name",
        initialValue: "openclaw_memory",
      });
      const user = await prompter.text({
        message: "Database user",
        initialValue: "postgres",
      });
      const password = await prompter.text({
        message: "Database password",
      });

      config.postgresql = {
        host,
        port: parseInt(port, 10),
        database,
        user,
        password,
      };
    } else {
      // Default PostgreSQL config
      config.postgresql = {
        host: "localhost",
        port: 5432,
        database: "openclaw_memory",
        user: "postgres",
        password: "",
        installPath: "/media/tars/TARS_MEMORY/postgresql-installed",
        dataPath: "/media/tars/TARS_MEMORY/postgresql/data",
        autoStart: true,
      };
    }

    // Prompt for PostgreSQL paths and auto-start
    if (config.postgresql) {
      const installPath = await prompter.text({
        message: "PostgreSQL installation path",
        initialValue:
          config.postgresql.installPath || "/media/tars/TARS_MEMORY/postgresql-installed",
      });
      const dataPath = await prompter.text({
        message: "PostgreSQL data directory path",
        initialValue: config.postgresql.dataPath || "/media/tars/TARS_MEMORY/postgresql/data",
      });
      const autoStart = await prompter.confirm({
        message: "Auto-start PostgreSQL on gateway boot?",
        initialValue: true,
      });

      config.postgresql.installPath = installPath;
      config.postgresql.dataPath = dataPath;
      config.postgresql.autoStart = autoStart;
    }

    // Prompt for credentials partition
    config.enableCredentials = await promptCredentialsSetup(prompter, runtime);
  }

  return config;
}

export function applyMemoryDeploymentConfig(
  baseConfig: OmniClawConfig,
  memoryConfig: MemoryDeploymentConfig,
): OmniClawConfig {
  const memorySettings: Record<string, unknown> = {
    deployment: memoryConfig.type,
  };

  if (memoryConfig.type === "minimal") {
    // Minimal: Use SQLite with memory files in ~/.omniclaw/memory
    memorySettings.store = {
      driver: "sqlite",
      path: "~/.omniclaw/memory.db",
    };
  } else if (memoryConfig.type === "full" && memoryConfig.postgresql) {
    // Full: Use PostgreSQL
    memorySettings.store = {
      driver: "postgresql",
      host: memoryConfig.postgresql.host,
      port: memoryConfig.postgresql.port,
      database: memoryConfig.postgresql.database,
      user: memoryConfig.postgresql.user,
      password: memoryConfig.postgresql.password,
    };

    // Store PostgreSQL management settings
    if (
      memoryConfig.postgresql.installPath ||
      memoryConfig.postgresql.dataPath ||
      memoryConfig.postgresql.autoStart !== undefined
    ) {
      memorySettings.postgresql = {
        installPath: memoryConfig.postgresql.installPath,
        dataPath: memoryConfig.postgresql.dataPath,
        autoStart: memoryConfig.postgresql.autoStart,
      };
    }

    // Store credentials flag in config
    if (memoryConfig.enableCredentials !== undefined) {
      memorySettings.enableCredentials = memoryConfig.enableCredentials;
    }
  }

  const agents = baseConfig.agents ?? {};
  const defaults = agents.defaults ?? {};
  const memorySearch = defaults.memorySearch ?? {};

  return {
    ...baseConfig,
    agents: {
      ...agents,
      defaults: {
        ...defaults,
        memorySearch: {
          ...memorySearch,
          ...memorySettings,
        },
      },
    },
  };
}
