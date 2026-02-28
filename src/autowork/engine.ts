/**
 * Autowork Task Engine
 *
 * Idle task execution with user notification:
 * - Start: notify plan
 * - Progress: periodic updates
 * - Stuck: alert user (with anti-spam)
 * - Complete: summary + next task
 * - No tasks: silent
 */

import { randomUUID } from "node:crypto";
import { commitChanges, getGitStatus, isGitRepo } from "./git.js";
import { initAutoworkLogger, taskLog } from "./logger.js";

// ===== Types =====

export interface TodoTask {
  id: string;
  content: string;
  title: string;
  importance: number;
  status: "pending" | "in_progress" | "completed" | "blocked";
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AutoworkConfig {
  enabled: boolean;
  memoryMode: "minimal" | "full";
  idleMinutes: number; // How long idle before scanning
  reportIntervalMinutes: number; // Progress report frequency
  maxConcurrent: number;
  workDir?: string; // Working directory for git
  sources: TaskSource[];
}

export type TaskSource =
  | { type: "memory-db"; query?: string }
  | { type: "code-todos"; paths?: string[] }
  | { type: "github-issues"; repo?: string };

export interface TaskExecution {
  taskId: string;
  task: TodoTask;
  plan: string[];
  currentStep: number;
  status: "planning" | "executing" | "blocked" | "completed" | "failed";
  startedAt: string;
  progressReports: number;
  lastUserAlertAt?: string;
  lastUserAlertContent?: string;
}

// ===== State =====

let config: AutoworkConfig | null = null;
let currentTask: TaskExecution | null = null;
let lastScanTime: number = 0;
let lastUserNotificationTime: number = 0;
let lastUserNotificationContent: string = "";

// Anti-spam: minimum minutes between same alerts
const USER_ALERT_COOLDOWN_MINUTES = 30;

let messageCallback: ((msg: string, opts?: { markdown?: boolean }) => void) | null = null;

// ===== Initialization =====

export function initAutowork(
  cfg: AutoworkConfig,
  sendMessage?: (msg: string, opts?: { markdown?: boolean }) => void,
): void {
  config = cfg;
  messageCallback = sendMessage || null;
  initAutoworkLogger(cfg.memoryMode);

  taskLog("SYSTEM", "INIT", "Autowork initialized", {
    enabled: cfg.enabled,
    memoryMode: cfg.memoryMode,
  });
}

// ===== Task Discovery =====

/**
 * Scan for pending tasks from configured sources
 */
export async function scanForTasks(): Promise<TodoTask[]> {
  if (!config) {
    return [];
  }

  const tasks: TodoTask[] = [];

  for (const source of config.sources) {
    if (source.type === "memory-db") {
      const dbTasks = await scanMemoryDb(source.query);
      tasks.push(...dbTasks);
    } else if (source.type === "code-todos") {
      const codeTasks = await scanCodeTodos(source.paths || []);
      tasks.push(...codeTasks);
    } else if (source.type === "github-issues") {
      // TODO: implement GitHub issues scanning
    }
  }

  // Sort by importance
  tasks.sort((a, b) => b.importance - a.importance);

  taskLog("SCANNER", "FOUND", `Found ${tasks.length} pending tasks`, {
    count: tasks.length,
  });

  return tasks.slice(0, config.maxConcurrent);
}

/**
 * Scan memory database for pending tasks (full mode)
 */
async function scanMemoryDb(_query?: string): Promise<TodoTask[]> {
  // TODO: query the PostgreSQL memory database
  // For now, return empty - will implement when memory DB schema is finalized
  return [];
}

/**
 * Scan code for TODO/FIXME comments (minimal mode fallback)
 */
async function scanCodeTodos(_paths: string[]): Promise<TodoTask[]> {
  // TODO: implement grep for TODO/FIXME in code
  return [];
}

// ===== Task Execution =====

/**
 * Start executing a task
 */
export async function startTask(task: TodoTask, plan: string[]): Promise<void> {
  if (!config) {
    return;
  }

  const execution: TaskExecution = {
    taskId: randomUUID().slice(0, 8).toUpperCase(),
    task,
    plan,
    currentStep: 0,
    status: "planning",
    startedAt: new Date().toISOString(),
    progressReports: 0,
  };

  currentTask = execution;
  lastScanTime = Date.now();

  taskLog(execution.taskId, "STARTED", `Starting task: ${task.title}`, {
    taskId: execution.taskId,
    plan: plan.join(" → "),
  });

  // Notify user of the plan
  const planText = plan.map((step, i) => `${i + 1}. ${step}`).join("\n");
  notifyUser(`🤔 **开始新任务**\n\n**任务**: ${task.title}\n\n**执行计划**:\n${planText}`, {
    isStartNotification: true,
  });
}

/**
 * Execute current task step
 */
export async function executeCurrentStep(): Promise<boolean> {
  if (!currentTask || !config) {
    return false;
  }

  currentTask.status = "executing";
  const step = currentTask.plan[currentTask.currentStep];

  taskLog(
    currentTask.taskId,
    "EXECUTING",
    `Executing step ${currentTask.currentStep + 1}: ${step}`,
  );

  // TODO: Use sub-agent to execute the step
  // For now, return true to simulate completion

  return true;
}

/**
 * Move to next step or complete
 */
export async function advanceTask(): Promise<void> {
  if (!currentTask) {
    return;
  }

  currentTask.currentStep++;

  if (currentTask.currentStep >= currentTask.plan.length) {
    // Task complete
    await completeTask();
  } else {
    // More steps - check if we should report progress
    const now = Date.now();
    const minutesSinceStart = (now - new Date(currentTask.startedAt).getTime()) / 60000;

    if (minutesSinceStart > config!.reportIntervalMinutes) {
      await sendProgressReport();
    }
  }
}

/**
 * Send progress report to user
 */
async function sendProgressReport(): Promise<void> {
  if (!currentTask || !config) {
    return;
  }

  currentTask.progressReports++;
  const step = currentTask.currentStep + 1;
  const total = currentTask.plan.length;
  const progress = Math.round((step / total) * 100);

  taskLog(currentTask.taskId, "PROGRESS", `Progress: ${progress}%`, {
    step,
    total,
    progressReports: currentTask.progressReports,
  });

  const nextStep = currentTask.plan[currentTask.currentStep] || "完成";

  notifyUser(
    `📊 **任务进度**\n\n` +
      `**${currentTask.task.title}**\n` +
      `进度: ${progress}% (${step}/${total})\n` +
      `下一步: ${nextStep}`,
    { isProgressNotification: true },
  );
}

/**
 * Mark current task as blocked
 */
export function blockTask(reason: string, requiresUserAction: string): void {
  if (!currentTask) {
    return;
  }

  currentTask.status = "blocked";

  taskLog(currentTask.taskId, "BLOCKED", `Task blocked: ${reason}`, { reason, requiresUserAction });

  // Check anti-spam before alerting user
  const shouldAlert = shouldAlertUser(requiresUserAction);

  if (shouldAlert) {
    notifyUser(
      `⚠️ **任务阻塞**\n\n` +
        `**任务**: ${currentTask.task.title}\n\n` +
        `**原因**: ${reason}\n\n` +
        `**需要你**: ${requiresUserAction}`,
      { isBlockedNotification: true, blockingReason: requiresUserAction },
    );
  }
}

/**
 * Complete current task
 */
export async function completeTask(): Promise<void> {
  if (!currentTask || !config) {
    return;
  }

  currentTask.status = "completed";
  const duration = Math.round((Date.now() - new Date(currentTask.startedAt).getTime()) / 60000);

  taskLog(currentTask.taskId, "COMPLETED", `Task completed: ${currentTask.task.title}`, {
    durationMinutes: duration,
    stepsCompleted: currentTask.plan.length,
  });

  // Get git status for summary
  const workDir = config.workDir || process.cwd();
  const status = isGitRepo(workDir) ? getGitStatus(workDir) : null;

  const changes = status ? [...status.modified, ...status.untracked].join(", ") || "无" : "N/A";

  // Commit changes if in git repo
  if (isGitRepo(workDir)) {
    commitChanges(currentTask.taskId, `complete: ${currentTask.task.title}`, undefined, workDir);
  }

  // Notify completion
  notifyUser(
    `✅ **任务完成**\n\n` +
      `**${currentTask.task.title}**\n` +
      `耗时: ${duration} 分钟\n` +
      `改动: ${changes}`,
    { isCompletionNotification: true },
  );

  // Update task in DB (mark as completed)
  await updateTaskStatus(currentTask.task.id, "completed");

  // Clear current task
  currentTask = null;
  lastScanTime = 0;
}

/**
 * Fail current task
 */
export async function failTask(reason: string): Promise<void> {
  if (!currentTask || !config) {
    return;
  }

  currentTask.status = "failed";
  const duration = Math.round((Date.now() - new Date(currentTask.startedAt).getTime()) / 60000);

  taskLog(currentTask.taskId, "FAILED", `Task failed: ${reason}`, {
    reason,
    durationMinutes: duration,
  });

  // Notify failure
  notifyUser(
    `❌ **任务失败**\n\n` +
      `**${currentTask.task.title}**\n` +
      `原因: ${reason}\n` +
      `耗时: ${duration} 分钟`,
    { isFailureNotification: true },
  );

  // Update task in DB (mark as failed)
  await updateTaskStatus(currentTask.task.id, "failed", { error: reason });

  currentTask = null;
  lastScanTime = 0;
}

// ===== User Notification =====

interface NotifyOptions {
  isStartNotification?: boolean;
  isProgressNotification?: boolean;
  isBlockedNotification?: boolean;
  isCompletionNotification?: boolean;
  isFailureNotification?: boolean;
  blockingReason?: string;
}

function notifyUser(message: string, opts: NotifyOptions = {}): void {
  if (!messageCallback) {
    return;
  }

  // Update last notification tracking
  lastUserNotificationTime = Date.now();
  if (opts.blockingReason) {
    lastUserNotificationContent = opts.blockingReason;
  }

  messageCallback(message, { markdown: true });
}

/**
 * Check if we should alert user (anti-spam)
 */
function shouldAlertUser(content: string): boolean {
  const now = Date.now();
  const minutesSinceLastAlert = (now - lastUserNotificationTime) / 60000;

  // Always alert if it's been over 30 minutes
  if (minutesSinceLastAlert > USER_ALERT_COOLDOWN_MINUTES) {
    return true;
  }

  // Don't alert if same content within cooldown period
  if (
    content === lastUserNotificationContent &&
    minutesSinceLastAlert < USER_ALERT_COOLDOWN_MINUTES
  ) {
    taskLog("ALERT", "SKIPPED", "Same alert within cooldown period", {
      content,
      minutesSinceLastAlert,
    });
    return false;
  }

  return true;
}

// ===== Task Status Update =====

/**
 * Update task status in memory database
 */
async function updateTaskStatus(
  taskId: string,
  status: "pending" | "in_progress" | "completed" | "failed",
  metadata?: Record<string, unknown>,
): Promise<void> {
  // TODO: implement DB update when memory schema is finalized
  taskLog("DB", "UPDATE", `Task ${taskId} status updated to ${status}`, metadata);
}

// ===== Main Loop =====

/**
 * Run one iteration of the autowork loop
 * Should be called periodically (e.g., every heartbeat or cron)
 */
export async function autoworkTick(): Promise<boolean> {
  if (!config || !config.enabled) {
    return false;
  }

  // If currently executing a task, continue
  if (currentTask) {
    if (currentTask.status === "executing") {
      // Execute next step
      const success = await executeCurrentStep();
      if (success) {
        await advanceTask();
      }
      return true;
    } else if (currentTask.status === "blocked") {
      // Still blocked - don't do anything until unblocked
      return true;
    }
  }

  // Check if enough idle time has passed
  const idleMinutes = (Date.now() - lastScanTime) / 60000;
  if (idleMinutes < config.idleMinutes && lastScanTime > 0) {
    taskLog(
      "TICK",
      "IDLE",
      `Not enough idle time: ${Math.round(idleMinutes)}/${config.idleMinutes} min`,
    );
    return false;
  }

  // Scan for new tasks
  taskLog("TICK", "SCANNING", "Scanning for pending tasks");
  const tasks = await scanForTasks();

  if (tasks.length === 0) {
    // No tasks - stay silent
    taskLog("TICK", "NO_TASKS", "No pending tasks found");
    lastScanTime = Date.now();
    return false; // Return false to indicate "nothing happened, stay silent"
  }

  // Pick highest priority task
  const task = tasks[0];

  // Generate execution plan (simple for now)
  const plan = ["分析任务需求", "编写/修改代码", "测试验证", "提交更改"];

  await startTask(task, plan);
  return true;
}

/**
 * Get current autowork status
 */
export function getAutoworkStatus(): {
  enabled: boolean;
  currentTask: TaskExecution | null;
  lastScan: string | null;
} {
  return {
    enabled: config?.enabled || false,
    currentTask,
    lastScan: lastScanTime > 0 ? new Date(lastScanTime).toISOString() : null,
  };
}
