import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OmniClawConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";
import { resolveIsNixMode, resolveStateDir } from "../config/paths.js";
import { runCommandWithTimeout } from "../process/exec.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath } from "../utils.js";

export type MemoryDeploymentType = "minimal" | "full";

export interface MemoryDeploymentConfig {
  type: MemoryDeploymentType;
  enableCredentials?: boolean;
  autoInstall?: boolean;
  dataPath?: string;
  postgresql?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    installPath?: string;
    dataPath?: string;
    autoStart?: boolean;
  };
  redis?: {
    host: string;
    port: number;
    db?: number;
    sessionPrefix?: string;
    dataPath?: string;
  };
}

const DEFAULT_FULL_DB_NAME = "omniclaw_memory";
const DEFAULT_REDIS_SESSION_PREFIX = "session:";

type InstallResult = {
  postgresql: NonNullable<MemoryDeploymentConfig["postgresql"]>;
  redis: NonNullable<MemoryDeploymentConfig["redis"]>;
};

function resolveDefaultMinimalSqlitePath() {
  const stateDir = resolveStateDir(process.env, os.homedir);
  return path.join(stateDir, "memory.db");
}

function resolveDefaultFullRootPath() {
  const stateDir = resolveStateDir(process.env, os.homedir);
  return path.join(stateDir, "memory-services");
}

function defaultPostgresUser() {
  return process.platform === "darwin" ? os.userInfo().username : "postgres";
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function runCommand(params: {
  argv: string[];
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  allowFailure?: boolean;
  cwd?: string;
}): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const result = await runCommandWithTimeout(params.argv, {
    timeoutMs: params.timeoutMs ?? 60_000,
    env: params.env,
    cwd: params.cwd,
  });
  const ok = result.code === 0;
  if (!ok && !params.allowFailure) {
    const details = result.stderr.trim() || result.stdout.trim() || "unknown error";
    throw new Error(details);
  }
  return {
    ok,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function quotePgIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

async function detectPostgresInstallPath(): Promise<string | undefined> {
  const pgConfig = await runCommand({
    argv: ["pg_config", "--bindir"],
    timeoutMs: 10_000,
    allowFailure: true,
  });
  if (!pgConfig.ok) {
    return undefined;
  }
  const bindir = pgConfig.stdout.trim();
  if (!bindir) {
    return undefined;
  }
  return path.dirname(bindir);
}

async function detectAptPgvectorPackage(): Promise<string | null> {
  const result = await runCommand({
    argv: ["bash", "-lc", "apt-cache search --names-only pgvector"],
    timeoutMs: 30_000,
    allowFailure: true,
  });
  if (!result.ok) {
    return null;
  }
  const candidates = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/)[0] ?? "")
    .filter((name) => name.length > 0);
  if (candidates.length === 0) {
    return null;
  }
  return candidates[0] ?? null;
}

async function runPsql(params: {
  pg: NonNullable<MemoryDeploymentConfig["postgresql"]>;
  database: string;
  sql: string;
  allowFailure?: boolean;
}) {
  const pg = params.pg;
  const env = pg.password
    ? {
        ...process.env,
        PGPASSWORD: pg.password,
      }
    : process.env;
  return await runCommand({
    argv: [
      "psql",
      "-h",
      pg.host,
      "-p",
      String(pg.port),
      "-U",
      pg.user,
      "-d",
      params.database,
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      params.sql,
    ],
    timeoutMs: 60_000,
    env,
    allowFailure: params.allowFailure,
  });
}

async function ensureDatabaseAndPgvector(
  pg: NonNullable<MemoryDeploymentConfig["postgresql"]>,
  runtime: RuntimeEnv,
) {
  const dbName = quotePgIdentifier(pg.database);

  const createDb = await runPsql({
    pg,
    database: "postgres",
    sql: `CREATE DATABASE ${dbName};`,
    allowFailure: true,
  });
  if (!createDb.ok) {
    const err = createDb.stderr + createDb.stdout;
    if (!/already exists/i.test(err)) {
      runtime.log(
        `[memory] Database create warning: ${createDb.stderr.trim() || createDb.stdout.trim()}`,
      );
    }
  }

  const createVector = await runPsql({
    pg,
    database: pg.database,
    sql: "CREATE EXTENSION IF NOT EXISTS vector;",
    allowFailure: true,
  });
  if (!createVector.ok) {
    const err = createVector.stderr.trim() || createVector.stdout.trim();
    throw new Error(
      [
        "pgvector extension is not available.",
        err,
        "Install pgvector and re-run onboarding, or switch to minimal mode.",
      ].join("\n"),
    );
  }
}

async function installLinuxMemoryServices(params: {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
}) {
  await params.prompter.note(
    "Installing PostgreSQL + pgvector + Redis (requires sudo).",
    "Memory Setup",
  );
  await runCommand({
    argv: ["sudo", "apt-get", "update"],
    timeoutMs: 20 * 60_000,
  });
  await runCommand({
    argv: ["sudo", "apt-get", "install", "-y", "postgresql", "postgresql-contrib", "redis-server"],
    timeoutMs: 20 * 60_000,
  });

  const pgvectorPackage = await detectAptPgvectorPackage();
  if (pgvectorPackage) {
    await runCommand({
      argv: ["sudo", "apt-get", "install", "-y", pgvectorPackage],
      timeoutMs: 20 * 60_000,
    });
  } else {
    params.runtime.log(
      "[memory] No pgvector apt package detected via apt-cache search; continuing and validating extension availability.",
    );
  }

  await runCommand({
    argv: ["sudo", "systemctl", "enable", "--now", "postgresql"],
    timeoutMs: 60_000,
    allowFailure: true,
  });
  await runCommand({
    argv: ["sudo", "systemctl", "enable", "--now", "redis-server"],
    timeoutMs: 60_000,
    allowFailure: true,
  });
}

async function installMacMemoryServices(params: { prompter: WizardPrompter }) {
  await params.prompter.note(
    "Installing PostgreSQL + pgvector + Redis with Homebrew.",
    "Memory Setup",
  );
  await runCommand({
    argv: ["brew", "install", "postgresql@17", "redis", "pgvector"],
    timeoutMs: 20 * 60_000,
  });
  await runCommand({
    argv: ["brew", "services", "start", "postgresql@17"],
    timeoutMs: 60_000,
    allowFailure: true,
  });
  await runCommand({
    argv: ["brew", "services", "start", "redis"],
    timeoutMs: 60_000,
    allowFailure: true,
  });
}

export async function autoInstallMemoryServices(
  storagePath: string,
  prompter: WizardPrompter,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<InstallResult> {
  if (resolveIsNixMode(process.env)) {
    throw new Error("Automatic memory service install is disabled in Nix mode.");
  }
  if (process.platform !== "linux" && process.platform !== "darwin") {
    throw new Error("Automatic installation is only supported on Linux and macOS.");
  }

  const resolvedRoot = resolveUserPath(storagePath);
  const postgresDataPath = path.join(resolvedRoot, "postgresql", "data");
  const redisDataPath = path.join(resolvedRoot, "redis");
  await ensureDir(postgresDataPath);
  await ensureDir(redisDataPath);

  if (process.platform === "linux") {
    await installLinuxMemoryServices({ prompter, runtime });
  } else {
    await installMacMemoryServices({ prompter });
  }

  const installPath = await detectPostgresInstallPath();
  const postgresConfig: NonNullable<MemoryDeploymentConfig["postgresql"]> = {
    host: process.platform === "linux" ? "/var/run/postgresql" : "127.0.0.1",
    port: 5432,
    database: DEFAULT_FULL_DB_NAME,
    user: process.platform === "linux" ? os.userInfo().username : defaultPostgresUser(),
    password: "",
    installPath,
    dataPath: postgresDataPath,
    autoStart: true,
  };
  const redisConfig: NonNullable<MemoryDeploymentConfig["redis"]> = {
    host: "127.0.0.1",
    port: 6379,
    db: 0,
    sessionPrefix: DEFAULT_REDIS_SESSION_PREFIX,
    dataPath: redisDataPath,
  };

  if (process.platform === "linux") {
    const user = os.userInfo().username;
    await runCommand({
      argv: ["sudo", "-u", "postgres", "createuser", "--superuser", user],
      timeoutMs: 60_000,
      allowFailure: true,
    });
    await runCommand({
      argv: ["sudo", "-u", "postgres", "createdb", "--owner", user, DEFAULT_FULL_DB_NAME],
      timeoutMs: 60_000,
      allowFailure: true,
    });
  }

  await ensureDatabaseAndPgvector(postgresConfig, runtime);

  return {
    postgresql: postgresConfig,
    redis: redisConfig,
  };
}

export async function initializeCredentialsPartition(
  pgConfig: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  },
  runtime: RuntimeEnv = defaultRuntime,
): Promise<boolean> {
  const sql = [
    "CREATE SCHEMA IF NOT EXISTS credentials;",
    "CREATE TABLE IF NOT EXISTS credentials.secrets (",
    "  id SERIAL PRIMARY KEY,",
    "  key TEXT UNIQUE NOT NULL,",
    "  value_encrypted TEXT NOT NULL,",
    "  created_at TIMESTAMPTZ DEFAULT now()",
    ");",
  ].join(" ");

  const result = await runPsql({
    pg: {
      host: pgConfig.host,
      port: pgConfig.port,
      database: pgConfig.database,
      user: pgConfig.user,
      password: pgConfig.password ?? "",
    },
    database: pgConfig.database,
    sql,
    allowFailure: true,
  });
  if (!result.ok) {
    runtime.error(
      `[memory] Failed to initialize credentials partition: ${
        result.stderr.trim() || result.stdout.trim()
      }`,
    );
    return false;
  }
  return true;
}

export async function promptCredentialsSetup(
  prompter: WizardPrompter,
  _runtime: RuntimeEnv = defaultRuntime,
): Promise<boolean> {
  return await prompter.confirm({
    message: "Create credentials table in PostgreSQL?",
    initialValue: false,
  });
}

export async function initializeMemorySchema(
  pgConfig: { host: string; port: number; database: string; user: string; password?: string },
  runtime: RuntimeEnv = defaultRuntime,
): Promise<boolean> {
  try {
    await ensureDatabaseAndPgvector(
      {
        host: pgConfig.host,
        port: pgConfig.port,
        database: pgConfig.database,
        user: pgConfig.user,
        password: pgConfig.password ?? "",
      },
      runtime,
    );
    return true;
  } catch (error) {
    runtime.error(`[memory] Failed to initialize memory schema: ${String(error)}`);
    return false;
  }
}

export async function checkPostgreSQLInstallation(): Promise<{
  installed: boolean;
  version?: string;
  versionNumber?: number;
  error?: string;
}> {
  const result = await runCommand({
    argv: ["psql", "--version"],
    timeoutMs: 10_000,
    allowFailure: true,
  });
  if (!result.ok) {
    return { installed: false, error: result.stderr.trim() || "psql not found" };
  }
  const output = result.stdout.trim();
  const match = output.match(/(\d+)\./);
  const versionNumber = match?.[1] ? Number.parseInt(match[1], 10) : undefined;
  return {
    installed: true,
    version: output,
    versionNumber,
  };
}

export async function ensurePostgreSQL(
  prompter: WizardPrompter,
  runtime: RuntimeEnv = defaultRuntime,
): Promise<boolean> {
  const pg = await checkPostgreSQLInstallation();
  if (pg.installed) {
    await prompter.note(`Detected ${pg.version ?? "PostgreSQL"}.`, "PostgreSQL");
    return true;
  }
  await prompter.note(
    [
      "PostgreSQL is not installed.",
      "Install PostgreSQL + pgvector + Redis, or choose minimal mode.",
      "",
      "Linux:",
      "  sudo apt-get update",
      "  sudo apt-get install -y postgresql postgresql-contrib redis-server",
      "",
      "macOS:",
      "  brew install postgresql@17 redis pgvector",
    ].join("\n"),
    "PostgreSQL required",
  );
  const proceed = await prompter.confirm({
    message: "Continue with full mode after manual installation?",
    initialValue: false,
  });
  if (!proceed) {
    runtime.log("[memory] Falling back to minimal mode.");
  }
  return proceed;
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
  const memoryType =
    options?.memoryMode ??
    ((await prompter.select({
      message: "Choose memory deployment type",
      options: [
        {
          value: "minimal",
          label: "Minimal (default)",
          hint: "SQLite-backed memory index in ~/.omniclaw",
        },
        {
          value: "full",
          label: "Full (PostgreSQL + pgvector + Redis)",
          hint: "Long-term + short-term memory services with semantic search",
        },
      ],
      initialValue: "minimal",
    })) as MemoryDeploymentType);

  if (memoryType === "minimal") {
    return {
      type: "minimal",
      dataPath: resolveDefaultMinimalSqlitePath(),
      autoInstall: false,
    };
  }

  const fullRoot =
    options?.memoryPath ??
    (await prompter.text({
      message: "Memory deployment directory",
      initialValue: resolveDefaultFullRootPath(),
      validate: (value) => (value.trim().length > 0 ? undefined : "Path is required."),
    }));
  const deploymentRoot = resolveUserPath(fullRoot);
  const autoInstall =
    options?.autoInstall ??
    (await prompter.confirm({
      message: "Install PostgreSQL + pgvector + Redis now?",
      initialValue: true,
    }));

  const defaultPostgres: NonNullable<MemoryDeploymentConfig["postgresql"]> = {
    host: process.platform === "linux" ? "/var/run/postgresql" : "127.0.0.1",
    port: 5432,
    database: DEFAULT_FULL_DB_NAME,
    user: process.platform === "linux" ? os.userInfo().username : defaultPostgresUser(),
    password: "",
    dataPath: path.join(deploymentRoot, "postgresql", "data"),
    autoStart: true,
  };
  const defaultRedis: NonNullable<MemoryDeploymentConfig["redis"]> = {
    host: "127.0.0.1",
    port: 6379,
    db: 0,
    sessionPrefix: DEFAULT_REDIS_SESSION_PREFIX,
    dataPath: path.join(deploymentRoot, "redis"),
  };

  const config: MemoryDeploymentConfig = {
    type: "full",
    dataPath: deploymentRoot,
    autoInstall,
    postgresql: defaultPostgres,
    redis: defaultRedis,
  };

  if (autoInstall) {
    try {
      const install = await autoInstallMemoryServices(deploymentRoot, prompter, runtime);
      config.postgresql = install.postgresql;
      config.redis = install.redis;
    } catch (error) {
      runtime.error(`[memory] Auto-install failed: ${String(error)}`);
      await prompter.note(
        "Full mode setup failed; falling back to minimal mode. You can reconfigure memory later.",
        "Memory Setup",
      );
      return {
        type: "minimal",
        dataPath: resolveDefaultMinimalSqlitePath(),
        autoInstall: false,
      };
    }
  } else {
    const pgReady = await ensurePostgreSQL(prompter, runtime);
    if (!pgReady) {
      return {
        type: "minimal",
        dataPath: resolveDefaultMinimalSqlitePath(),
        autoInstall: false,
      };
    }
  }

  config.enableCredentials = await promptCredentialsSetup(prompter, runtime);
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
    const sqlitePath =
      memoryConfig.dataPath && memoryConfig.dataPath.endsWith(".db")
        ? resolveUserPath(memoryConfig.dataPath)
        : resolveDefaultMinimalSqlitePath();
    memorySettings.store = {
      driver: "sqlite",
      path: sqlitePath,
    };
    memorySettings.sync = {
      onSessionStart: true,
      onSearch: true,
      watch: false,
      intervalMinutes: 60,
    };
  } else if (memoryConfig.type === "full" && memoryConfig.postgresql && memoryConfig.redis) {
    memorySettings.store = {
      driver: "postgresql",
      host: memoryConfig.postgresql.host,
      port: memoryConfig.postgresql.port,
      database: memoryConfig.postgresql.database,
      user: memoryConfig.postgresql.user,
      password: memoryConfig.postgresql.password,
      vector: {
        enabled: true,
      },
    };
    memorySettings.postgresql = {
      installPath: memoryConfig.postgresql.installPath,
      dataPath: memoryConfig.postgresql.dataPath,
      port: memoryConfig.postgresql.port,
      autoStart: memoryConfig.postgresql.autoStart,
    };
    memorySettings.redis = {
      host: memoryConfig.redis.host,
      port: memoryConfig.redis.port,
      db: memoryConfig.redis.db,
      sessionPrefix: memoryConfig.redis.sessionPrefix,
    };
    memorySettings.experimental = {
      sessionMemory: true,
    };
    memorySettings.sync = {
      onSessionStart: true,
      onSearch: true,
      watch: false,
      intervalMinutes: 30,
    };
  }

  if (memoryConfig.enableCredentials !== undefined) {
    memorySettings.enableCredentials = memoryConfig.enableCredentials;
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
