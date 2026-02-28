---
name: memory-extract
description: "Extract keyframes from conversations to long-term memory"
homepage: https://docs.omniclaw.ai/hooks#memory-extract
metadata:
  {
    "omniclaw":
      {
        "emoji": "🧠",
        "events": ["session:end", "heartbeat"],
        "requires": { "config": ["agents.defaults.memorySearch.deployment"] },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OmniClaw" }],
      },
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

- **core**: Reconstructable keyframe with type-aware strategy
- **details**: Anchors for names/products/numbers/suggestions/symbols
- **quote**: Short raw quote for high-fidelity recall

## Output Format (JSONL)

Each line is a structured keyframe record:

- `schema`: `omniclaw.memory.keyframe.v1`
- `keyframe`: sequence/index, role, content type, strategy, core, details, quote
- `keyframe.anchors`: names/products, numbers, suggestions, symbols
- `sessionContext`: session overview/timeline/keyword capsule for replay

Default output path: `~/.omniclaw/memory/extracted-keyframes.jsonl`

## Compression Strategies

The extractor applies different compression strategy per content type:

- **question**: preserves direct question text and `?` tone signals
- **issue**: keeps error signatures (`TypeError`, `handler.ts:42`, etc.)
- **task/suggestion**: keeps actionable phrasing and timing details
- **decision/preference/fact**: keeps rationale, preferences, and concrete data

Each extracted memory stores:

- `core` (primary compressed sentence)
- `details` (structured detail anchors)
- `keywords` (terms + symbols + concrete names/numbers)
- `strategy` + `contentType` metadata

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
