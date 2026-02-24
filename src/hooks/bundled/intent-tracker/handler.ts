/**
 * Intent Tracker Hook Handler
 * Automatically detects user intents and generates follow-ups
 */

import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { HookHandler } from "../../hooks.js";

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(
  __dirname,
  "..",
  "..",
  "skills",
  "intent_tracker",
  "safeclaw_integration.py",
);

/**
 * Casual message patterns that trigger follow-up
 */
const CASUAL_PATTERNS = [
  /^你好/,
  /^在吗/,
  /^忙吗/,
  /^最近/,
  /^今天/,
  /^天气/,
  /^哈啰?/,
  /^hi/,
  /^hello/,
  /^hey/,
];

function isCasualMessage(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  return CASUAL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

async function detectIntent(text: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `python3 "${SCRIPT_PATH}" process -t "${text.replace(/"/g, '\\"')}"`,
      { timeout: 5000 },
    );

    return stdout.trim() || null;
  } catch {
    return null;
  }
}

const intentTrackerHandler: HookHandler = async (event) => {
  // Only process command events
  if (event.type !== "command") {
    return;
  }

  // Extract message from context
  const ctx = event.context as Record<string, unknown>;
  const message = ctx.message as string | undefined;
  const isUser = ctx.isUser as boolean | undefined;

  // Only process user messages
  if (!message || !isUser) {
    return;
  }

  // Check if casual message that might need follow-up
  if (isCasualMessage(message)) {
    const followUp = await detectIntent(message);

    if (followUp) {
      // Add follow-up message to be sent
      event.messages.push(followUp);
    }
  }
};

export default intentTrackerHandler;
