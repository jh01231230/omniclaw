/**
 * Autowork Git Operations
 *
 * Handles git operations for autowork tasks:
 * - Branch creation
 * - Auto-commit with规范的 message
 * - Never delete .git directories
 */

import { execSync, exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { taskLog } from "./logger.js";

const GIT_FORBIDDEN_PATHS = [".git"];

/**
 * Check if a path is forbidden (like .git)
 */
function isForbiddenPath(targetPath: string): boolean {
  const normalized = path.normalize(targetPath);
  return GIT_FORBIDDEN_PATHS.some(
    (forbidden) =>
      normalized === forbidden ||
      normalized.endsWith(`/${forbidden}`) ||
      normalized.endsWith(`\\${forbidden}`),
  );
}

/**
 * Get the git root of a directory
 */
function getGitRoot(cwd: string): string | null {
  try {
    const result = execSync("git rev-parse --show-toplevel", {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Check if a directory is a git repository
 */
export function isGitRepo(dirPath: string): boolean {
  return getGitRoot(dirPath) !== null;
}

/**
 * Create a new branch for a task
 */
export function createBranch(
  taskId: string,
  slug: string,
  baseBranch: string = "master",
  cwd?: string,
): { success: boolean; branchName: string; error?: string } {
  const branchName = `autowork/${slug}`;

  taskLog(taskId, "BRANCH", `Creating branch: ${branchName}`, { baseBranch, branchName });

  try {
    const workDir = cwd || process.cwd();
    const gitRoot = getGitRoot(workDir);

    if (!gitRoot) {
      const error = "Not a git repository";
      taskLog(taskId, "FAILED", error, { workDir });
      return { success: false, branchName, error };
    }

    // Check if branch already exists
    const branches = execSync("git branch --list", { cwd: gitRoot, encoding: "utf-8" });
    const branchExists = branches.split("\n").some((b) => b.trim() === branchName);

    if (branchExists) {
      // Checkout existing branch
      execSync(`git checkout ${branchName}`, { cwd: gitRoot, stdio: "pipe" });
      taskLog(taskId, "BRANCH", `Checked out existing branch: ${branchName}`);
    } else {
      // Create and switch to new branch
      execSync(`git checkout -b ${branchName} ${baseBranch}`, { cwd: gitRoot, stdio: "pipe" });
      taskLog(taskId, "BRANCH", `Created and switched to branch: ${branchName}`);
    }

    return { success: true, branchName };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    taskLog(taskId, "FAILED", `Branch creation failed: ${error}`, { branchName });
    return { success: false, branchName, error };
  }
}

/**
 * Stage and commit changes
 */
export function commitChanges(
  taskId: string,
  message: string,
  files?: string[],
  cwd?: string,
): { success: boolean; commitHash?: string; error?: string } {
  const commitMessage = `[autowork] ${message}`;

  taskLog(taskId, "COMMIT", `Committing changes: ${commitMessage}`, { files });

  try {
    const workDir = cwd || process.cwd();
    const gitRoot = getGitRoot(workDir);

    if (!gitRoot) {
      const error = "Not a git repository";
      taskLog(taskId, "FAILED", error, { workDir });
      return { success: false, error };
    }

    // Stage files (or all if not specified)
    if (files && files.length > 0) {
      // Validate no forbidden paths
      for (const file of files) {
        if (isForbiddenPath(file)) {
          const error = `Cannot commit forbidden path: ${file}`;
          taskLog(taskId, "FAILED", error);
          return { success: false, error };
        }
      }
      execSync(`git add ${files.join(" ")}`, { cwd: gitRoot, stdio: "pipe" });
    } else {
      // Stage all except .git
      execSync("git add -A", { cwd: gitRoot, stdio: "pipe" });
    }

    // Check if there are changes to commit
    const status = execSync("git status --porcelain", { cwd: gitRoot, encoding: "utf-8" });
    if (!status.trim()) {
      taskLog(taskId, "SKIPPED", "No changes to commit");
      return { success: true, commitHash: "" };
    }

    // Commit
    execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
      cwd: gitRoot,
      stdio: "pipe",
    });

    // Get commit hash
    const hash = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf-8" }).trim();
    const shortHash = hash.slice(0, 7);

    taskLog(taskId, "COMMITTED", `Changes committed`, { commit: shortHash, fullHash: hash });
    return { success: true, commitHash: hash };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    taskLog(taskId, "FAILED", `Commit failed: ${error}`);
    return { success: false, error };
  }
}

/**
 * Get current branch name
 */
export function getCurrentBranch(cwd?: string): string | null {
  try {
    const workDir = cwd || process.cwd();
    const gitRoot = getGitRoot(workDir);
    if (!gitRoot) return null;

    return execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: gitRoot,
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Get status of working directory
 */
export function getGitStatus(cwd?: string): { modified: string[]; untracked: string[] } | null {
  try {
    const workDir = cwd || process.cwd();
    const gitRoot = getGitRoot(workDir);
    if (!gitRoot) return null;

    const status = execSync("git status --porcelain", { cwd: gitRoot, encoding: "utf-8" });

    const modified: string[] = [];
    const untracked: string[] = [];

    for (const line of status.split("\n")) {
      if (!line.trim()) continue;
      const statusCode = line.slice(0, 2);
      const filePath = line.slice(3);

      if (statusCode.includes("M") || statusCode.includes("D")) {
        if (!isForbiddenPath(filePath)) {
          modified.push(filePath);
        }
      }
      if (statusCode === "??") {
        if (!isForbiddenPath(filePath)) {
          untracked.push(filePath);
        }
      }
    }

    return { modified, untracked };
  } catch {
    return null;
  }
}

/**
 * Checkout a branch
 */
export function checkoutBranch(
  taskId: string,
  branchName: string,
  cwd?: string,
): { success: boolean; error?: string } {
  taskLog(taskId, "BRANCH", `Checking out branch: ${branchName}`);

  try {
    const workDir = cwd || process.cwd();
    const gitRoot = getGitRoot(workDir);

    if (!gitRoot) {
      const error = "Not a git repository";
      return { success: false, error };
    }

    execSync(`git checkout ${branchName}`, { cwd: gitRoot, stdio: "pipe" });
    taskLog(taskId, "BRANCH", `Checked out: ${branchName}`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    taskLog(taskId, "FAILED", `Checkout failed: ${error}`);
    return { success: false, error };
  }
}

/**
 * Push branch to remote
 */
export function pushBranch(
  taskId: string,
  branchName?: string,
  cwd?: string,
): { success: boolean; error?: string } {
  const branch = branchName || getCurrentBranch(cwd);
  taskLog(taskId, "PUSHED", `Pushing branch: ${branch}`);

  try {
    const workDir = cwd || process.cwd();
    const gitRoot = getGitRoot(workDir);

    if (!gitRoot) {
      return { success: false, error: "Not a git repository" };
    }

    execSync(`git push -u origin ${branch}`, { cwd: gitRoot, stdio: "pipe" });
    taskLog(taskId, "PUSHED", `Branch pushed: ${branch}`);
    return { success: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    taskLog(taskId, "FAILED", `Push failed: ${error}`);
    return { success: false, error };
  }
}
