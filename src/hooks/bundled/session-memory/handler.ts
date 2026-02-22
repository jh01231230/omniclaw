/**
 * Session memory hook handler
 *
 * Saves session context to memory when /new command is triggered
 * Full mode (PostgreSQL): stores to database only
 * Minimal mode (SQLite): writes to memory files
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { OmniClawConfig } from "../../../config/config.js";
import type { HookHandler } from "../../hooks.js";
import { resolveAgentWorkspaceDir } from "../../../agents/agent-scope.js";
import { resolveAgentIdFromSessionKey } from "../../../routing/session-key.js";
import { resolveHookConfig } from "../../config.js";

/**
 * Get memory deployment mode from config
 */
function getMemoryMode(cfg: OmniClawConfig | undefined): "minimal" | "full" {
  if (!cfg?.agents?.defaults?.memorySearch) {
    return "minimal";
  }
  const mem = cfg.agents.defaults.memorySearch as Record<string, unknown>;
  return (mem.deployment as "minimal" | "full") || "minimal";
}

/**
 * PostgreSQL helper for storing memories (full mode)
 */
async function storeToPostgreSQL(
  content: string,
  source: string,
  importance: number = 50,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { execSync } = await import("child_process");
  const psqlPath = "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql";
  const id = randomUUID();
  const metadataStr = JSON.stringify(metadata).replace(/'/g, "''");

  try {
    const tagsStr = "ARRAY['session-memory']";
    execSync(
      `${psqlPath} -U tars -d openclaw_memory -h localhost -p 5432 -c "INSERT INTO memories (id, content, metadata, source, importance, tags, created_at) VALUES ('${id}', E'${content.replace(/'/g, "''")}', '${metadataStr}'::jsonb, '${source}', ${importance}, ${tagsStr}, NOW())"`,
      { encoding: "utf-8" }
    );
    console.log("[session-memory] Stored to PostgreSQL:", id);
  } catch (err) {
    console.error("[session-memory] PostgreSQL store error:", err);
  }
}

/**
 * Read recent messages from session file for slug generation
 */
async function getRecentSessionContent(
  sessionFilePath: string,
  messageCount: number = 15,
): Promise<string | null> {
  try {
    const content = await fs.readFile(sessionFilePath, "utf-8");
    const lines = content.trim().split("\n");

    // Parse JSONL and extract user/assistant messages first
    const allMessages: string[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        // Session files have entries with type="message" containing a nested message object
        if (entry.type === "message" && entry.message) {
          const msg = entry.message;
          const role = msg.role;
          if ((role === "user" || role === "assistant") && msg.content) {
            // Extract text content
            const text = Array.isArray(msg.content)
              ? // oxlint-disable-next-line typescript/no-explicit-any
                msg.content.find((c: any) => c.type === "text")?.text
              : msg.content;
            if (text && !text.startsWith("/")) {
              allMessages.push(`${role}: ${text}`);
            }
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    // Then slice to get exactly messageCount messages
    const recentMessages = allMessages.slice(-messageCount);
    return recentMessages.join("\n");
  } catch {
    return null;
  }
}

/**
 * Save session context to memory when /new command is triggered
 */
const saveSessionToMemory: HookHandler = async (event) => {
  // Only trigger on 'new' command
  if (event.type !== "command" || event.action !== "new") {
    return;
  }

  try {
    console.log("[session-memory] Hook triggered for /new command");

    const context = event.context || {};
    const cfg = context.cfg as OmniClawConfig | undefined;
    const agentId = resolveAgentIdFromSessionKey(event.sessionKey);
    const workspaceDir = cfg
      ? resolveAgentWorkspaceDir(cfg, agentId)
      : path.join(os.homedir(), ".omniclaw", "workspace");
    const memoryDir = path.join(workspaceDir, "memory");
    await fs.mkdir(memoryDir, { recursive: true });

    // Get today's date for filename
    const now = new Date(event.timestamp);
    const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD

    // Generate descriptive slug from session using LLM
    const sessionEntry = (context.previousSessionEntry || context.sessionEntry || {}) as Record<
      string,
      unknown
    >;
    const currentSessionId = sessionEntry.sessionId as string;
    const currentSessionFile = sessionEntry.sessionFile as string;

    console.log("[session-memory] Current sessionId:", currentSessionId);
    console.log("[session-memory] Current sessionFile:", currentSessionFile);
    console.log("[session-memory] cfg present:", !!cfg);

    const sessionFile = currentSessionFile || undefined;

    // Read message count from hook config (default: 15)
    const hookConfig = resolveHookConfig(cfg, "session-memory");
    const messageCount =
      typeof hookConfig?.messages === "number" && hookConfig.messages > 0
        ? hookConfig.messages
        : 15;

    let slug: string | null = null;
    let sessionContent: string | null = null;

    if (sessionFile) {
      // Get recent conversation content
      sessionContent = await getRecentSessionContent(sessionFile, messageCount);
      console.log("[session-memory] sessionContent length:", sessionContent?.length || 0);

      if (sessionContent && cfg) {
        console.log("[session-memory] Calling generateSlugViaLLM...");
        // Dynamically import the LLM slug generator (avoids module caching issues)
        // When compiled, handler is at dist/hooks/bundled/session-memory/handler.js
        // Going up ../.. puts us at dist/hooks/, so just add llm-slug-generator.js
        const openclawRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
        const slugGenPath = path.join(openclawRoot, "llm-slug-generator.js");
        const { generateSlugViaLLM } = await import(slugGenPath);

        // Use LLM to generate a descriptive slug
        slug = await generateSlugViaLLM({ sessionContent, cfg });
        console.log("[session-memory] Generated slug:", slug);
      }
    }

    // If no slug, use timestamp
    if (!slug) {
      const timeSlug = now.toISOString().split("T")[1].split(".")[0].replace(/:/g, "");
      slug = timeSlug.slice(0, 4); // HHMM
      console.log("[session-memory] Using fallback timestamp slug:", slug);
    }

    // Create filename with date and slug
    const filename = `${dateStr}-${slug}.md`;
    const memoryFilePath = path.join(memoryDir, filename);
    console.log("[session-memory] Generated filename:", filename);
    console.log("[session-memory] Full path:", memoryFilePath);

    // Format time as HH:MM:SS UTC
    const timeStr = now.toISOString().split("T")[1].split(".")[0];

    // Extract context details
    const sessionId = (sessionEntry.sessionId as string) || "unknown";
    const source = (context.commandSource as string) || "unknown";

    // Build Markdown entry
    const entryParts = [
      `# Session: ${dateStr} ${timeStr} UTC`,
      "",
      `- **Session Key**: ${event.sessionKey}`,
      `- **Session ID**: ${sessionId}`,
      `- **Source**: ${source}`,
      "",
    ];

    // Include conversation content if available
    if (sessionContent) {
      entryParts.push("## Conversation Summary", "", sessionContent, "");
    }

    const entry = entryParts.join("\n");

    // Get memory deployment mode
    const memoryMode = getMemoryMode(cfg);

    if (memoryMode === "full") {
      // Full mode: store to PostgreSQL only (no file writes)
      const metadata = {
        sessionKey: event.sessionKey,
        sessionId,
        source,
        date: dateStr,
        slug,
      };
      await storeToPostgreSQL(entry, `session-memory/${slug || dateStr}`, 50, metadata);
      console.log("[session-memory] Session stored to PostgreSQL (full mode)");
    } else {
      // Minimal mode: write to file
      await fs.mkdir(memoryDir, { recursive: true });
      await fs.writeFile(memoryFilePath, entry, "utf-8");
      console.log("[session-memory] Memory file written successfully (minimal mode)");
      const relPath = memoryFilePath.replace(os.homedir(), "~");
      console.log(`[session-memory] Session context saved to ${relPath}`);
    }
  } catch (err) {
    console.error(
      "[session-memory] Failed to save session memory:",
      err instanceof Error ? err.message : String(err),
    );
  }
};

export default saveSessionToMemory;
