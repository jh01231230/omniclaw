import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HookHandler, InternalHookEvent } from "../../hooks.js";
import { loadConfig } from "../../../config/config.js";
import { resolveStateDir } from "../../../config/paths.js";

/**
 * Memory Extraction Hook
 * Extracts keyframes from conversations and stores in long_term_memory
 * Uses Redis for short-term memory, PostgreSQL for long-term
 */

const extractKeyframe = (content: string): string => {
  // Extract keyframe - first 200 chars or first sentence
  const sentences = content.split(/[.!?]/);
  if (sentences[0].length < 200) {
    return sentences[0].trim() + ".";
  }
  return content.slice(0, 200).trim() + "...";
};

const calculateImportance = async (content: string, _model?: string): Promise<number> => {
  // Simple heuristic: length + keywords
  let score = 0.5;

  const importantKeywords = [
    "remember",
    "don't forget",
    "important",
    "critical",
    "decision",
    "plan",
    "goal",
    "preference",
    "like",
    "hate",
    "never",
    "always",
    "todo",
    "fix",
    "bug",
    "error",
  ];

  const lowerContent = content.toLowerCase();

  for (const keyword of importantKeywords) {
    if (lowerContent.includes(keyword)) {
      score += 0.05;
    }
  }

  // Length factor
  if (content.length > 500) {
    score += 0.1;
  }
  if (content.length > 2000) {
    score += 0.1;
  }

  return Math.min(score, 1.0);
};

function isSessionEndEvent(event: InternalHookEvent): boolean {
  if (event.type !== "session") {
    return false;
  }
  const withAction = event as unknown as { action?: unknown };
  return withAction.action === "end";
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

  console.log("[memory-extract] Running memory extraction...");

  try {
    const stateDir = resolveStateDir(process.env, os.homedir);
    const sessionsDir = path.join(stateDir, "agents", "main", "sessions");

    // Get recent sessions
    const files = await fs.readdir(sessionsDir);
    const jsonlFiles = files
      .filter((f) => f.endsWith(".jsonl") && !f.endsWith(".lock"))
      .toSorted()
      .toReversed()
      .slice(0, 3);

    for (const file of jsonlFiles) {
      const filePath = path.join(sessionsDir, file);
      const content = await fs.readFile(filePath, "utf-8");

      // Parse messages
      const lines = content.split("\n").filter((l) => l.trim());
      const messages = lines
        .map((l) => {
          try {
            return JSON.parse(l);
          } catch {
            return null;
          }
        })
        .filter(Boolean);

      // Extract keyframes from user messages
      for (const msg of messages) {
        if (msg.role === "user" || msg.role === "assistant") {
          const importance = await calculateImportance(msg.content || "");

          // Only store important memories
          if (importance > 0.6) {
            const keyframe = extractKeyframe(msg.content || "");

            console.log("[memory-extract] Extracted keyframe:", keyframe.slice(0, 50));

            // TODO: Store to PostgreSQL long_term_memory table
            // This requires pgvector to be installed
            // For now, log what would be stored
          }
        }
      }
    }
  } catch (err) {
    console.error("[memory-extract] Error:", err);
  }
};

export default extractMemory;
