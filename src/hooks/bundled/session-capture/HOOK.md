---
name: session-capture
description: "Capture conversation messages to PostgreSQL for long-term memory (full mode)"
homepage: https://docs.omniclaw.ai/hooks#session-capture
metadata:
  {
    "omniclaw":
      {
        "emoji": "📡",
        "events": ["agent", "heartbeat", "cron", "command"],
        "requires": { "config": ["agents.defaults.memorySearch.deployment=full"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OmniClaw" }],
      },
  }
---

# Session Capture Hook

Captures conversation messages in real-time and stores them to Redis for short-term storage, with automatic archiving to PostgreSQL for long-term memory.

## What It Does

1. **Real-time capture** - Stores each user/assistant message to Redis as it's sent
2. **Session organization** - Groups messages by session key
3. **Automatic expiry** - Sessions automatically expire after 7 days (configurable)
4. **Archival** - Old sessions are archived to PostgreSQL for long-term memory

## Storage Strategy

This hook implements a two-tier memory system:

| Tier       | Storage    | Retention | Use Case                           |
| ---------- | ---------- | --------- | ---------------------------------- |
| Short-term | Redis      | 7 days    | Recent conversations, quick access |
| Long-term  | PostgreSQL | Forever   | Archived memories, semantic search |

## Requirements

- **Redis** - Must be running and accessible
- **memorySearch.redis** - Configuration in omniclaw.json

## Configuration

Example configuration in omniclaw.json:

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "deployment": "full",
        "redis": {
          "host": "localhost",
          "port": 6379,
          "db": 0,
          "sessionPrefix": "session:",
          "maxmemory": "512mb",
          "evictionPolicy": "allkeys-lru"
        }
      }
    }
  },
  "hooks": {
    "internal": {
      "entries": {
        "session-capture": {
          "enabled": true
        }
      }
    }
  }
}
```

## Redis Keys

Messages are stored with keys pattern: `session:{sessionKey}`

Each session stores up to 1000 messages (configurable) as a Redis list.

## Archiving

Use the session archiver to move old sessions from Redis to PostgreSQL:

```typescript
import { getSessionArchiver } from "./memory/session-archiver.js";

const archiver = getSessionArchiver();
await archiver.run();
```

Recommended: Run archival daily via cron job.

## Disabling

To disable this hook:

```json
{
  "hooks": {
    "internal": {
      "entries": {
        "session-capture": { "enabled": false }
      }
    }
  }
}
```
