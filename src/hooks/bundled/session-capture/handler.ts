/**
 * Session Capture Hook
 *
 * Redis sync is handled by initRedisTranscriptSync (memory/redis-transcript-sync.ts),
 * which subscribes to onSessionTranscriptUpdate and mirrors session transcript files
 * to Redis in real-time—same trigger as the memory manager.
 *
 * This hook remains registered for "agent" events for backwards compatibility but
 * does not duplicate the sync; the transcript-events subscription is the single
 * source of truth.
 */

import type { HookHandler, HookEvent } from "../../hooks.js";

const captureSessionMessage: HookHandler = async (_event: HookEvent): Promise<void> => {
  // No-op: redis-transcript-sync handles sync via onSessionTranscriptUpdate
};

export default captureSessionMessage;
