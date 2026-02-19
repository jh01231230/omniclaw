/**
 * Secure storage for sudo/root password used when tools.sudo.mode is consent or always.
 * Stored under ~/.omniclaw/credentials/sudo.json with restrictive permissions (0o600).
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveOAuthDir, resolveStateDir } from "../config/paths.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("infra/sudo-credentials");

const SUDO_CREDENTIALS_FILENAME = "sudo.json";

export type SudoMode = "never" | "consent" | "always";

export type SudoCredentialsStore = {
  version: 1;
  mode: SudoMode;
  /** Password stored only when mode is consent or always. Never logged. */
  password?: string;
  updatedAt?: string;
};

function resolveSudoCredentialsPath(env?: NodeJS.ProcessEnv): string {
  const stateDir = resolveStateDir(env ?? process.env, os.homedir);
  const oauthDir = resolveOAuthDir(env ?? process.env, stateDir);
  return path.join(oauthDir, SUDO_CREDENTIALS_FILENAME);
}

export function hasSudoCredentials(env?: NodeJS.ProcessEnv): boolean {
  try {
    const p = resolveSudoCredentialsPath(env);
    if (!fs.existsSync(p)) {
      return false;
    }
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw) as SudoCredentialsStore;
    return (data.mode === "consent" || data.mode === "always") && Boolean(data.password?.trim());
  } catch {
    return false;
  }
}

/**
 * Read stored sudo password. Returns undefined if not stored or mode is never.
 * Caller must ensure tools.sudo.mode allows use before calling.
 */
export function readSudoPassword(env?: NodeJS.ProcessEnv): string | undefined {
  try {
    const p = resolveSudoCredentialsPath(env);
    if (!fs.existsSync(p)) {
      return undefined;
    }
    const raw = fs.readFileSync(p, "utf8");
    const data = JSON.parse(raw) as SudoCredentialsStore;
    if (data.mode === "never" || !data.password?.trim()) {
      return undefined;
    }
    return data.password;
  } catch (err) {
    log.debug("read sudo credentials failed", { err: String(err) });
    return undefined;
  }
}

/**
 * Write sudo credentials. Ensures credentials directory exists and file has 0o600.
 */
export function writeSudoCredentials(
  params: { mode: SudoMode; password?: string },
  env?: NodeJS.ProcessEnv,
): void {
  const p = resolveSudoCredentialsPath(env);
  const dir = path.dirname(p);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const store: SudoCredentialsStore = {
    version: 1,
    mode: params.mode,
    password: params.mode === "never" ? undefined : (params.password ?? "").trim() || undefined,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(p, JSON.stringify(store, null, 0), { mode: 0o600 });
}

/**
 * Clear stored sudo password (set mode to never and remove password).
 */
export function clearSudoCredentials(env?: NodeJS.ProcessEnv): void {
  writeSudoCredentials({ mode: "never" }, env);
}
