/**
 * Autowork Database Operations
 *
 * Query and update memory database for task management
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { taskLog, type TaskStatus } from "./logger.js";

export interface DbMemory {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  importance_score: number;
  created_at: string;
  detail_level: string;
}

export interface DbMemoryMetadata {
  id: string;
  memory_id: string;
  source_session: string | null;
  tags: string[];
  last_accessed: string;
  access_count: number;
}

// PostgreSQL connection config
interface PgConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
  psqlPath?: string;
}

let pgConfig: PgConfig | null = null;

/**
 * Initialize PostgreSQL config
 */
export function initAutoworkDb(cfg: PgConfig): void {
  pgConfig = {
    ...cfg,
    psqlPath: cfg.psqlPath || "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql",
  };
  taskLog("DB", "INIT", "PostgreSQL config initialized", {
    host: pgConfig.host,
    port: pgConfig.port,
    database: pgConfig.database,
  });
}

/**
 * Execute a SQL query
 */
function execPg(sql: string, params?: Record<string, string>): string {
  if (!pgConfig) {
    throw new Error("PostgreSQL not initialized");
  }

  const { psqlPath, host, port, database, user, password } = pgConfig;
  const env = { ...process.env, PGPASSWORD: password || "" };

  // Build psql command
  let cmd = `${psqlPath} -h ${host} -p ${port} -U ${user} -d ${database} -t -A -F"|"`;

  if (params) {
    // Replace named params
    for (const [key, value] of Object.entries(params)) {
      sql = sql.replace(new RegExp(`:${key}`, "g"), value.replace(/'/g, "''"));
    }
  }

  try {
    return execSync(cmd, { env, encoding: "utf-8", input: sql }).trim();
  } catch (err) {
    taskLog("DB", "ERROR", `Query failed: ${sql}`, { error: String(err) });
    throw err;
  }
}

/**
 * Query for pending todo tasks
 */
export function queryPendingTasks(limit: number = 10): DbMemory[] {
  const sql = `
    SELECT id, content, metadata::text, importance_score, created_at, detail_level
    FROM long_term_memory
    WHERE metadata->>'type' = 'todo'
      AND (metadata->>'status' IS NULL OR metadata->>'status' = 'pending')
      AND metadata->>'blocked' != 'true'
    ORDER BY importance_score DESC
    LIMIT ${limit}
  `;

  try {
    const result = execPg(sql);
    if (!result) return [];

    return result
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [id, content, metadata, importance_score, created_at, detail_level] = line.split("|");
        return {
          id,
          content,
          metadata: JSON.parse(metadata || "{}"),
          importance_score: parseFloat(importance_score) || 0.5,
          created_at,
          detail_level,
        };
      });
  } catch (err) {
    taskLog("DB", "ERROR", "Failed to query pending tasks", { error: String(err) });
    return [];
  }
}

/**
 * Update task status in database
 */
export function updateTaskStatus(
  taskId: string,
  status: "pending" | "in_progress" | "completed" | "failed" | "blocked",
  additionalMeta?: Record<string, unknown>,
): boolean {
  const meta = JSON.stringify({ status, ...additionalMeta }).replace(/'/g, "''");

  const sql = `
    UPDATE long_term_memory
    SET metadata = '${meta}'::jsonb,
        importance_score = CASE 
          WHEN '${status}' = 'completed' THEN importance_score * 0.5
          ELSE importance_score
        END
    WHERE id = '${taskId}'
  `;

  try {
    execPg(sql);
    taskLog("DB", "UPDATE", `Task ${taskId} status updated to ${status}`, { taskId, status });
    return true;
  } catch (err) {
    taskLog("DB", "ERROR", "Failed to update task status", { taskId, status, error: String(err) });
    return false;
  }
}

/**
 * Create a new todo task
 */
export function createTask(
  title: string,
  content: string,
  importance: number = 0.5,
  metadata: Record<string, unknown> = {},
): string | null {
  const id = randomUUID();
  const fullMeta = JSON.stringify({
    type: "todo",
    status: "pending",
    title,
    ...metadata,
  }).replace(/'/g, "''");
  const tags = "ARRAY['autowork', 'todo']";

  const sql = `
    INSERT INTO long_term_memory (id, content, metadata, importance_score, tags, created_at)
    VALUES ('${id}', E'${content.replace(/'/g, "''")}', '${fullMeta}'::jsonb, ${importance}, ${tags}, NOW())
    RETURNING id
  `;

  try {
    const result = execPg(sql);
    taskLog("DB", "CREATE", `Created task: ${title}`, { id, importance });
    return id;
  } catch (err) {
    taskLog("DB", "ERROR", "Failed to create task", { title, error: String(err) });
    return null;
  }
}

/**
 * Get task by ID
 */
export function getTaskById(taskId: string): DbMemory | null {
  const sql = `
    SELECT id, content, metadata::text, importance_score, created_at, detail_level
    FROM long_term_memory
    WHERE id = '${taskId}'
  `;

  try {
    const result = execPg(sql);
    if (!result) return null;

    const [id, content, metadata, importance_score, created_at, detail_level] = result.split("|");
    return {
      id,
      content,
      metadata: JSON.parse(metadata || "{}"),
      importance_score: parseFloat(importance_score) || 0.5,
      created_at,
      detail_level,
    };
  } catch {
    return null;
  }
}

/**
 * Add note/result to a task
 */
export function appendTaskNote(taskId: string, note: string): boolean {
  const task = getTaskById(taskId);
  if (!task) return false;

  const existingNotes = (task.metadata.notes as string[]) || [];
  const newNotes = [
    ...existingNotes,
    {
      content: note,
      timestamp: new Date().toISOString(),
    },
  ];

  const meta = JSON.stringify({
    ...task.metadata,
    notes: newNotes,
  }).replace(/'/g, "''");

  const sql = `UPDATE long_term_memory SET metadata = '${meta}'::jsonb WHERE id = '${taskId}'`;

  try {
    execPg(sql);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check database connection
 */
export function pingDb(): boolean {
  try {
    execPg("SELECT 1");
    return true;
  } catch {
    return false;
  }
}
