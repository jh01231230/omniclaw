import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HookHandler, InternalHookEvent } from "../../hooks.js";
import { loadConfig } from "../../../config/config.js";
import { resolveStateDir } from "../../../config/paths.js";
import { resolveUserPath } from "../../../utils.js";
import { resolveHookConfig } from "../../config.js";
import { buildSessionCompression, parseSessionJsonlMessages } from "./compression.js";
import { buildMemoryKeyframeRecord, buildSessionKeyframeBundle } from "./keyframe.js";

type MemoryExtractHookConfig = {
  outputPath?: string;
  maxSessions?: number;
  maxMessagesPerSession?: number;
  maxMemoriesPerSession?: number;
  minImportance?: number;
};

function isSessionEndEvent(event: InternalHookEvent): boolean {
  if (event.type !== "session") {
    return false;
  }
  const withAction = event as unknown as { action?: unknown };
  return withAction.action === "end";
}

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

const extractMemory: HookHandler = async (event: InternalHookEvent) => {
  const eventType = event.type as string;
  // Run on session end or periodic trigger
  if (!isSessionEndEvent(event)) {
    // Also run on heartbeat for periodic extraction
    if (eventType !== "heartbeat") {
      return;
    }
  }

  const cfg = loadConfig();
  const memorySearch = cfg.agents?.defaults?.memorySearch as Record<string, unknown> | undefined;
  const deployment =
    typeof memorySearch?.deployment === "string" ? memorySearch.deployment : undefined;

  // Only run if full deployment
  if (deployment !== "full") {
    return;
  }

  const hookConfig = resolveHookConfig(cfg, "memory-extract") as
    | MemoryExtractHookConfig
    | undefined;
  const maxSessions = asPositiveInt(hookConfig?.maxSessions, 3);
  const maxMessagesPerSession = asPositiveInt(hookConfig?.maxMessagesPerSession, 60);
  const maxMemoriesPerSession = asPositiveInt(hookConfig?.maxMemoriesPerSession, 8);
  const minImportance = asImportanceThreshold(hookConfig?.minImportance, 0.58);

  console.log(
    `[memory-extract] Running memory extraction (sessions=${maxSessions}, minImportance=${minImportance})...`,
  );

  try {
    const stateDir = resolveStateDir(process.env, os.homedir);
    const sessionsDir = path.join(stateDir, "agents", "main", "sessions");
    const outputPath =
      typeof hookConfig?.outputPath === "string" && hookConfig.outputPath.trim().length > 0
        ? resolveUserPath(hookConfig.outputPath)
        : path.join(stateDir, "memory", "extracted-keyframes.jsonl");

    // Get recent sessions
    const files = await fs.readdir(sessionsDir);
    const jsonlFiles = files
      .filter((f) => f.endsWith(".jsonl") && !f.endsWith(".lock"))
      .toSorted()
      .toReversed()
      .slice(0, maxSessions);

    const seen = new Set<string>();
    const extractedRecords: string[] = [];

    for (const file of jsonlFiles) {
      const filePath = path.join(sessionsDir, file);
      const content = await fs.readFile(filePath, "utf-8");
      const messages = parseSessionJsonlMessages(content).slice(-maxMessagesPerSession);
      if (messages.length === 0) {
        continue;
      }

      const sessionCompression = buildSessionCompression(messages, {
        maxMemories: maxMemoriesPerSession,
        minImportance,
        maxKeywords: 20,
      });
      if (sessionCompression.keyframes.length === 0) {
        continue;
      }
      const sessionBundle = buildSessionKeyframeBundle(file, sessionCompression);

      for (const keyframe of sessionBundle.keyframes) {
        const dedupeKey = `${file}|${keyframe.role}|${keyframe.contentType}|${keyframe.core}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);

        const record = buildMemoryKeyframeRecord({
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          sessionBundle,
          keyframe,
        });
        extractedRecords.push(JSON.stringify(record));
      }
    }

    if (extractedRecords.length === 0) {
      console.log("[memory-extract] No high-value memories extracted.");
      return;
    }

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.appendFile(outputPath, `${extractedRecords.join("\n")}\n`, "utf-8");
    console.log(`[memory-extract] Extracted ${extractedRecords.length} memories to ${outputPath}`);
  } catch (err) {
    const maybeErr = err as NodeJS.ErrnoException;
    if (maybeErr?.code === "ENOENT") {
      console.log("[memory-extract] Sessions directory not found, skipping.");
      return;
    }
    console.error("[memory-extract] Error:", err);
  }
};

export default extractMemory;
