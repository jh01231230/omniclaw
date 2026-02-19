/**
 * Run a command with optional sudo fallback when permission denied.
 * Used when tools.sudo.mode allows and a password is stored.
 */

import { spawn } from "node:child_process";
import { runExec } from "../process/exec.js";

function isPermissionDeniedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const str = msg.toLowerCase();
  return (
    str.includes("permission denied") ||
    str.includes("eacces") ||
    str.includes("eperm") ||
    str.includes("operation not permitted") ||
    str.includes("requires sudo") ||
    str.includes("need sudo") ||
    str.includes("password") ||
    str.includes("sudo")
  );
}

/**
 * Run command; on permission denied, retry with sudo -S when password is provided.
 * Returns the first successful result. Throws the original error if sudo retry fails.
 */
export async function runWithSudoFallback(
  bin: string,
  args: string[],
  opts: { timeoutMs?: number; maxBuffer?: number; getPassword?: () => string | undefined },
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await runExec(bin, args, opts);
  } catch (err) {
    if (!isPermissionDeniedError(err) || !opts.getPassword) {
      throw err;
    }
    const password = opts.getPassword();
    if (!password?.trim()) {
      throw err;
    }
    // Retry with: echo pass | sudo -S bin args
    return await new Promise((resolve, reject) => {
      const sudoArgs = ["-S", bin, ...args];
      const child = spawn("sudo", sudoArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env,
      });
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => {
        stdout += d.toString();
      });
      child.stderr?.on("data", (d) => {
        stderr += d.toString();
      });
      if (child.stdin) {
        child.stdin.write(password + "\n");
        child.stdin.end();
      }
      const timer = opts.timeoutMs
        ? setTimeout(() => {
            child.kill("SIGKILL");
          }, opts.timeoutMs)
        : undefined;
      child.on("close", (code) => {
        if (timer) {
          clearTimeout(timer);
        }
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(stderr || stdout || `sudo exited ${code}`));
        }
      });
      child.on("error", (e) => {
        if (timer) {
          clearTimeout(timer);
        }
        reject(e);
      });
    });
  }
}
