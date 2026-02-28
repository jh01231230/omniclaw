/**
 * Memory Enrichment Hook
 *
 * Enriches stored memories with:
 * 1. Conflict detection
 * 2. Web search for updates
 * 3. Time-sensitive refresh
 */

import { execSync } from "child_process";
import type { HookHandler, InternalHookEvent } from "../../hooks.js";
import {
  detectConflicts,
  getMemoriesNeedingRefresh,
} from "../../../agents/memory/unified-search.js";
import { loadConfig } from "../../../config/config.js";

const PSQL_PATH = "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql";

/**
 * Execute psql command
 */
function psqlExec(sql: string): string {
  return execSync(
    `${PSQL_PATH} -U tars -d openclaw_memory -h localhost -p 5432 -t -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: "utf-8" },
  ).trim();
}

/**
 * Query recent memories from PostgreSQL
 */
type RecentMemoryRow = {
  id: string;
  content: string;
  importance: number;
  source: string;
  created_at: string;
  metadata: string;
};

async function queryRecentMemories(limit: number = 20): Promise<RecentMemoryRow[]> {
  const sql = `
    SELECT id, content, importance, source, created_at, metadata
    FROM memories 
    WHERE needs_embedding = true OR embedding IS NULL
    ORDER BY created_at DESC 
    LIMIT ${limit}
  `;

  const result = psqlExec(sql);
  if (!result) {
    return [];
  }

  const lines = result.split("\n").filter(Boolean);
  return lines
    .map((line) => {
      const parts = line.split("|");
      return {
        id: parts[0]?.trim() || "",
        content: parts[1]?.trim() || "",
        importance: Number.parseInt(parts[2]?.trim() || "0", 10),
        source: parts[3]?.trim() || "",
        created_at: parts[4]?.trim() || "",
        metadata: parts[5]?.trim() || "{}",
      };
    })
    .filter((memory) => memory.id && memory.content);
}

/**
 * Mark memory as processed
 */
async function markMemoryProcessed(id: string): Promise<void> {
  psqlExec(`UPDATE memories SET needs_embedding = false WHERE id = '${id}'`);
}

/**
 * Update memory with enrichment data
 */
async function updateMemoryEnrichment(
  id: string,
  data: { conflicts?: string[]; web_enriched?: boolean; search_terms?: string },
): Promise<void> {
  const sets: string[] = [];

  if (data.conflicts) {
    sets.push(
      `metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{conflicts}', '${JSON.stringify(data.conflicts).replace(/'/g, "''")}'::jsonb)`,
    );
  }
  if (data.web_enriched !== undefined) {
    sets.push(
      `metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{web_enriched}', '${data.web_enriched}'::jsonb)`,
    );
  }
  if (data.search_terms) {
    sets.push(
      `metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{search_terms}', '${data.search_terms.replace(/'/g, "''")}'::jsonb)`,
    );
  }

  if (sets.length > 0) {
    psqlExec(`UPDATE memories SET ${sets.join(", ")} WHERE id = '${id}'`);
  }
}

/**
 * Detect conflicts in memory content
 */
async function detectConflictsForMemory(memoryId: string, content: string): Promise<string[]> {
  const conflicts = await detectConflicts(content, 0.6);
  return conflicts.map((c) => c.id);
}

/**
 * Main enrichment handler
 */
const memoryEnrichment: HookHandler = async (event: InternalHookEvent) => {
  const eventType = event.type as string;

  // Accept cron:hourly, cron:daily, or any cron-* event, plus heartbeat
  const isCronEvent = eventType === "cron" || eventType.startsWith("cron:");
  if (!isCronEvent && eventType !== "heartbeat") {
    return;
  }

  // Load config to verify full deployment mode
  const cfg = loadConfig() as unknown as Record<string, unknown>;
  const agents = cfg?.agents as Record<string, unknown> | undefined;
  const defaults = agents?.defaults as Record<string, unknown> | undefined;
  const memorySearch = defaults?.memorySearch as Record<string, unknown> | undefined;
  const deployment = memorySearch?.deployment as string | undefined;

  if (deployment !== "full") {
    console.log("[memory-enrichment] Not in full deployment mode, skipping");
    return;
  }

  console.log("[memory-enrichment] Running memory enrichment for full mode...");

  try {
    // 1. Process memories that need embedding
    const pendingMemories = await queryRecentMemories(10);

    if (pendingMemories.length > 0) {
      console.log(`[memory-enrichment] Processing ${pendingMemories.length} memories`);

      for (const memory of pendingMemories) {
        try {
          // Check for conflicts with existing memories
          const conflicts = await detectConflictsForMemory(memory.id, memory.content);

          if (conflicts.length > 0) {
            console.log(
              `[memory-enrichment] Found ${conflicts.length} potential conflicts for ${memory.id}`,
            );
            await updateMemoryEnrichment(memory.id, { conflicts });
          }

          // For high-importance memories, do web enrichment
          if (memory.importance >= 40) {
            // Extract key terms (simplified)
            const keyTerms = memory.content.split(" ").slice(0, 5).join(" ");
            console.log(`[memory-enrichment] Would search web for: ${keyTerms}`);
            // Web search would go here
            await updateMemoryEnrichment(memory.id, {
              web_enriched: false,
              search_terms: keyTerms,
            });
          }

          // Mark as processed
          await markMemoryProcessed(memory.id);
        } catch (err) {
          console.error(`[memory-enrichment] Error processing memory ${memory.id}:`, err);
        }
      }
    }

    // 2. Check for time-sensitive memories needing refresh
    const staleMemories = await getMemoriesNeedingRefresh();

    if (staleMemories.length > 0) {
      console.log(`[memory-enrichment] Found ${staleMemories.length} memories needing refresh`);

      for (const memory of staleMemories) {
        console.log(`[memory-enrichment] Would refresh: ${memory.id}`);
        // In production: fetch new info from web and update
      }
    }

    // 3. Summary
    const totalMemories = psqlExec("SELECT COUNT(*) FROM memories");
    console.log(`[memory-enrichment] Enrichment complete. Total memories: ${totalMemories}`);
  } catch (err) {
    console.error("[memory-enrichment] Error:", err);
  }
};

export default memoryEnrichment;
