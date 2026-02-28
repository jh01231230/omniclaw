import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HookHandler, InternalHookEvent } from "../../hooks.js";
import { loadConfig } from "../../../config/config.js";
import { resolveStateDir } from "../../../config/paths.js";
import { resolveUserPath } from "../../../utils.js";
import { resolveHookConfig } from "../../config.js";
import {
  buildSessionCompression,
  parseSessionJsonlMessages,
} from "../memory-extract/compression.js";
import {
  buildReconstructableSummaryRecord,
  buildSessionKeyframeBundle,
  renderReconstructableSummaryPreview,
} from "../memory-extract/keyframe.js";

/**
 * Store summary to PostgreSQL
 */
async function storeSummaryToPostgreSQL(
  content: string,
  metadata: Record<string, unknown>,
  source: string = "periodic-summary",
): Promise<void> {
  const { execSync } = await import("child_process");
  const psqlPath = "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql";
  const id = randomUUID();
  const metadataStr = JSON.stringify(metadata).replace(/'/g, "''");

  try {
    execSync(
      `${psqlPath} -U tars -d openclaw_memory -h localhost -p 5432 -c "INSERT INTO memories (id, content, metadata, source, importance, tags, created_at) VALUES ('${id}', E'${content.replace(/'/g, "''")}', '${metadataStr}'::jsonb, '${source}', 30, ARRAY['periodic-summary', 'reconstructable', 'auto-generated'], NOW())"`,
      { encoding: "utf-8" },
    );
    console.log("[periodic-summary] Stored to PostgreSQL:", id);
  } catch (err) {
    console.error("[periodic-summary] PostgreSQL store error:", err);
  }
}

/**
 * Periodic Memory Summarization Hook
 * Summarizes recent conversations and saves to memory
 */

const SUMMARY_PROMPT = `Summarize recent conversations with reconstruction in mind:
1. Keep the core narrative and decisions
2. Preserve concrete details (names, product terms, numbers, error signatures)
3. Keep key questions (including "?" tone signals)
4. Capture specific suggestions, follow-ups, and timing details

Format as concise bullet points plus detail anchors.`;

type PeriodicSummaryConfig = {
  enabled?: boolean;
  outputPath?: string;
  prompt?: string;
  maxSessions?: number;
  maxMessagesPerSession?: number;
  maxMemoriesPerSession?: number;
  minImportance?: number;
};

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : fallback;
}

function asImportanceThreshold(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function firstDefined(...values: unknown[]): unknown {
  return values.find((value) => value !== undefined && value !== null);
}

const summarizeConversations: HookHandler = async (event: InternalHookEvent) => {
  const eventType = event.type as string;
  // Accept cron:hourly, cron:daily, or any cron-* event, plus heartbeat
  const isCronEvent = eventType === "cron" || eventType.startsWith("cron:");
  if (!isCronEvent && eventType !== "heartbeat") {
    return;
  }

  // Load config
  const cfg = loadConfig();
  const memorySearch = cfg.agents?.defaults?.memorySearch as Record<string, unknown> | undefined;

  // Check if periodicSummary is enabled
  const summaryConfigRaw = memorySearch?.periodicSummary as Record<string, unknown> | undefined;
  const hookConfig = resolveHookConfig(cfg, "periodic-summary") as
    | PeriodicSummaryConfig
    | undefined;
  const summaryConfig =
    summaryConfigRaw && typeof summaryConfigRaw === "object" ? summaryConfigRaw : undefined;

  const enabledFromSummary = summaryConfig?.enabled;
  const enabledFromHook = hookConfig?.enabled;
  const enabled =
    typeof enabledFromHook === "boolean"
      ? enabledFromHook
      : typeof enabledFromSummary === "boolean"
        ? enabledFromSummary
        : false;
  if (!enabled) {
    return;
  }

  const maxSessions = asPositiveInt(
    firstDefined(hookConfig?.maxSessions, summaryConfig?.maxSessions),
    5,
  );
  const maxMessagesPerSession = asPositiveInt(
    firstDefined(hookConfig?.maxMessagesPerSession, summaryConfig?.maxMessagesPerSession),
    80,
  );
  const maxMemoriesPerSession = asPositiveInt(
    firstDefined(hookConfig?.maxMemoriesPerSession, summaryConfig?.maxMemoriesPerSession),
    8,
  );
  const minImportance = asImportanceThreshold(
    firstDefined(hookConfig?.minImportance, summaryConfig?.minImportance),
    0.55,
  );

  console.log("[periodic-summary] Running periodic summarization...");

  try {
    // Get sessions directory
    const stateDir = resolveStateDir(process.env, os.homedir);
    const agentId = "main";
    const sessionsDir = path.join(stateDir, "agents", agentId, "sessions");

    // List recent session files
    const files = await fs.readdir(sessionsDir);
    const jsonlFiles = files
      .filter((f) => f.endsWith(".jsonl") && !f.endsWith(".lock"))
      .toSorted()
      .toReversed()
      .slice(0, maxSessions);

    if (jsonlFiles.length === 0) {
      console.log("[periodic-summary] No sessions found");
      return;
    }

    const sessionBundles: ReturnType<typeof buildSessionKeyframeBundle>[] = [];
    for (const file of jsonlFiles) {
      const filePath = path.join(sessionsDir, file);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const messages = parseSessionJsonlMessages(content).slice(-maxMessagesPerSession);
        if (messages.length === 0) {
          continue;
        }
        const compression = buildSessionCompression(messages, {
          maxMemories: maxMemoriesPerSession,
          minImportance,
          maxKeywords: 24,
        });
        if (compression.keyframes.length === 0) {
          continue;
        }
        sessionBundles.push(buildSessionKeyframeBundle(file, compression));
      } catch {
        // Skip files that can't be read
      }
    }

    if (sessionBundles.length === 0) {
      console.log("[periodic-summary] No usable session messages found");
      return;
    }

    const outputPathRaw = asNonEmptyString(
      firstDefined(hookConfig?.outputPath, summaryConfig?.outputPath),
    );
    const outputPath = outputPathRaw
      ? resolveUserPath(outputPathRaw)
      : path.join(stateDir, "memory", "periodic-summary.jsonl");
    const prompt =
      asNonEmptyString(firstDefined(hookConfig?.prompt, summaryConfig?.prompt)) || SUMMARY_PROMPT;

    const summaryRecord = buildReconstructableSummaryRecord({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      prompt,
      sessions: sessionBundles,
    });

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.appendFile(outputPath, `${JSON.stringify(summaryRecord)}\n`, "utf-8");

    console.log(
      `[periodic-summary] Reconstructable summary saved to ${outputPath} (sessions=${summaryRecord.sessions.length})`,
    );

    // Store to PostgreSQL in full mode, or if explicitly configured
    const memoryCfg = memorySearch as
      | { deployment?: string; store?: { driver?: string } }
      | undefined;
    const deployment = memoryCfg?.deployment;
    const storeDriver = memoryCfg?.store?.driver;

    if (deployment === "full" || storeDriver === "postgresql") {
      await storeSummaryToPostgreSQL(
        renderReconstructableSummaryPreview(summaryRecord),
        {
          summaryId: summaryRecord.id,
          schema: summaryRecord.schema,
          sessions: summaryRecord.sessions.length,
          keyframes: summaryRecord.sessions.reduce(
            (count, session) => count + session.keyframes.length,
            0,
          ),
          outputPath,
        },
        "periodic-summary",
      );
    }
  } catch (err) {
    console.error("[periodic-summary] Error:", err);
  }
};

export default summarizeConversations;
