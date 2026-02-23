/**
 * Session Capture Hook
 *
 * Captures conversation messages in real-time and stores them to Redis
 * for short-term storage. Sessions are later archived to PostgreSQL
 * for long-term memory.
 */

import * as fs from "fs";
import * as path from "path";
import type { OmniClawConfig } from "../../../config/config.js";
import type { HookHandler, HookEvent } from "../../hooks.js";
import { getRedisSessionStore, type SessionMessage } from "../../../memory/redis-session-store.js";

interface SessionCaptureConfig {
  enabled?: boolean;
  redis?: {
    host?: string;
    port?: number;
    db?: number;
    sessionPrefix?: string;
  };
}

function getSessionCaptureConfig(cfg: OmniClawConfig | undefined): SessionCaptureConfig {
  const sessionCapture = cfg?.hooks?.internal?.sessionCapture ?? { enabled: true };
  
  // Also check for Redis config in memorySearch
  const memSearch = cfg?.agents?.defaults?.memorySearch as Record<string, unknown> | undefined;
  if (memSearch?.redis && !sessionCapture.redis) {
    return {
      ...sessionCapture,
      redis: memSearch.redis as SessionCaptureConfig["redis"],
    };
  }
  
  return sessionCapture;
}

/**
 * Read session history from JSONL file and parse messages
 */
async function readSessionHistory(sessionKey: string): Promise<SessionMessage[]> {
  const sessionsDir = path.join(process.env.HOME || "/home/tars", ".omniclaw/agents/main/sessions");
  const sessionFile = path.join(sessionsDir, `${sessionKey}.jsonl`);
  
  try {
    if (!fs.existsSync(sessionFile)) {
      return [];
    }
    
    const content = fs.readFileSync(sessionFile, "utf-8");
    const lines = content.split("\n").filter(line => line.trim());
    
    const messages: SessionMessage[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.message?.role && entry.message?.content) {
          const content = extractContent(entry.message.content);
          if (content) {
            messages.push({
              id: entry.id || `msg-${messages.length}`,
              role: entry.message.role,
              content: content,
              timestamp: entry.timestamp || new Date().toISOString(),
            });
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
    return messages;
  } catch (err) {
    console.error("[session-capture] Error reading session file:", err);
    return [];
  }
}

/**
 * Extract text content from message content (can be string or array)
 */
function extractContent(content: unknown): string | null {
  if (!content) return null;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: unknown) => {
        if (typeof c === "string") return c;
        if (typeof c === "object" && c !== null) {
          return (c as Record<string, unknown>).text as string || (c as Record<string, unknown>).thinking as string || "";
        }
        return "";
      })
      .join("");
  }
  return null;
}

/**
 * Session capture handler - stores complete conversation to Redis
 * Triggered on "agent" event after response complete (or failed)
 */
const captureSessionMessage: HookHandler = async (event: HookEvent): Promise<void> => {
  // Debug: write to file to verify handler is called
  fs.appendFileSync("/tmp/session-capture-call.log", `${new Date().toISOString()} called, type=${event.type}\n`);
  
  // Only capture agent events (after response complete or failed)
  console.log("[session-capture] Handler called, event type:", event.type);
  if (event.type !== "agent") {
    console.log("[session-capture] Not an agent event, skipping");
    return;
  }

  console.log("[session-capture] Received agent event, sessionKey:", event.sessionKey);

  try {
    const context = event.context || {};
    console.log("[session-capture] Context keys:", Object.keys(context));
    const cfg = context.cfg as OmniClawConfig | undefined;

    const sessionCaptureConfig = getSessionCaptureConfig(cfg);
    console.log("[session-capture] Config enabled:", sessionCaptureConfig.enabled);

    if (!sessionCaptureConfig.enabled) {
      return;
    }

    const sessionKey = event.sessionKey;
    if (!sessionKey) {
      console.log("[session-capture] No session key, skipping");
      return;
    }

    // Read full conversation from JSONL file
    const history = await readSessionHistory(sessionKey);
    if (history.length === 0) {
      console.log("[session-capture] No history found for session:", sessionKey);
      return;
    }

    // Get channel info
    const channel = (context.channel as string) || "unknown";
    const success = context.success as boolean ?? true;

    console.log("[session-capture] Read", history.length, "messages from session file");

    // Store all messages to Redis
    const redisStore = getRedisSessionStore(sessionCaptureConfig.redis);
    
    // Clear existing messages and store fresh (ensures clean state)
    // Note: In production, we might want to append instead
    for (const msg of history) {
      await redisStore.addMessage(sessionKey, {
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        channel,
      });
    }

    console.log(
      `[session-capture] Stored ${history.length} messages to Redis, channel: ${channel}, success: ${success}`,
    );
  } catch (err) {
    console.error("[session-capture] Error capturing session:", err);
  }
};

export default captureSessionMessage;
