import { execSync, exec } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import type { OmniClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";
import { defaultRuntime } from "../runtime.js";

export type MemoryDeploymentType = "minimal" | "full";

export interface MemoryDeploymentConfig {
  type: MemoryDeploymentType;
  enableCredentials?: boolean; // Whether to create credentials partition
  autoInstall?: boolean; // Auto-install PostgreSQL + Redis
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
 * Detect the platform and return appropriate install info
 */
function detectPlatform(): { isLinux: boolean; isMac: boolean; isArm: boolean } {
  const platform = process.platform;
  const arch = process.arch;
  return {
    isLinux: platform === "linux",
    isMac: platform === "darwin",
    isArm: arch === "arm64" || arch === "aarch64",
  };
}

/**
 * Auto-install PostgreSQL 17 + Redis for full memory mode
 */
export async function autoInstallMemoryServices(
  storagePath: string,
  prompter: WizardPrompter,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<{
  postgresql: MemoryDeploymentConfig["postgresql"];
  redisInstalled: boolean;
}> {
  const { isLinux, isMac, isArm } = detectPlatform();

  if (!isLinux && !isMac) {
    await prompter.note(
      "Automatic installation is only supported on Linux and macOS. Please install PostgreSQL 17+ and Redis manually.",
      "Auto-install not supported",
    );
    throw new Error("Auto-install not supported on this platform");
  }

  const installPath = path.join(storagePath, "postgresql-installed");
  const dataPath = path.join(storagePath, "postgresql", "data");
  const redisDataPath = path.join(storagePath, "redis");

  runtime.log(`Auto-installing memory services to: ${storagePath}`);

  // Create directories
  await prompter.note(`Creating directories at ${storagePath}...`, "Memory Setup");
  execSync(`mkdir -p "${installPath}" "${dataPath}" "${redisDataPath}"`, { stdio: "pipe" });

  // Check if running on ARM (like NVIDIA Jetson)
  const isArmBoard = isArm && isLinux;

  if (isLinux) {
    // Try to install via apt first (faster)
    try {
      runtime.log("Attempting PostgreSQL installation via apt...");
      execSync("sudo apt-get update && sudo apt-get install -y postgresql-17 postgresql-17-postgis-3 redis-server", {
        stdio: "inherit",
      });
    } catch {
      // If apt fails, use the custom installer script
      runtime.log("apt install failed, using custom installer...");
      const installerScript = "/home/tars/Workspace/scripts/install_tars_memory.sh";

      if (fs.existsSync(installerScript)) {
        // Run the installer with custom paths
        execSync(`bash "${installerScript}"`, {
          env: {
            ...process.env,
            OPTANE_MOUNT: storagePath,
            POSTGRES_INSTALL: installPath,
            POSTGRES_DATA: dataPath,
            REDIS_DATA: redisDataPath,
          },
          stdio: "inherit",
        });
      } else {
        // Fall back to basic installation instructions
        await prompter.note(
          [
            `PostgreSQL 17+ is required but not installed.`,
            isArmBoard
              ? "For ARM devices (Jetson), please compile PostgreSQL from source."
              : "Please run:",
            "",
            "  # For Ubuntu/Debian:",
            "  sudo apt install postgresql-17",
            "  # OR use the TARS Memory installer:",
            "  bash /home/tars/Workspace/scripts/install_tars_memory.sh",
            "",
            `Storage path: ${storagePath}`,
          ].join("\n"),
          "PostgreSQL Required",
        );
        throw new Error("PostgreSQL not installed");
      }
    }
  } else if (isMac) {
    // macOS installation
    try {
      // Check if Homebrew is available
      execSync("which brew", { stdio: "pipe" });
      runtime.log("Installing PostgreSQL and Redis via Homebrew...");
      execSync("brew install postgresql@17 redis", { stdio: "inherit" });

      // Start services
      execSync("brew services start postgresql@17", { stdio: "inherit" });
      execSync("brew services start redis", { stdio: "inherit" });
    } catch {
      await prompter.note(
        [
          "PostgreSQL 17+ is required but not installed.",
          "Please install Homebrew and run:",
          "  brew install postgresql@17 redis",
          "  brew services start postgresql@17",
          "  brew services start redis",
        ].join("\n"),
        "PostgreSQL Required",
      );
      throw new Error("PostgreSQL not installed");
    }
  }

  // Try to start PostgreSQL if not running
  const pgBinPaths = [
    "/media/tars/TARS_MEMORY/postgresql-installed/bin",
    "/usr/lib/postgresql/17/bin",
    "/usr/local/opt/postgresql@17/bin",
    "/opt/homebrew/opt/postgresql@17/bin",
  ];

  let psqlPath = "";
  for (const p of pgBinPaths) {
    if (fs.existsSync(path.join(p, "psql"))) {
      psqlPath = p;
      break;
    }
  }

  // Try to start PostgreSQL
  if (psqlPath) {
    try {
      const pgCtl = path.join(psqlPath, "pg_ctl");
      if (fs.existsSync(pgCtl)) {
        execSync(`${pgCtl -D "${dataPath}" status || ${pgCtl} -D "${dataPath}" start -w`, {
          stdio: "pipe",
        });
      }
    } catch {
      runtime.log("PostgreSQL may already be running or could not be started");
    }
  }

  // Check if Redis is available
  let redisInstalled = false;
  try {
    execSync("redis-cli ping", { stdio: "pipe" });
    redisInstalled = true;
  } catch {
    // Try to start redis
    try {
      execSync("redis-server --daemonize yes", { stdio: "pipe" });
      redisInstalled = true;
    } catch {
      runtime.log("Redis could not be started");
    }
  }

  return {
    postgresql: {
      host: "localhost",
      port: 5432,
      database: "openclaw_memory",
      user: isMac ? os.userInfo().username : "postgres",
      password: "",
      installPath,
      dataPath,
      autoStart: true,
    },
    redisInstalled,
  };
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
 * Initialize full memory schema (long_term_memory, distilled_experience, memory_metadata)
 * Requires pgvector extension to be installed
 */
export async function initializeMemorySchema(
  pgConfig: { host: string; port: number; database: string; user: string; password?: string },
  runtime: RuntimeEnv = defaultRuntime,
): Promise<boolean> {
  const { host, port, database, user, password } = pgConfig;
  const env = { ...process.env, PGPASSWORD: password || "" };

  try {
    const schemaSQL = `
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS vector; EXCEPTION WHEN duplicate_object THEN null; END
$$;

CREATE TABLE IF NOT EXISTS long_term_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    importance_score FLOAT DEFAULT 0.5,
    detail_level VARCHAR(20) DEFAULT 'detail'
);

CREATE INDEX IF NOT EXISTS idx_long_term_memory_embedding 
ON long_term_memory USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

CREATE TABLE IF NOT EXISTS distilled_experience (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pattern TEXT NOT NULL,
    context_pattern TEXT,
    success_rate FLOAT DEFAULT 0.5,
    times_used INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    last_used TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id UUID REFERENCES long_term_memory(id) ON DELETE CASCADE,
    source_session UUID,
    tags JSONB DEFAULT '[]',
    last_accessed TIMESTAMP DEFAULT NOW(),
    access_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memory_metadata_session ON memory_metadata (source_session);
CREATE INDEX IF NOT EXISTS idx_memory_metadata_tags ON memory_metadata USING gin (tags);
`.replace(/\n/g, " ");

    execSync(`psql -h "${host}" -p "${port}" -U "${user}" -d "${database}" -c "${schemaSQL}"`, {
      env,
      stdio: "pipe",
    });

    runtime.log(`Memory schema initialized in ${database}`);
    return true;
  } catch (error) {
    runtime.error(`Failed to initialize memory schema: ${error}`);
    runtime.log(
      `Warning: If pgvector is not installed, run: cd /tmp && git clone --depth 1 https://github.com/pgvector/pgvector.git && cd pgvector && make PG_CONFIG=/path/to/pg_config && sudo make install`,
    );
    return false;
  }
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

export interface PromptMemoryDeploymentOptions {
  memoryMode?: MemoryDeploymentType;
  memoryPath?: string;
  autoInstall?: boolean;
}

export async function promptMemoryDeployment(
  prompter: WizardPrompter,
  runtime: RuntimeEnv,
  options?: PromptMemoryDeploymentOptions,
): Promise<MemoryDeploymentConfig> {
  // Use provided options in non-interactive mode
  let type: MemoryDeploymentType = "minimal";

  if (options?.memoryMode) {
    type = options.memoryMode;
  } else {
    type = await prompter.select({
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
          hint: "Full-featured vector database with embedding search. Requires PostgreSQL 17+",
        },
      ],
      initialValue: "minimal",
    }) as MemoryDeploymentType;
  }

  const config: MemoryDeploymentConfig = {
    type,
    autoInstall: options?.autoInstall,
  };

  // For full deployment, check PostgreSQL installation
  if (type === "full") {
    // Auto-install if requested
    if (options?.autoInstall && options?.memoryPath) {
      try {
        await prompter.note("Auto-installing PostgreSQL and Redis...", "Memory Setup");
        const installResult = await autoInstallMemoryServices(
          options.memoryPath,
          prompter,
          runtime,
        );
        config.postgresql = installResult.postgresql;

        // Create database if needed
        if (installResult.postgresql) {
          const { createDatabase } = await import("../infra/postgres.js");
          await createDatabase(
            installResult.postgresql.database,
            installResult.postgresql.user,
            runtime,
          );
        }
      } catch (err) {
        runtime.error(`Auto-install failed: ${err}`);
        await prompter.note("Auto-install failed. Please install manually or use minimal mode.", "Memory Setup");
        config.type = "minimal";
      }
    } else {
      const pgReady = await ensurePostgreSQL(prompter, runtime);
      if (!pgReady) {
        // Fall back to minimal if PostgreSQL not available
        await prompter.note("Falling back to minimal memory deployment.", "PostgreSQL");
        config.type = "minimal";
      }
    }
  }

  if (config.type === "full" && config.postgresql) {
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

    // Initialize full memory schema (long_term_memory, etc.)
    // This requires PostgreSQL to be running and pgvector installed
    try {
      await initializeMemorySchema(
        {
          host: config.postgresql.host,
          port: config.postgresql.port,
          database: config.postgresql.database,
          user: config.postgresql.user,
          password: config.postgresql.password,
        },
        runtime,
      );
    } catch (err) {
      runtime.log(`Warning: Memory schema initialization skipped: ${err}`);
    }
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
    // Minimal also gets basic sync
    memorySettings.sync = {
      onSessionStart: true,
      onSearch: true,
      watch: false,
      intervalMinutes: 60,
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

    // Add periodic summary for full deployment
    memorySettings.sync = {
      onSessionStart: true,
      onSearch: true,
      watch: false,
      intervalMinutes: 30,
    };

    memorySettings.periodicSummary = {
      enabled: true,
      intervalHours: 24,
      outputPath: "~/.omniclaw/memory/periodic-summaries.md",
    };
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
