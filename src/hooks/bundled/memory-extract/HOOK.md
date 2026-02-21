---
name: memory-extract
description: "Extract keyframes from conversations to long-term memory"
homepage: https://docs.omniclaw.ai/hooks#memory-extract
metadata:
  {
    "omniclaw": {
      "emoji": "🧠",
      "events": ["session:end", "heartbeat"],
      "requires": {
        "config": ["agents.defaults.memorySearch.deployment"]
      },
      "install": [
        { "id": "bundled", "kind": "bundled", "label": "Bundled with OmniClaw" }
      ]
    }
  }
---

# Memory Extract Hook

Extracts keyframes from conversations and stores them in PostgreSQL long-term memory.

## Configuration

Automatically enabled when `memorySearch.deployment = "full"`.

## Memory Triggers

The hook extracts memories when:
- Important decisions are made
- Patterns appear 3+ times
- Emotional peaks detected
- New skills learned
- Relationship changes
- Failed attempts (lessons learned)

## Detail Levels

- **keyframe**: Key decisions, <200 chars
- **detail**: Full context, <2000 chars
- **raw**: Raw conversation, important only

## Database Schema

Requires `long_term_memory` table with pgvector:
```sql
CREATE TABLE long_term_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    importance_score FLOAT DEFAULT 0.5,
    detail_level VARCHAR(20) DEFAULT 'detail'
);
```
