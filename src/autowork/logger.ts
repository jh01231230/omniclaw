/**
 * Autowork Logger
 * 
 * Task automation logging with daily rotation
 * Full mode: logs to /media/tars/TARS_MEMORY/autowork/logs/
 * Minimal mode: logs to ~/.omniclaw/memory/autowork/logs/
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("autowork");

export type TaskStatus = 
  | "QUEUED"
  | "STARTED"
  | "FOUND"
  | "SELECTED"
  | "BRANCHED"
  | "EXECUTING"
  | "COMMITTED"
  | "COMPLETED"
  | "FAILED"
  | "SKIPPED";

export type MemoryMode = "minimal" | "full";

interface LogEntry {
  timestamp: string;
  taskId: string;
  status: TaskStatus;
  message: string;
  details?: Record<string, unknown>;
}

let logFilePath: string | null = null;
let currentDate: string | null = null;
let memoryMode: MemoryMode = "full";

/**
 * Get the log directory based on memory mode
 */
function getLogDir(): string {
  if (memoryMode === "full") {
    // Full mode: Optane storage
    return "/media/tars/TARS_MEMORY/autowork/logs";
  } else {
    // Minimal mode: workspace memory dir
    return path.join(os.homedir(), ".omniclaw", "memory", "autowork", "logs");
  }
}

/**
 * Initialize the autowork logger with the specified memory mode
 */
export function initAutoworkLogger(mode: MemoryMode): void {
  memoryMode = mode;
  log.info({ mode }, "Autowork logger initialized");
}

/**
 * Get or create today's log file path
 */
async function getLogFile(): Promise<string> {
  const today = new Date().toISOString().split("T")[0];
  
  // Check if we need to rotate to a new day
  if (logFilePath && currentDate === today) {
    return logFilePath;
  }

  const logDir = getLogDir();
  await fs.mkdir(logDir, { recursive: true });
  
  logFilePath = path.join(logDir, `${today}.log`);
  currentDate = today;
  
  log.debug({ logFilePath }, "Log file ready");
  return logFilePath;
}

/**
 * Format a log entry for the audit log
 */
function formatLogEntry(entry: LogEntry): string {
  const { timestamp, taskId, status, message, details } = entry;
  
  let line = `[${timestamp}] [${taskId}] ${status.padEnd(11)} | ${message}`;
  
  if (details && Object.keys(details).length > 0) {
    const detailsStr = Object.entries(details)
      .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
      .join(", ");
    line += ` | ${detailsStr}`;
  }
  
  return line;
}

/**
 * Write a task log entry to file
 */
async function writeToFile(entry: LogEntry): Promise<void> {
  try {
    const filePath = await getLogFile();
    const line = formatLogEntry(entry) + "\n";
    await fs.appendFile(filePath, line, "utf-8");
  } catch (err) {
    // Don't fail the task if logging fails
    log.error({ error: String(err) }, "Failed to write to audit log");
  }
}

/**
 * Log a task action
 */
export function taskLog(
  taskId: string,
  status: TaskStatus,
  message: string,
  details?: Record<string, unknown>,
): void {
  const timestamp = new Date().toISOString();
  
  // Also log to the main subsystem logger (goes to /tmp/omniclaw)
  const logData = { taskId, status, ...details };
  
  switch (status) {
    case "STARTED":
    case "FOUND":
    case "SELECTED":
    case "BRANCHED":
      log.info(logData, message);
      break;
    case "EXECUTING":
      log.debug(logData, message);
      break;
    case "COMMITTED":
    case "COMPLETED":
      log.info(logData, message);
      break;
    case "FAILED":
      log.error(logData, message);
      break;
    case "SKIPPED":
    case "QUEUED":
      log.debug(logData, message);
      break;
    default:
      log.info(logData, message);
  }

  // Write to daily audit log file (async, don't await)
  writeToFile({ timestamp, taskId, status, message, details });
}

/**
 * Get the audit log for a specific date
 */
export async function getAuditLog(date: string): Promise<string> {
  const logDir = getLogDir();
  const filePath = path.join(logDir, `${date}.log`);
  
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Get recent audit logs (last N days)
 */
export async function getRecentAuditLogs(days: number = 7): Promise<Record<string, string>> {
  const logs: Record<string, string> = {};
  const today = new Date();
  
  for (let i = 0; i < days; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    
    const content = await getAuditLog(dateStr);
    if (content) {
      logs[dateStr] = content;
    }
  }
  
  return logs;
}

/**
 * List available audit log dates
 */
export async function listAuditLogDates(): Promise<string[]> {
  const logDir = getLogDir();
  
  try {
    const files = await fs.readdir(logDir);
    return files
      .filter(f => f.endsWith(".log"))
      .map(f => f.replace(".log", ""))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export default log;
