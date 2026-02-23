/**
 * Session Capture Hook
 * 
 * Captures conversation messages in real-time and stores them to Redis
 * for short-term storage. Sessions are later archived to PostgreSQL
 * for long-term memory.
 */

import type { HookHandler, HookEvent } from "../../hooks.js";
import { getRedisSessionStore, type SessionMessage } from "../../../memory/redis-session-store.js";
import type { OmniClawConfig } from "../../../config/config.js";

interface SessionCaptureConfig {
  enabled?: boolean;
  redis?: {
    host?: string;
    port?: number;
    db?: number;
    sessionPrefix?: string;
  };
}

/**
 * Get session capture config from OmniClaw config
 */
function getSessionCaptureConfig(cfg: OmniClawConfig | undefined): SessionCaptureConfig {
  const defaults: SessionCaptureConfig = {
    enabled: true,
    redis: {
      host: "localhost",
      port: 6379,
      db: 0,
      sessionPrefix: "session:",
    },
  };

  if (!cfg) {
    return defaults;
  }

  // Try to get from memorySearch config
  const memSearch = cfg.agents?.defaults?.memorySearch as Record<string, unknown>;
  if (memSearch?.redis) {
    return {
      enabled: true,
      redis: {
        ...defaults.redis,
        ...(memSearch.redis as Record<string, unknown>),
      },
    };
  }

  return defaults;
}

/**
 * Extract text content from a message
 */
function extractTextContent(content: unknown): string {
  if (!content) {
    return "";
  }

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((c) => typeof c === "object" && c !== null && "type" in c)
      .filter((c) => (c as { type: string }).type === "text")
      .map((c) => (c as { text?: string }).text || "")
      .join("");
  }

  if (typeof content === "object" && "text" in content) {
    return String((content as { text: unknown }).text);
  }

  return String(content);
}

/**
 * Session capture handler - stores messages to Redis in real-time
 */
const captureSessionMessage: HookHandler = async (event: HookEvent): Promise<void> => {
  // Only capture message events
  if (event.type !== "message") {
    return;
  }

  try {
    const context = event.context || {};
    const cfg = context.cfg as OmniClawConfig | undefined;
    
    const sessionCaptureConfig = getSessionCaptureConfig(cfg);
    
    if (!sessionCaptureConfig.enabled) {
      return;
    }

    const sessionKey = event.sessionKey;
    if (!sessionKey) {
      console.log("[session-capture] No session key, skipping");
      return;
    }

    // Get message data from event
    const messageData = event.message as Record<string, unknown> | undefined;
    if (!messageData) {
      return;
    }

    const role = messageData.role as string;
    if (role !== "user" && role !== "assistant") {
      return;
    }

    const content = extractTextContent(messageData.content);
    if (!content || content.trim() === "") {
      return;
    }

    // Get channel info
    const channel = (context.channel as string) || "unknown";

    // Create session message
    const sessionMessage: Omit<SessionMessage, "id"> = {
      role: role as "user" | "assistant",
      content: content.substring(0, 10000), // Limit content length
      timestamp: new Date(event.timestamp).toISOString(),
      channel,
    };

    // Store to Redis
    const redisStore = getRedisSessionStore(sessionCaptureConfig.redis);
    await redisStore.addMessage(sessionKey, sessionMessage);

    console.log(`[session-capture] Stored ${role} message to session: ${sessionKey.substring(0, 20)}...`);
  } catch (err) {
    console.error("[session-capture] Error capturing message:", err);
  }
};

export default captureSessionMessage;
