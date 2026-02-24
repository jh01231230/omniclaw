/**
 * Redis transcript sync - mirrors session transcript files to Redis in real-time.
 *
 * Subscribes to onSessionTranscriptUpdate (same signal as memory manager) and syncs
 * each transcript update to Redis. Redis keys mirror the session file structure:
 * session:{sessionKey} stores messages in the same order as session transcript JSONL files
 */

import fs from "node:fs";
import path from "node:path";
import type { OmniClawConfig } from "../config/config.js";
import type { SessionEntry } from "../config/sessions/types.js";
import { resolveStateDir } from "../config/paths.js";
import { loadSessionStore, resolveSessionTranscriptPath } from "../config/sessions.js";
import { onSessionTranscriptUpdate } from "../sessions/transcript-events.js";
import {
  getRedisSessionStore,
  type RedisSessionStore,
  type SessionMessage,
} from "./redis-session-store.js";

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
  const internal = cfg?.hooks?.internal;
  const sessionCapture = internal?.sessionCapture ?? { enabled: true };
  const entryOverride = internal?.entries?.["session-capture"];
  const enabled = entryOverride?.enabled !== false && sessionCapture.enabled !== false;
  const memSearch = cfg?.agents?.defaults?.memorySearch as Record<string, unknown> | undefined;
  const redis = sessionCapture.redis ?? memSearch?.redis;
  return {
    enabled,
    redis: redis as SessionCaptureConfig["redis"],
  };
}

/**
 * Derive agentId from transcript file path.
 * Path format: .../agents/<agentId>/sessions/<sessionId>.jsonl
 */
function agentIdFromTranscriptPath(sessionFile: string): string | undefined {
  const stateDir = resolveStateDir();
  const rel = path.relative(stateDir, sessionFile);
  const parts = rel.split(path.sep);
  const agentsIdx = parts.indexOf("agents");
  if (agentsIdx >= 0 && parts.length > agentsIdx + 1) {
    return parts[agentsIdx + 1];
  }
  return undefined;
}

/**
 * Find sessionKey for a transcript file by scanning the session store.
 */
function findSessionKeyByTranscriptFile(sessionFile: string): string | null {
  const sessionsDir = path.dirname(sessionFile);
  const storePath = path.join(sessionsDir, "sessions.json");
  if (!fs.existsSync(storePath)) {
    return null;
  }
  const agentId = agentIdFromTranscriptPath(sessionFile);
  const store = loadSessionStore(storePath, { skipCache: true });
  const normalizedFile = path.normalize(sessionFile);

  for (const [sessionKey, entry] of Object.entries(store)) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as SessionEntry;
    const expectedPath =
      e.sessionFile?.trim() || resolveSessionTranscriptPath(e.sessionId ?? "", agentId);
    if (path.normalize(expectedPath) === normalizedFile) {
      return sessionKey;
    }
  }
  return null;
}

function extractTextFromContent(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c: unknown) => {
        if (typeof c === "string") return c;
        if (typeof c === "object" && c !== null) {
          const o = c as Record<string, unknown>;
          return (o.text as string) || (o.thinking as string) || "";
        }
        return "";
      })
      .join("");
  }
  return String(content);
}

/**
 * Parse transcript JSONL file into SessionMessage array (user/assistant only).
 */
function parseTranscriptFile(sessionFile: string): SessionMessage[] {
  if (!fs.existsSync(sessionFile)) return [];

  const lines = fs.readFileSync(sessionFile, "utf-8").split(/\r?\n/);
  const messages: SessionMessage[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as {
        type?: string;
        message?: { role?: string; content?: unknown };
        id?: string;
        timestamp?: string;
      };
      if (parsed?.type !== "message" || !parsed.message) continue;

      const msg = parsed.message;
      const role = msg.role;
      if (role !== "user" && role !== "assistant") continue;

      const content = extractTextFromContent(msg.content);
      if (!content.trim()) continue;

      messages.push({
        id: parsed.id ?? `msg-${messages.length}`,
        role,
        content: content.substring(0, 10000),
        timestamp: parsed.timestamp ?? new Date().toISOString(),
      });
    } catch {
      // skip malformed lines
    }
  }
  return messages;
}

/**
 * Replace all messages for a session in Redis with the content from the transcript file.
 */
async function syncTranscriptToRedis(
  redis: RedisSessionStore,
  sessionKey: string,
  messages: SessionMessage[],
): Promise<void> {
  await redis.deleteSession(sessionKey);
  for (const msg of messages) {
    const { id: _id, ...rest } = msg;
    await redis.addMessage(sessionKey, rest);
  }
}

let unsubscribe: (() => void) | null = null;

/**
 * Initialize Redis transcript sync. Subscribes to transcript updates and mirrors
 * each update to Redis. Call once at gateway startup when session-capture is enabled.
 */
export function initRedisTranscriptSync(cfg: OmniClawConfig): () => void {
  const sessionCaptureConfig = getSessionCaptureConfig(cfg);
  if (!sessionCaptureConfig.enabled) {
    return () => {};
  }

  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }

  const redis = getRedisSessionStore(sessionCaptureConfig.redis);

  unsubscribe = onSessionTranscriptUpdate((update) => {
    const sessionFile = update.sessionFile?.trim();
    if (!sessionFile || !sessionFile.endsWith(".jsonl")) return;

    const sessionKey = findSessionKeyByTranscriptFile(sessionFile);
    if (!sessionKey) return;

    const messages = parseTranscriptFile(sessionFile);
    if (messages.length === 0) return;

    void syncTranscriptToRedis(redis, sessionKey, messages).catch((err) => {
      console.error("[redis-transcript-sync] Failed to sync:", err);
    });
  });

  return () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
}
