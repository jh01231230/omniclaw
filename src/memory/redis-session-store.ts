/**
 * Redis Session Store - Short-term conversation storage
 *
 * Stores recent conversation messages in Redis for quick access
 * and provides archiving to PostgreSQL for long-term storage
 */

import { randomUUID } from "node:crypto";
import { createClient, RedisClientType } from "redis";

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  channel?: string;
}

export interface SessionData {
  sessionKey: string;
  messages: SessionMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface RedisSessionStoreConfig {
  host: string;
  port: number;
  db?: number;
  sessionPrefix?: string;
  maxMessages?: number; // Max messages per session in Redis
  ttlSeconds?: number; // TTL for session data
}

const DEFAULT_CONFIG: Required<RedisSessionStoreConfig> = {
  host: "localhost",
  port: 6379,
  db: 0,
  sessionPrefix: "session:",
  maxMessages: 1000,
  ttlSeconds: 7 * 24 * 60 * 60, // 7 days
};

export class RedisSessionStore {
  private client: RedisClientType | null = null;
  private config: Required<RedisSessionStoreConfig>;
  private connected: boolean = false;

  constructor(config?: Partial<RedisSessionStoreConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.connected && this.client) {
      return;
    }

    try {
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
        },
        database: this.config.db,
      });

      this.client.on("error", (err: unknown) => {
        console.error("[redis-session-store] Redis error:", err);
      });

      await this.client.connect();
      this.connected = true;
      console.log("[redis-session-store] Connected to Redis");
    } catch (err) {
      console.error("[redis-session-store] Failed to connect:", err);
      throw err;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.connected = false;
    }
  }

  /**
   * Get the Redis key for a session
   */
  private getSessionKey(sessionKey: string): string {
    return `${this.config.sessionPrefix}${sessionKey}`;
  }

  /**
   * Store a message to a session
   */
  async addMessage(sessionKey: string, message: Omit<SessionMessage, "id">): Promise<string> {
    if (!this.client) {
      await this.connect();
    }

    const id = randomUUID();
    const fullMessage: SessionMessage = {
      ...message,
      id,
    };

    const redisKey = this.getSessionKey(sessionKey);

    // Push message to the end of the list
    await this.client!.lPush(redisKey, JSON.stringify(fullMessage));

    // Trim to max messages
    await this.client!.lTrim(redisKey, 0, this.config.maxMessages - 1);

    // Update TTL
    await this.client!.expire(redisKey, this.config.ttlSeconds);

    return id;
  }

  /**
   * Get recent messages from a session
   */
  async getMessages(sessionKey: string, limit: number = 100): Promise<SessionMessage[]> {
    if (!this.client) {
      await this.connect();
    }

    const redisKey = this.getSessionKey(sessionKey);
    const messages = await this.client!.lRange(redisKey, 0, limit - 1);

    return messages.map((msg: string) => JSON.parse(msg) as SessionMessage).reverse();
  }

  /**
   * Get all messages from a session (for archiving)
   */
  async getAllMessages(sessionKey: string): Promise<SessionMessage[]> {
    if (!this.client) {
      await this.connect();
    }

    const redisKey = this.getSessionKey(sessionKey);
    const messages = await this.client!.lRange(redisKey, 0, -1);

    return messages.map((msg: string) => JSON.parse(msg) as SessionMessage).reverse();
  }

  /**
   * Get session metadata
   */
  async getSessionInfo(
    sessionKey: string,
  ): Promise<{ createdAt: string; updatedAt: string; messageCount: number } | null> {
    if (!this.client) {
      await this.connect();
    }

    const redisKey = this.getSessionKey(sessionKey);
    const exists = await this.client!.exists(redisKey);

    if (!exists) {
      return null;
    }

    const ttl = await this.client!.ttl(redisKey);
    const createdAt = new Date(Date.now() - (this.config.ttlSeconds - ttl) * 1000).toISOString();
    const updatedAt = new Date().toISOString();
    const messageCount = await this.client!.lLen(redisKey);

    return { createdAt, updatedAt, messageCount };
  }

  /**
   * Delete a session
   */
  async deleteSession(sessionKey: string): Promise<void> {
    if (!this.client) {
      await this.connect();
    }

    const redisKey = this.getSessionKey(sessionKey);
    await this.client!.del(redisKey);
  }

  /**
   * List all sessions
   */
  async listSessions(): Promise<string[]> {
    if (!this.client) {
      await this.connect();
    }

    const keys = await this.client!.keys(`${this.config.sessionPrefix}*`);
    return keys.map((key: string) => key.replace(this.config.sessionPrefix, ""));
  }

  /**
   * Get total session count
   */
  async getSessionCount(): Promise<number> {
    if (!this.client) {
      await this.connect();
    }

    const keys = await this.client!.keys(`${this.config.sessionPrefix}*`);
    return keys.length;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

// Singleton instance
let storeInstance: RedisSessionStore | null = null;

export function getRedisSessionStore(config?: Partial<RedisSessionStoreConfig>): RedisSessionStore {
  if (!storeInstance) {
    storeInstance = new RedisSessionStore(config);
  }
  return storeInstance;
}
