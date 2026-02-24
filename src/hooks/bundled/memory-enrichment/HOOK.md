---
name: memory-enrichment
description: "Full mode: enrich stored memories with web search, resolve conflicts, and maintain pgvector knowledge base"
homepage: https://docs.omniclaw.ai/hooks#memory-enrichment
metadata:
  {
    "omniclaw":
      {
        "emoji": "🧠",
        "events": ["cron:hourly", "heartbeat"],
        "requires": { 
          "config": ["agents.defaults.memorySearch.deployment=full"],
          "bins": ["curl"]
        },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OmniClaw" }],
      },
  }
---

# Memory Enrichment Hook (Full Mode)

Automatically enriches stored memories in PostgreSQL/pgvector with web search and conflict resolution.

## Features

1. **Semantic Deduplication** - Check new memories against pgvector before storing
2. **Web Enrichment** - Search for relevant background info on important concepts
3. **Conflict Detection** - Identify contradictory information in stored memories
4. **Knowledge Synthesis** - Update existing memories with newly discovered context

## Configuration

In full deployment mode, this hook runs automatically. No additional config needed.

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "deployment": "full"
      }
    }
  }
}
```

## Events

- `cron:hourly` - Run every hour
- `heartbeat` - Or run on heartbeat

## Requirements

- PostgreSQL with pgvector extension
- Web search capability (curl for Brave API)
- LLM for content synthesis
