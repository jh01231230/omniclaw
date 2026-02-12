/**
 * Intent Tracking Hook for SafeClaw
 * Automatically detects user intents and generates follow-ups on casual messages
 */

import { registerInternalHook } from "./hooks/internal-hooks.js";
import { maybeGenerateFollowUp, isCasualMessage } from "./intent-tracking.js";

/**
 * Hook into command processing to detect intents
 */
registerInternalHook("command", async (event) => {
  // Only process user commands
  const ctx = event.context as { message?: string; isUser?: boolean };
  
  if (!ctx.message || !ctx.isUser) {
    return;
  }

  // Check if this is a casual message that might need follow-up
  if (isCasualMessage(ctx.message)) {
    const followUp = await maybeGenerateFollowUp(ctx.message, true);
    
    if (followUp) {
      // Add follow-up message to the event
      event.messages.push(followUp);
    }
  }
});

/**
 * Also register for session events to handle context updates
 */
registerInternalHook("session", async (event) => {
  const ctx = event.context as { lastUserMessage?: string };
  
  if (!ctx.lastUserMessage) {
    return;
  }

  // Could store intent context here for later retrieval
});
