/**
 * Session Capture Hook
 *
 * Captures session messages and stores to PostgreSQL for long-term memory.
 * Redis sync is handled by initRedisTranscriptSync (memory/redis-transcript-sync.ts).
 */

import { randomUUID } from "node:crypto";
import type { HookHandler, InternalHookEvent } from "../../hooks.js";
import { loadConfig } from "../../../config/config.js";

/**
 * Store conversation to PostgreSQL
 */
async function storeConversationToPostgreSQL(
  content: string,
  sessionId: string,
  source: string = "session-capture",
): Promise<void> {
  const { execSync } = await import("child_process");
  const psqlPath = "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql";
  const id = randomUUID();
  const metadata = JSON.stringify({ sessionId }).replace(/'/g, "''");

  try {
    execSync(
      `${psqlPath} -U tars -d openclaw_memory -h localhost -p 5432 -c "INSERT INTO memories (id, content, metadata, source, importance, tags, created_at) VALUES ('${id}', E'${content.replace(/'/g, "''")}', '${metadata}'::jsonb, '${source}', 20, ARRAY['session-capture'], NOW())"`,
      { encoding: "utf-8" },
    );
    console.log("[session-capture] Stored conversation to PostgreSQL:", id);
  } catch (err) {
    console.error("[session-capture] PostgreSQL store error:", err);
  }
}

const captureSessionMessage: HookHandler = async (event: InternalHookEvent): Promise<void> => {
  // Run on any session event to track activity
  console.log("[session-capture] Event received:", event.type, event.action);

  // Check deployment mode
  const cfg = loadConfig();
  const memorySearch = cfg.agents?.defaults?.memorySearch as Record<string, unknown> | undefined;
  const deployment = memorySearch?.deployment as string | undefined;

  if (deployment !== "full") {
    console.log("[session-capture] Not in full mode, skipping");
    return;
  }

  // Extract session info from context
  const context = event.context || {};
  const sessionId = (context.sessionId as string) || "unknown";
  const sessionKey = event.sessionKey || "unknown";

  // Store a simple indicator that the session was active
  // In a full implementation, we'd extract recent messages from Redis
  const content = `Session active: ${sessionKey} (${sessionId}), event: ${event.type}:${event.action || "none"}`;

  await storeConversationToPostgreSQL(content, sessionId, "session-capture");
};

export default captureSessionMessage;
