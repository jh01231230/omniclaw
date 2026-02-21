import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { HookHandler, InternalHookEvent } from "../../hooks.js";
import { loadConfig } from "../../../config/config.js";
import { resolveStateDir } from "../../../config/paths.js";

/**
 * Periodic Memory Summarization Hook
 * Summarizes recent conversations and saves to memory
 */

const SUMMARY_PROMPT = `Please summarize the following conversation concisely, focusing on:
1. Key decisions made
2. Important information learned
3. Tasks completed or in progress
4. Any follow-ups needed

Format as a brief journal entry.`;

const summarizeConversations: HookHandler = async (event: InternalHookEvent) => {
  const eventType = event.type as string;
  // Only run periodically
  if (eventType !== "cron" && eventType !== "heartbeat") {
    return;
  }

  // Load config
  const cfg = loadConfig();
  const memorySearch = cfg.agents?.defaults?.memorySearch as Record<string, unknown> | undefined;

  // Check if periodicSummary is enabled
  const summaryConfigRaw = memorySearch?.periodicSummary;
  const summaryConfig =
    summaryConfigRaw && typeof summaryConfigRaw === "object"
      ? (summaryConfigRaw as { enabled?: boolean; outputPath?: string; prompt?: string })
      : undefined;
  if (!summaryConfig?.enabled) {
    return;
  }

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
      .sort()
      .reverse()
      .slice(0, 5); // Last 5 sessions

    if (jsonlFiles.length === 0) {
      console.log("[periodic-summary] No sessions found");
      return;
    }

    // Read recent sessions (just first 100 lines each for summary)
    let conversationText = "";
    for (const file of jsonlFiles) {
      const filePath = path.join(sessionsDir, file);
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split("\n").slice(0, 100).join("\n");
        conversationText += `\n\n=== ${file} ===\n${lines}`;
      } catch {
        // Skip files that can't be read
      }
    }

    // Generate summary - in a full implementation, this would call an LLM
    // For now, we'll save the raw data for later summarization
    const outputPath =
      summaryConfig.outputPath ||
      path.join(os.homedir(), ".omniclaw", "memory", "periodic-summary.md");
    const prompt = summaryConfig.prompt || SUMMARY_PROMPT;

    const summaryEntry = `---
date: ${new Date().toISOString()}
source: periodic-summary
---

# Periodic Summary

## Raw Conversation Excerpts

${conversationText.slice(0, 5000)}

## Summary Prompt (for LLM processing)

${prompt}
`;

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.appendFile(outputPath, summaryEntry + "\n\n");

    console.log("[periodic-summary] Summary saved to:", outputPath);
  } catch (err) {
    console.error("[periodic-summary] Error:", err);
  }
};

export default summarizeConversations;
