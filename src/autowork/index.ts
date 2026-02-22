/**
 * Autowork Module
 * 
 * Idle task automation with user notification
 * 
 * @example
 * import { initAutowork, autoworkTick, getAutoworkStatus } from "./autowork/index.js";
 * 
 * // Initialize
 * initAutowork({
 *   enabled: true,
 *   memoryMode: "full",
 *   idleMinutes: 30,
 *   reportIntervalMinutes: 15,
 *   maxConcurrent: 1,
 *   workDir: "/home/tars/Workspace/omniclaw",
 *   sources: [
 *     { type: "memory-db" },
 *     { type: "code-todos", paths: ["/home/tars/Workspace/omniclaw/src"] }
 *   ]
 * }, (msg) => console.log(msg));
 * 
 * // Run tick (call periodically)
 * await autoworkTick();
 */

export { 
  initAutowork, 
  autoworkTick, 
  getAutoworkStatus,
  scanForTasks,
  type AutoworkConfig,
  type TodoTask,
  type TaskSource,
  type TaskExecution 
} from "./engine.js";

export { 
  taskLog, 
  initAutoworkLogger,
  listAuditLogDates,
  getAuditLog,
  type TaskStatus 
} from "./logger.js";

export { 
  createBranch, 
  commitChanges, 
  checkoutBranch,
  pushBranch,
  getGitStatus,
  isGitRepo 
} from "./git.js";
