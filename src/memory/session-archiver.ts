/**
 * Session Archive - Move sessions from Redis to PostgreSQL
 * 
 * Periodically archives session data from Redis (short-term)
 * to PostgreSQL (long-term memory)
 */

import { RedisSessionStore, type SessionMessage } from "./redis-session-store.js";
import { randomUUID } from "node:crypto";

export interface ArchiveConfig {
  redisConfig?: {
    host: string;
    port: number;
    db?: number;
    sessionPrefix?: string;
  };
  postgresqlConfig?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  };
  archiveAfterDays?: number;  // Archive sessions older than this
  batchSize?: number;          // Number of sessions to process per run
}

const DEFAULT_CONFIG = {
  archiveAfterDays: 1,
  batchSize: 50,
};

export class SessionArchiver {
  private redisStore: RedisSessionStore;
  private config: Required<ArchiveConfig>;
  private psqlPath: string;

  constructor(config: ArchiveConfig = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      redisConfig: {
        host: "localhost",
        port: 6379,
        db: 0,
        sessionPrefix: "session:",
        ...config.redisConfig,
      },
      postgresqlConfig: {
        host: "localhost",
        port: 5432,
        database: "long_term_db",
        user: "tars",
        ...config.postgresqlConfig,
      },
    };

    this.redisStore = new RedisSessionStore(this.config.redisConfig);
    this.psqlPath = "/media/tars/TARS_MEMORY/postgresql-installed/bin/psql";
  }

  /**
   * Run the archive process
   */
  async run(): Promise<{
    archived: number;
    failed: number;
    sessions: string[];
  }> {
    console.log("[session-archiver] Starting archive process...");
    
    const archived: string[] = [];
    let failed = 0;

    try {
      // Get all sessions from Redis
      const sessions = await this.redisStore.listSessions();
      console.log(`[session-archiver] Found ${sessions.length} sessions`);

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.archiveAfterDays);

      let processed = 0;
      for (const sessionKey of sessions) {
        if (processed >= this.config.batchSize) {
          break;
        }

        try {
          const info = await this.redisStore.getSessionInfo(sessionKey);
          
          if (!info) {
            continue;
          }

          const sessionDate = new Date(info.createdAt);
          
          // Only archive sessions older than cutoff
          if (sessionDate < cutoffDate) {
            const success = await this.archiveSession(sessionKey);
            
            if (success) {
              archived.push(sessionKey);
              await this.redisStore.deleteSession(sessionKey);
              console.log(`[session-archiver] Archived session: ${sessionKey}`);
            } else {
              failed++;
            }
          }
        } catch (err) {
          console.error(`[session-archiver] Error processing session ${sessionKey}:`, err);
          failed++;
        }
        
        processed++;
      }

      console.log(`[session-archiver] Archive complete: ${archived.length} archived, ${failed} failed`);
      return { archived: archived.length, failed, sessions: archived };
    } catch (err) {
      console.error("[session-archiver] Archive process failed:", err);
      throw err;
    }
  }

  /**
   * Archive a single session to PostgreSQL
   */
  private async archiveSession(sessionKey: string): Promise<boolean> {
    try {
      const messages = await this.redisStore.getAllMessages(sessionKey);
      
      if (messages.length === 0) {
        return true; // Nothing to archive, consider success
      }

      // Format messages as conversation text
      const content = messages
        .map((m) => `[${m.timestamp}] ${m.role}: ${m.content}`)
        .join("\n\n");

      const id = randomUUID();
      const importance = 30; // Lower importance for archived sessions
      const detailLevel = 2; // Detailed
      
      // Get first and last message timestamps
      const firstMsg = messages[0];
      const lastMsg = messages[messages.length - 1];

      // Escape content for SQL
      const escapedContent = content.replace(/'/g, "''").replace(/\x00/g, "");
      const escapedSessionKey = sessionKey.replace(/'/g, "''");

      // Build metadata JSON
      const metadata = {
        sessionKey,
        messageCount: messages.length,
        firstMessage: firstMsg?.timestamp,
        lastMessage: lastMsg?.timestamp,
        archivedAt: new Date().toISOString(),
      };
      const escapedMetadata = JSON.stringify(metadata).replace(/'/g, "''");

      // Insert into long_term.memories
      const cmd = [
        this.psqlPath,
        "-U", this.config.postgresqlConfig.user,
        "-d", this.config.postgresqlConfig.database,
        "-h", this.config.postgresqlConfig.host,
        "-p", String(this.config.postgresqlConfig.port),
        "-c",
        `INSERT INTO long_term.memories 
         (id, content, importance, detail_level, created_at, last_accessed, access_count, needs_embedding) 
         VALUES (
           '${id}', 
           E'${escapedContent}', 
           ${importance}, 
           ${detailLevel}, 
           '${firstMsg?.timestamp || new Date().toISOString()}', 
           '${lastMsg?.timestamp || new Date().toISOString()}', 
           ${messages.length},
           true
         )`,
      ].join(" ");

      const { execSync } = await import("child_process");
      execSync(cmd, { encoding: "utf-8" });

      console.log(`[session-archiver] Stored session ${sessionKey} with ${messages.length} messages`);
      return true;
    } catch (err) {
      console.error(`[session-archiver] Failed to archive session ${sessionKey}:`, err);
      return false;
    }
  }

  /**
   * Get archive statistics
   */
  async getStats(): Promise<{
    redisSessions: number;
    redisMessages: number;
    archivedToday: number;
  }> {
    const sessions = await this.redisStore.listSessions();
    let redisMessages = 0;

    for (const session of sessions.slice(0, 10)) {
      const info = await this.redisStore.getSessionInfo(session);
      if (info) {
        redisMessages += info.messageCount;
      }
    }

    // Estimate total messages
    const estimatedMessages = sessions.length > 0 
      ? Math.round(redisMessages * (sessions.length / Math.max(sessions.length, 10)))
      : 0;

    return {
      redisSessions: sessions.length,
      redisMessages: estimatedMessages,
      archivedToday: 0, // Would need to query PostgreSQL for this
    };
  }
}

// Singleton
let archiverInstance: SessionArchiver | null = null;

export function getSessionArchiver(config?: ArchiveConfig): SessionArchiver {
  if (!archiverInstance) {
    archiverInstance = new SessionArchiver(config);
  }
  return archiverInstance;
}
