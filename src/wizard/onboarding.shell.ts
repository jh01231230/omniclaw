import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeEnv } from "../runtime.js";
import type { WizardPrompter } from "./prompts.js";

type EnsureShellWrapperOptions = {
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  binName: string;
};

function quotePosix(value: string): string {
  // Safe for bash/zsh. Handles embedded single quotes.
  const escaped = value.replaceAll("'", "'\"'\"'");
  return "'" + escaped + "'";
}

function isBashLikeShell(shell: string) {
  return shell === "bash" || shell === "zsh";
}

async function fileExists(filePath: string) {
  return fs
    .access(filePath)
    .then(() => true)
    .catch(() => false);
}

async function findNearestPackageRoot(startDir: string): Promise<string | undefined> {
  let cur = startDir;
  for (let i = 0; i < 25; i++) {
    if (await fileExists(path.join(cur, "package.json"))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      return undefined;
    }
    cur = parent;
  }
  return undefined;
}

async function resolveFromSourceRepoRoot(): Promise<string | undefined> {
  // Prefer the caller's CWD (most common: `pnpm omniclaw onboard` from repo root).
  const cwdRoot = await findNearestPackageRoot(process.cwd());
  if (cwdRoot && (await fileExists(path.join(cwdRoot, ".git")))) {
    return cwdRoot;
  }

  // Fallback: walk up from this module's location (covers `pnpm -C … omniclaw …`).
  const selfDir = path.dirname(fileURLToPath(import.meta.url));
  const selfRoot = await findNearestPackageRoot(selfDir);
  if (selfRoot && (await fileExists(path.join(selfRoot, ".git")))) {
    return selfRoot;
  }

  return undefined;
}

async function ensureLocalBinPathInProfile(profilePath: string): Promise<boolean> {
  const marker = "from-source OmniClaw wrapper";
  const snippet = [
    "# Ensure local user binaries (like from-source OmniClaw wrapper) are on PATH.",
    'if [ -d "$HOME/.local/bin" ]; then',
    '  case ":$PATH:" in',
    '    *":$HOME/.local/bin:"*) ;;',
    '    *) export PATH="$HOME/.local/bin:$PATH" ;;',
    "  esac",
    "fi",
    "",
  ].join("\n");

  const existing = (await fileExists(profilePath)) ? await fs.readFile(profilePath, "utf-8") : "";
  if (
    existing.includes(marker) ||
    existing.includes("$HOME/.local/bin") ||
    existing.includes("${HOME}/.local/bin")
  ) {
    return false;
  }
  const prefix = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  await fs.appendFile(profilePath, `${prefix}\n${snippet}`, "utf-8");
  return true;
}

async function ensureFromSourceWrapper(binName: string, repoRoot: string): Promise<boolean> {
  const home = process.env.HOME || os.homedir();
  const localBinDir = path.join(home, ".local", "bin");
  const wrapperPath = path.join(localBinDir, binName);
  const marker = "From-source launcher for OmniClaw.";

  const desired = [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "",
    "# From-source launcher for OmniClaw.",
    `# Lets you run \`${binName} ...\` from any directory, without needing to \`cd\` into the repo.`,
    "#",
    "# Override the repo location if yours differs:",
    '#   export OMNICLAW_REPO_DIR="/path/to/omniclaw"',
    "",
    `DEFAULT_REPO_DIR=${quotePosix(repoRoot)}`,
    'REPO_DIR="${OMNICLAW_REPO_DIR:-$DEFAULT_REPO_DIR}"',
    "",
    'if [[ ! -f "${REPO_DIR}/package.json" ]]; then',
    '  echo "OmniClaw repo not found at: ${REPO_DIR}" >&2',
    '  echo "Set OMNICLAW_REPO_DIR to your repo path." >&2',
    "  exit 1",
    "fi",
    "",
    "if ! command -v pnpm >/dev/null 2>&1; then",
    '  echo "pnpm is required to run OmniClaw from source. Install pnpm and try again." >&2',
    "  exit 1",
    "fi",
    "",
    `exec pnpm -C "\${REPO_DIR}" --silent ${binName} "$@"`,
    "",
  ].join("\n");

  const existing = (await fileExists(wrapperPath)) ? await fs.readFile(wrapperPath, "utf-8") : "";
  if (existing && !existing.includes(marker)) {
    // Don't clobber a user-managed omniclaw wrapper.
    return false;
  }

  if (existing === desired) {
    return false;
  }

  await fs.mkdir(localBinDir, { recursive: true });
  await fs.writeFile(wrapperPath, desired, { encoding: "utf-8", mode: 0o755 });
  await fs.chmod(wrapperPath, 0o755);
  return true;
}

export async function ensureOnboardingShellWrapper(options: EnsureShellWrapperOptions) {
  if (process.platform === "win32") {
    return;
  }

  const { prompter, runtime, binName } = options;
  const shell = process.env.SHELL?.split("/").pop() || "bash";
  if (!isBashLikeShell(shell)) {
    // Keep scope tight: wrapper is bash; PATH snippet is bash/zsh.
    return;
  }

  const repoRoot = await resolveFromSourceRepoRoot();
  if (!repoRoot) {
    return;
  }

  const home = process.env.HOME || os.homedir();
  const profilePath = shell === "zsh" ? path.join(home, ".zshrc") : path.join(home, ".bashrc");

  let wrapperInstalled = false;
  try {
    wrapperInstalled = await ensureFromSourceWrapper(binName, repoRoot);
  } catch (err) {
    runtime.error(`[omniclaw] Failed to install ${binName} wrapper: ${String(err)}`);
  }

  let pathUpdated = false;
  try {
    pathUpdated = await ensureLocalBinPathInProfile(profilePath);
  } catch (err) {
    runtime.error(`[omniclaw] Failed to update PATH in ${profilePath}: ${String(err)}`);
  }

  if (wrapperInstalled || pathUpdated) {
    await prompter.note(
      [
        wrapperInstalled ? `Installed ${binName} wrapper: ~/.local/bin/${binName}` : undefined,
        pathUpdated ? `Added ~/.local/bin to PATH in: ${profilePath}` : undefined,
        "Restart your shell (or run: source ~/.bashrc) to pick up PATH changes.",
      ]
        .filter(Boolean)
        .join("\n"),
      "Shell",
    );
  }
}
