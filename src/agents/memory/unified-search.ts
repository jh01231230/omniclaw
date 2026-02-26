/**
 * Unified Memory Search Module
 * 
 * Searches both Redis (recent) and PostgreSQL (long-term)
 * for comprehensive memory retrieval.
 */

import { randomUUID } from "node:crypto";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const PSQL_PATH = "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql";
const REDIS_CLI = "redis-cli";

export interface MemoryResult {
  id: string;
  content: string;
  source: "redis" | "postgresql" | "web";
  relevance: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface UnifiedSearchOptions {
  query: string;
  limit?: number;
  includeRedis?: boolean;
  includePostgres?: boolean;
  includeWeb?: boolean;
  minRelevance?: number;
}

/**
 * Search PostgreSQL memories using vector similarity
 */
async function searchPostgreSQL(query: string, limit = 10): Promise<MemoryResult[]> {
  try {
    // For now, use text search (full-text search would need pg_trgm or embeddings)
    // TODO: Integrate with pgvector for semantic search
    const resultsJson = execSync(
      `${PSQL_PATH} -U tars -d openclaw_memory -t -h localhost -p 5432 -c "
        SELECT json_agg(row_to_json(t)) FROM (
          SELECT id, content, source, importance, created_at as timestamp,
                 0.5 as relevance,
                 metadata
          FROM memories 
          WHERE content ILIKE '%' || '${query.replace(/'/g, "''")}%'
          ORDER BY importance DESC, created_at DESC
          LIMIT ${limit}
        ) t"`,
      { encoding: "utf-8" }
    ).trim();

    if (!resultsJson || resultsJson === "" || resultsJson === "null") {
      return [];
    }

    const rows = JSON.parse(resultsJson);
    return rows.map((row: any) => ({
      id: row.id,
      content: row.content,
      source: "postgresql" as const,
      relevance: row.relevance || 0.5,
      timestamp: row.timestamp,
      metadata: row.metadata
    }));
  } catch (err) {
    console.error("[memory-search] PostgreSQL error:", err);
    return [];
  }
}

/**
 * Search Redis for recent session messages
 */
async function searchRedis(sessionPattern = "session:*", limit = 50, searchQuery = ""): Promise<MemoryResult[]> {
  try {
    // Get all session keys
    const keysJson = execSync(
      `${REDIS_CLI} KEYS "${sessionPattern}"`,
      { encoding: "utf-8" }
    ).trim();

    if (!keysJson) {
      return [];
    }

    const keys = keysJson.split("\n").filter(k => k.trim());
    const results: MemoryResult[] = [];

    for (const key of keys.slice(0, 10)) { // Limit keys to search
      try {
        // Get recent messages from this session
        const messagesJson = execSync(
          `${REDIS_CLI} LRANGE "${key}" -${limit} -1`,
          { encoding: "utf-8" }
        ).trim();

        if (!messagesJson) continue;

        // Parse JSON messages (each line is a JSON object)
        const messages = messagesJson.split("\n")
          .filter(m => m.trim())
          .map(m => {
            try {
              return JSON.parse(m);
            } catch {
              return null;
            }
          })
          .filter(m => m && m.content);

        for (const msg of messages) {
          const content = typeof msg.content === "string" ? msg.content : 
                        (msg.content?.text || JSON.stringify(msg.content));
          if (content && (!searchQuery || content.toLowerCase().includes(searchQuery.toLowerCase()))) {
            results.push({
              id: `${key}:${msg.id || randomUUID()}`,
              content: content.substring(0, 500),
              source: "redis",
              relevance: 0.8, // Higher relevance for recent
              timestamp: msg.timestamp || new Date().toISOString(),
              metadata: { sessionKey: key }
            });
          }
        }
      } catch {
        // Skip failed keys
      }
    }

    return results.slice(0, limit);
  } catch (err) {
    console.error("[memory-search] Redis error:", err);
    return [];
  }
}

/**
 * Search web for additional information
 */
async function searchWeb(query: string, limit = 5): Promise<MemoryResult[]> {
  // This would use the Brave API or similar
  // For now, return empty - would need web search integration
  console.log("[memory-search] Web search requested for:", query);
  return [];
}

/**
 * Unified memory search - combines Redis, PostgreSQL, and optionally Web
 */
export async function unifiedSearch(opts: UnifiedSearchOptions): Promise<MemoryResult[]> {
  const {
    query,
    limit = 10,
    includeRedis = true,
    includePostgres = true,
    includeWeb = false,
    minRelevance = 0.3
  } = opts;

  const results: MemoryResult[] = [];

  // Parallel search
  const searches: Promise<MemoryResult[]>[] = [];
  
  if (includePostgres) {
    searches.push(searchPostgreSQL(query, limit));
  }
  
  if (includeRedis) {
    searches.push(searchRedis("session:*", limit));
  }
  
  if (includeWeb) {
    searches.push(searchWeb(query, limit));
  }

  const allResults = await Promise.all(searches);
  
  // Merge and sort by relevance
  for (const resultSet of allResults) {
    results.push(...resultSet);
  }

  // Sort by relevance and limit
  return results
    .filter(r => r.relevance >= minRelevance)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, limit);
}

/**
 * Detect conflicts between new information and existing memories
 */
export async function detectConflicts(
  newContent: string,
  threshold = 0.7
): Promise<{ id: string; content: string; similarity: number }[]> {
  try {
    // Extract key terms from new content
    const keyTerms = newContent.split(/\s+/)
      .filter(t => t.length > 3)
      .slice(0, 10)
      .join("|");

    if (!keyTerms) return [];

    const resultsJson = execSync(
      `${PSQL_PATH} -U tars -d openclaw_memory -t -h localhost -p 5432 -c "
        SELECT json_agg(row_to_json(t)) FROM (
          SELECT id, content, 
                 (SELECT MAX(similarity) FROM unnest(regexp_matches(content, '${keyTerms}', 'gi')) as sim
          FROM memories 
          WHERE content ~* '${keyTerms}'
          ORDER BY sim DESC
          LIMIT 20
        ) t"`,
      { encoding: "utf-8" }
    ).trim();

    if (!resultsJson || resultsJson === "" || resultsJson === "null") {
      return [];
    }

    const rows = JSON.parse(resultsJson);
    return rows
      .filter((r: any) => r.sim >= threshold)
      .map((r: any) => ({
        id: r.id,
        content: r.content.substring(0, 200),
        similarity: r.sim || 0
      }));
  } catch (err) {
    console.error("[memory-conflict] Detection error:", err);
    return [];
  }
}

/**
 * Update memory with new content or mark conflicts
 */
export async function updateMemory(
  id: string,
  updates: { content?: string; conflicts?: string[]; refresh_after?: string }
): Promise<boolean> {
  try {
    const setClauses: string[] = [];
    const args: string[] = [];

    if (updates.content) {
      setClauses.push("content = $" + (args.length + 1));
      args.push(updates.content);
    }
    if (updates.conflicts) {
      setClauses.push("metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{conflicts}', $" + (args.length + 1) + "::jsonb)");
      args.push(JSON.stringify(updates.conflicts));
    }
    if (updates.refresh_after) {
      setClauses.push("metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{refresh_after}', $" + (args.length + 1) + "::jsonb)");
      args.push(`"${updates.refresh_after}"`);
    }

    if (setClauses.length === 0) return false;

    args.push(id);
    
    execSync(
      `${PSQL_PATH} -U tars -d openclaw_memory -h localhost -p 5432 -c "
        UPDATE memories 
        SET ${setClauses.join(", ")}
        WHERE id = $${args.length}"`,
      { encoding: "utf-8" }
    );

    return true;
  } catch (err) {
    console.error("[memory-update] Error:", err);
    return false;
  }
}

/**
 * Get memories that need refresh (time-sensitive)
 */
export async function getMemoriesNeedingRefresh(): Promise<MemoryResult[]> {
  try {
    const resultsJson = execSync(
      `${PSQL_PATH} -U tars -d openclaw_memory -t -h localhost -p 5432 -c "
        SELECT json_agg(row_to_json(t)) FROM (
          SELECT id, content, source, created_at as timestamp, metadata
          FROM memories 
          WHERE metadata ? 'refresh_after'
            AND metadata->>'refresh_after' < NOW()::timestamp
          ORDER BY created_at ASC
          LIMIT 20
        ) t"`,
      { encoding: "utf-8" }
    ).trim();

    if (!resultsJson || resultsJson === "" || resultsJson === "null") {
      return [];
    }

    return JSON.parse(resultsJson).map((row: any) => ({
      id: row.id,
      content: row.content,
      source: "postgresql" as const,
      relevance: 1,
      timestamp: row.timestamp,
      metadata: row.metadata
    }));
  } catch (err) {
    console.error("[memory-refresh] Error:", err);
    return [];
  }
}

/**
 * Store new memory to PostgreSQL
 */
export async function storeMemory(
  content: string,
  source = "agent",
  importance = 50,
  metadata: Record<string, unknown> = {}
): Promise<string | null> {
  try {
    const id = randomUUID();
    const safeContent = content.replace(/'/g, "''");
    const safeMetadata = JSON.stringify(metadata).replace(/'/g, "''");

    execSync(
      `${PSQL_PATH} -U tars -d openclaw_memory -h localhost -p 5432 -c "
        INSERT INTO memories (id, content, metadata, source, importance, tags, created_at)
        VALUES ('${id}', E'${safeContent}', '${safeMetadata}'::jsonb, '${source}', ${importance}, ARRAY['${source}'], NOW())"`,
      { encoding: "utf-8" }
    );

    return id;
  } catch (err) {
    console.error("[memory-store] Error:", err);
    return null;
  }
}
