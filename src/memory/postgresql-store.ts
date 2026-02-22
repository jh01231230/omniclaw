/**
 * PostgreSQL Memory Store
 * Uses pgvector for semantic search
 * Uses psql command-line tool (no external dependencies)
 */

import { randomUUID } from "crypto";
import { execSync } from "child_process";

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
    // Try common psql locations
    this.psqlPath = process.env.PSQL_PATH || "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql";
  }

  private getConnectionString(): string {
    const { host, port, database, user, password } = this.config;
    return `postgresql://${user}${password ? `:${password}` : ''}@${host}:${port}/${database}`;
  }

  private async runSql(sql: string): Promise<string> {
    try {
      const result = execSync(
        `PSQL_PATH="${this.psqlPath}" ${this.psqlPath} -U ${this.config.user} -d ${this.config.database} -h ${this.config.host} -p ${this.config.port} -c "${sql.replace(/"/g, '\\"')}"`,
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );
      return result;
    } catch (err: unknown) {
      const error = err as { message?: string; stderr?: string };
      throw new Error(`PSQL error: ${error.message || error.stderr || String(err)}`);
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create tables if not exist (table creation done manually)
    this.initialized = true;
  }

  async addMemory(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<string> {
    const id = randomUUID();
    const embeddingStr = entry.embedding 
      ? `'[${entry.embedding.join(",")}]'::vector`
      : 'NULL';
    const metadataStr = JSON.stringify(entry.metadata || {}).replace(/'/g, "''");
    const tagsStr = entry.tags ? `ARRAY[${entry.tags.map(t => `'${t}'`).join(",")}]` : 'ARRAY[]::text[]';

    const sql = `INSERT INTO memories (id, content, embedding, metadata, source, importance, tags)
                 VALUES ('${id}', E'${entry.content.replace(/'/g, "''")}', ${embeddingStr}, '${metadataStr}'::jsonb, '${entry.source || 'conversation'}', ${entry.importance || 0}, ${tagsStr})`;

    await this.runSql(sql);
    return id;
  }

  async searchSimilar(queryEmbedding: number[], limit = 10): Promise<MemoryEntry[]> {
    const embeddingStr = `'[${queryEmbedding.join(",")}]'::vector`;
    
    // Use psql to query - extract fields we need
    const sql = `SELECT id, content, metadata, source, importance, tags, created_at, updated_at,
                        1 - (embedding <=> ${embeddingStr}) as similarity
                 FROM memories
                 WHERE embedding IS NOT NULL
                 ORDER BY embedding <=> ${embeddingStr}
                 LIMIT ${limit}`;

    try {
      const result = execSync(
        `${this.psqlPath} -U ${this.config.user} -d ${this.config.database} -h ${this.config.host} -p ${this.config.port} -t -A -F "|" -c "${sql.replace(/"/g, '\\"')}"`,
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );

      if (!result.trim()) return [];

      return result.trim().split("\n").map(line => {
        const parts = line.split("|");
        return {
          id: parts[0],
          content: parts[1],
          metadata: parts[2] ? JSON.parse(parts[2]) : {},
          source: parts[3],
          importance: parseInt(parts[4]) || 0,
          tags: parts[5] ? parts[5].replace(/[{}]/g, "").split(",") : [],
          createdAt: parts[6] ? new Date(parts[6]) : undefined,
          updatedAt: parts[7] ? new Date(parts[7]) : undefined,
        };
      });
    } catch (err) {
      console.error("Search error:", err);
      return [];
    }
  }

  async getMemories(limit = 100, offset = 0): Promise<MemoryEntry[]> {
    const sql = `SELECT id, content, metadata, source, importance, tags, created_at, updated_at
                 FROM memories
                 ORDER BY importance DESC, created_at DESC
                 LIMIT ${limit} OFFSET ${offset}`;

    try {
      const result = execSync(
        `${this.psqlPath} -U ${this.config.user} -d ${this.config.database} -h ${this.config.host} -p ${this.config.port} -t -A -F "|" -c "${sql.replace(/"/g, '\\"')}"`,
        { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
      );

      if (!result.trim()) return [];

      return result.trim().split("\n").map(line => {
        const parts = line.split("|");
        return {
          id: parts[0],
          content: parts[1],
          metadata: parts[2] ? JSON.parse(parts[2]) : {},
          source: parts[3],
          importance: parseInt(parts[4]) || 0,
          tags: parts[5] ? parts[5].replace(/[{}]/g, "").split(",") : [],
          createdAt: parts[6] ? new Date(parts[6]) : undefined,
          updatedAt: parts[7] ? new Date(parts[7]) : undefined,
        };
      });
    } catch (err) {
      console.error("GetMemories error:", err);
      return [];
    }
  }

  async count(): Promise<number> {
    const result = execSync(
      `${this.psqlPath} -U ${this.config.user} -d ${this.config.database} -h ${this.config.host} -p ${this.config.port} -t -A -c "SELECT COUNT(*) FROM memories"`,
      { encoding: "utf-8" }
    );
    return parseInt(result.trim()) || 0;
  }

  async close(): Promise<void> {
    // No persistent connection to close
    this.initialized = false;
  }
}
