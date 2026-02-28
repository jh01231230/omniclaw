/**
 * Intent Tracking Integration for SafeClaw
 * Calls Python intent detection and injects results into conversation context
 */

import { exec } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, "skills/intent_tracker/safeclaw_integration.py");

export interface IntentResult {
  action: string;
  message: string | null;
}

export async function detectIntent(text: string): Promise<IntentResult> {
  try {
    const { stdout } = await execAsync(
      `python3 "${SCRIPT_PATH}" process -t "${text.replace(/"/g, '\\"')}"`,
      { timeout: 5000 },
    );

    const output = stdout.trim();
    if (output) {
      return {
        action: "follow_up",
        message: output,
      };
    }

    return {
      action: "none",
      message: null,
    };
  } catch (err) {
    console.error("Intent detection error:", err);
    return {
      action: "none",
      message: null,
    };
  }
}

export async function getIntentStatus(): Promise<string> {
  try {
    const { stdout } = await execAsync(`python3 "${SCRIPT_PATH}" status`, { timeout: 5000 });
    return stdout.trim();
  } catch {
    return "Intent tracking unavailable";
  }
}

/**
 * Check if a message is a casual greeting that could trigger follow-up
 */
export function isCasualMessage(text: string): boolean {
  const casualPatterns = [
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

  return casualPatterns.some((pattern) => pattern.test(text.trim().toLowerCase()));
}

/**
 * Process message and return follow-up if appropriate
 */
export async function maybeGenerateFollowUp(
  message: string,
  isUserMessage: boolean = true,
): Promise<string | null> {
  if (!isUserMessage) {
    return null;
  }

  // Only trigger on casual messages
  if (!isCasualMessage(message)) {
    return null;
  }

  const result = await detectIntent(message);
  return result.message;
}
