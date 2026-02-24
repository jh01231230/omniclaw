import { randomUUID } from "node:crypto";
import { execSync } from "child_process";
import type { HookHandler, InternalHookEvent } from "../../hooks.js";
import { loadConfig } from "../../../config/config.js";

const PSQL_PATH = "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql";

interface MemoryRecord {
  id: string;
  content: string;
  importance: number;
  source: string;
  created_at: Date;
  embedding?: number[];
}

/**
 * Execute psql command
 */
function psqlExec(sql: string): string {
  return execSync(
    `${PSQL_PATH} -U tars -d openclaw_memory -h localhost -p 5432 -t -c "${sql.replace(/"/g, '\\"')}"`,
    { encoding: "utf-8" }
  ).trim();
}

/**
 * Query recent memories from PostgreSQL
 */
async function queryRecentMemories(limit: number = 20): Promise<MemoryRecord[]> {
  const sql = `
    SELECT id, content, importance, source, created_at 
    FROM memories 
    WHERE needs_embedding = true OR embedding IS NULL
    ORDER BY created_at DESC 
    LIMIT ${limit}
  `;
  
  const result = psqlExec(sql);
  if (!result) return [];
  
  const lines = result.split("\n").filter(Boolean);
  return lines.map(line => {
    const parts = line.split("|");
    return {
      id: parts[0]?.trim() || "",
      content: parts[1]?.trim() || "",
      importance: parseInt(parts[2]?.trim() || "0"),
      source: parts[3]?.trim() || "",
      created_at: new Date(parts[4]?.trim() || Date.now())
    };
  }).filter(m => m.id && m.content);
}

/**
 * Search for similar memories using pgvector
 */
async function findSimilarMemories(content: string, threshold: number = 0.85): Promise<MemoryRecord[]> {
  // Note: In production, we'd generate embeddings using an LLM
  // For now, just return empty (no duplicates found)
  // This is a placeholder for the full implementation
  console.log("[memory-enrichment] Would search for similar to:", content.slice(0, 100));
  return [];
}

/**
 * Web search for a query using curl (Brave API or similar)
 */
async function webSearch(query: string): Promise<string> {
  // Placeholder - would use Brave API or similar
  // For now, just log
  console.log("[memory-enrichment] Would search web for:", query);
  return "";
}

/**
 * Detect potential conflicts in memories
 */
async function detectConflicts(memoryId: string, content: string): Promise<string[]> {
  // Placeholder for conflict detection
  // Would compare semantic meaning and find contradictions
  console.log("[memory-enrichment] Would check conflicts for:", memoryId);
  return [];
}

/**
 * Update memory with enrichment data
 */
async function updateMemory(id: string, metadata: Record<string, unknown>): Promise<void> {
  const metadataJson = JSON.stringify(metadata).replace(/'/g, "''");
  const sql = `
    UPDATE memories 
    SET metadata = metadata || '${metadataJson}'::jsonb,
        updated_at = NOW()
    WHERE id = '${id}'
  `;
  psqlExec(sql);
}

/**
 * Mark memory as processed (no longer needs_embedding)
 */
async function markMemoryProcessed(id: string): Promise<void> {
  const sql = `
    UPDATE memories 
    SET needs_embedding = false,
        updated_at = NOW()
    WHERE id = '${id}'
  `;
  psqlExec(sql);
}

/**
 * Main enrichment hook handler
 */
const memoryEnrichment: HookHandler = async (event: InternalHookEvent) => {
  const eventType = event.type as string;
  
  // Only run periodically
  if (eventType !== "cron" && eventType !== "heartbeat") {
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
    // Query memories that need processing
    const pendingMemories = await queryRecentMemories(10);
    
    if (pendingMemories.length === 0) {
      console.log("[memory-enrichment] No pending memories to enrich");
      return;
    }

    console.log(`[memory-enrichment] Processing ${pendingMemories.length} memories`);

    for (const memory of pendingMemories) {
      try {
        // 1. Check for duplicates using pgvector
        const similar = await findSimilarMemories(memory.content);
        
        if (similar.length > 0) {
          console.log(`[memory-enrichment] Found ${similar.length} similar memories for ${memory.id}`);
          // Could merge or mark as duplicate
        }

        // 2. Detect conflicts
        const conflicts = await detectConflicts(memory.id, memory.content);
        
        if (conflicts.length > 0) {
          console.log(`[memory-enrichment] Found ${conflicts.length} potential conflicts for ${memory.id}`);
          await updateMemory(memory.id, { conflicts_detected: conflicts });
        }

        // 3. For high-importance memories, do web enrichment
        if (memory.importance >= 40) {
          // Extract key terms (simplified - would use NLP in production)
          const keyTerms = memory.content.split(" ").slice(0, 5).join(" ");
          const webInfo = await webSearch(keyTerms);
          
          if (webInfo) {
            await updateMemory(memory.id, { web_enriched: true, search_terms: keyTerms });
          }
        }

        // 4. Mark as processed
        await markMemoryProcessed(memory.id);
        
      } catch (err) {
        console.error(`[memory-enrichment] Error processing memory ${memory.id}:`, err);
      }
    }

    console.log("[memory-enrichment] Enrichment complete");

  } catch (err) {
    console.error("[memory-enrichment] Error:", err);
  }
};

export default memoryEnrichment;
