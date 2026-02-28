/**
 * PostgreSQL Memory Store
 * Uses pgvector for semantic search
 */

import { execSync } from "child_process";
import { randomUUID } from "crypto";

export interface MemoryEntry {
  id: string;
  content: string;
  embedding?: number[];
  metadata?: Record<string, unknown>;
  source?: string;
  importance?: number;
  tags?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PostgreSQLMemoryStoreConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password?: string;
}

export class PostgreSQLMemoryStore {
  private config: PostgreSQLMemoryStoreConfig;
  private initialized = false;
  private psqlPath: string;

  constructor(config: PostgreSQLMemoryStoreConfig) {
    this.config = config;
    this.psqlPath =
      process.env.PSQL_PATH || "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql";
  }

  private runSql(sql: string): string {
    return execSync(
      `${this.psqlPath} -U ${this.config.user} -d ${this.config.database} -h ${this.config.host} -p ${this.config.port} -t -A -c "${sql.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 },
    );
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;
  }

  async addMemory(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<string> {
    const id = randomUUID();
    const embeddingStr = entry.embedding ? `'[${entry.embedding.join(",")}]'::vector` : "NULL";
    const metadataStr = JSON.stringify(entry.metadata || {}).replace(/'/g, "''");
    const tagsStr = entry.tags
      ? `ARRAY[${entry.tags.map((t) => `'${t}'`).join(",")}]`
      : "ARRAY[]::text[]";

    const sql = `INSERT INTO memories (id, content, embedding, metadata, source, importance, tags)
                 VALUES ('${id}', E'${entry.content.replace(/'/g, "''")}', ${embeddingStr}, '${metadataStr}'::jsonb, '${entry.source || "conversation"}', ${entry.importance || 0}, ${tagsStr})`;

    this.runSql(sql);
    return id;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length) {
      return 0;
    }
    const dotProduct = a.reduce((sum, val, i) => sum + val * (b[i] || 0), 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    if (magA === 0 || magB === 0) {
      return 0;
    }
    return dotProduct / (magA * magB);
  }

  async searchSimilar(queryEmbedding: number[], limit = 10): Promise<MemoryEntry[]> {
    try {
      // Get all memories with embeddings - use JSON format
      const sql = `SELECT json_build_object(
        'id', m.id,
        'content', LEFT(m.content, 500),
        'metadata', m.metadata::text,
        'source', m.source,
        'importance', m.importance,
        'tags', m.tags::text,
        'created_at', m.created_at::text,
        'embedding', m.embedding::text
      )::text as row
      FROM memories m
      WHERE m.embedding IS NOT NULL
      ORDER BY m.importance DESC
      LIMIT 50`;

      const result = this.runSql(sql);

      if (!result.trim()) {
        return [];
      }

      // Parse each line as JSON
      const lines = result.trim().split("\n");
      const memories: Array<MemoryEntry & { embStr: string }> = [];

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        try {
          const parsed = JSON.parse(line);
          memories.push({
            id: parsed.id,
            content: parsed.content,
            metadata: parsed.metadata ? JSON.parse(parsed.metadata) : {},
            source: parsed.source,
            importance: parsed.importance,
            tags: parsed.tags ? parsed.tags.replace(/[{}]/g, "").split(",") : [],
            createdAt: parsed.created_at ? new Date(parsed.created_at) : undefined,
            embStr: parsed.embedding,
          });
        } catch {
          // Skip malformed JSON
          continue;
        }
      }

      // Calculate similarity in JavaScript
      return memories
        .map((m) => {
          let emb: number[] = [];
          try {
            // Parse embedding string like "[0.1,0.2,...]"
            const embMatch = m.embStr.match(/\[(.*)\]/);
            if (embMatch) {
              emb = embMatch[1].split(",").map(Number);
            }
          } catch {}

          return {
            id: m.id,
            content: m.content,
            metadata: m.metadata,
            source: m.source,
            importance: m.importance,
            tags: m.tags,
            createdAt: m.createdAt,
            _similarity: this.cosineSimilarity(emb, queryEmbedding),
          };
        })
        .toSorted((a, b) => b._similarity - a._similarity)
        .slice(0, limit)
        .map(
          (m): MemoryEntry => ({
            id: m.id,
            content: m.content,
            metadata: m.metadata,
            source: m.source,
            importance: m.importance,
            tags: m.tags,
            createdAt: m.createdAt,
          }),
        );
    } catch (err) {
      console.error("Search error:", err);
      return [];
    }
  }

  async getMemories(limit = 100, offset = 0): Promise<MemoryEntry[]> {
    const sql = `SELECT json_build_object(
      'id', id,
      'content', LEFT(content, 500),
      'metadata', metadata::text,
      'source', source,
      'importance', importance,
      'tags', tags::text,
      'created_at', created_at::text,
      'updated_at', updated_at::text
    )::text as row
    FROM memories
    ORDER BY importance DESC, created_at DESC
    LIMIT ${limit} OFFSET ${offset}`;

    try {
      const result = this.runSql(sql);
      if (!result.trim()) {
        return [];
      }

      const lines = result.trim().split("\n");
      return lines
        .filter((l) => l.trim())
        .map((line) => {
          try {
            const parsed = JSON.parse(line);
            return {
              id: parsed.id,
              content: parsed.content,
              metadata: parsed.metadata ? JSON.parse(parsed.metadata) : {},
              source: parsed.source,
              importance: parsed.importance,
              tags: parsed.tags ? parsed.tags.replace(/[{}]/g, "").split(",") : [],
              createdAt: parsed.created_at ? new Date(parsed.created_at) : undefined,
              updatedAt: parsed.updated_at ? new Date(parsed.updated_at) : undefined,
            };
          } catch {
            return null;
          }
        })
        .filter(Boolean) as MemoryEntry[];
    } catch (err) {
      console.error("GetMemories error:", err);
      return [];
    }
  }

  async count(): Promise<number> {
    const result = this.runSql("SELECT COUNT(*) FROM memories");
    return parseInt(result.trim()) || 0;
  }

  async close(): Promise<void> {
    this.initialized = false;
  }
}
