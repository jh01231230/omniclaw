/**
 * PostgreSQL Memory Store
 * Uses pgvector for semantic search
 */

import pg from "pg";
import { randomUUID } from "crypto";

const { Pool } = pg;

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
  private pool: pg.Pool | null = null;
  private config: PostgreSQLMemoryStoreConfig;
  private initialized = false;

  constructor(config: PostgreSQLMemoryStoreConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
    });

    // Create tables if not exist
    await this.pool.query(`
      CREATE EXTENSION IF NOT EXISTS vector;
      
      CREATE TABLE IF NOT EXISTS memories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}',
        source VARCHAR(50) DEFAULT 'conversation',
        importance INT DEFAULT 0,
        tags TEXT[] DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_memories_source ON memories(source);
      CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance DESC);
      CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at DESC);
      
      -- Vector similarity index (IVFFlat)
      CREATE INDEX IF NOT EXISTS idx_memories_embedding ON memories 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
    `);

    this.initialized = true;
  }

  async addMemory(entry: Omit<MemoryEntry, "id" | "createdAt" | "updatedAt">): Promise<string> {
    if (!this.pool) throw new Error("Not initialized");

    const id = randomUUID();
    const embeddingStr = entry.embedding 
      ? `[${entry.embedding.join(",")}]` 
      : null;

    await this.pool.query(
      `INSERT INTO memories (id, content, embedding, metadata, source, importance, tags)
       VALUES ($1, $2, $3::vector, $4, $5, $6, $7)`,
      [id, entry.content, embeddingStr, JSON.stringify(entry.metadata || {}), 
       entry.source || 'conversation', entry.importance || 0, entry.tags || []]
    );

    return id;
  }

  async searchSimilar(queryEmbedding: number[], limit = 10): Promise<MemoryEntry[]> {
    if (!this.pool) throw new Error("Not initialized");

    const embeddingStr = `[${queryEmbedding.join(",")}]`;
    
    const result = await this.pool.query(
      `SELECT id, content, metadata, source, importance, tags, created_at, updated_at,
              1 - (embedding <=> $1::vector) as similarity
       FROM memories
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [embeddingStr, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      source: row.source,
      importance: row.importance,
      tags: row.tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async getMemories(limit = 100, offset = 0): Promise<MemoryEntry[]> {
    if (!this.pool) throw new Error("Not initialized");

    const result = await this.pool.query(
      `SELECT id, content, metadata, source, importance, tags, created_at, updated_at
       FROM memories
       ORDER BY importance DESC, created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return result.rows.map(row => ({
      id: row.id,
      content: row.content,
      metadata: row.metadata,
      source: row.source,
      importance: row.importance,
      tags: row.tags,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  async count(): Promise<number> {
    if (!this.pool) throw new Error("Not initialized");
    const result = await this.pool.query("SELECT COUNT(*) FROM memories");
    return parseInt(result.rows[0].count);
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.initialized = false;
    }
  }
}
