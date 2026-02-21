import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HookHandler, InternalHookEvent } from "../../hooks.js";
import { loadConfig } from "../../config/config.js";
import { resolveStateDir } from "../../config/paths.js";

/**
 * Memory Extraction Hook
 * Extracts keyframes from conversations and stores in long_term_memory
 * Uses Redis for short-term memory, PostgreSQL for long-term
 */

const MEMORY_TRIGGERS = {
  decision_point: true, // Important decisions
  pattern_recognition: true, // Pattern appears 3+ times
  emotion_peak: true, // Emotional peaks
  skill_learned: true, // New skill learned
  relationship_change: true, // Relationship changes
  failed_attempt: true, // Failure lessons
};

const DETAIL_LEVELS = {
  keyframe: "Key decision points, under 200 chars",
  detail: "Full context, under 2000 chars",
  raw: "Raw conversation, important sessions only",
};

interface ShortTermMemory {
  sessionId: string;
  messages: Array<{
    role: string;
    content: string;
    timestamp: number;
  }>;
  createdAt: number;
  lastAccess: number;
}

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
  if (content.length > 500) score += 0.1;
  if (content.length > 2000) score += 0.1;

  return Math.min(score, 1.0);
};

const extractMemory: HookHandler = async (event: InternalHookEvent) => {
  // Run on session end or periodic trigger
  if (event.type !== "session" || (event as any).action !== "end") {
    // Also run on heartbeat for periodic extraction
    if (event.type !== "heartbeat") {
      return;
    }
  }

  const cfg = loadConfig();
  const memorySearch = cfg.agents?.defaults?.memorySearch;

  // Only run if full deployment
  if (memorySearch?.deployment !== "full") {
    return;
  }

  console.log("[memory-extract] Running memory extraction...");

  try {
    const stateDir = resolveStateDir(process.env, os.homedir());
    const sessionsDir = path.join(stateDir, "agents", "main", "sessions");

    // Get recent sessions
    const files = await fs.readdir(sessionsDir);
    const jsonlFiles = files
      .filter((f) => f.endsWith(".jsonl") && !f.endsWith(".lock"))
      .sort()
      .reverse()
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
