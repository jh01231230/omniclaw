---
name: periodic-summary
description: "Periodically summarize recent conversations and save to memory"
homepage: https://docs.omniclaw.ai/hooks#periodic-summary
metadata:
  {
    "omniclaw":
      {
        "emoji": "📝",
        "events": ["cron:hourly", "heartbeat"],
        "requires": { 
          "config": ["agents.defaults.memorySearch.periodicSummary"]
        },
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OmniClaw" }],
      },
  }
---

# Periodic Summary Hook

Automatically summarizes recent conversations and saves to memory.

## Configuration

Add to `omniclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "memorySearch": {
        "periodicSummary": {
          "enabled": true,
          "intervalHours": 24,
          "outputPath": "~/.omniclaw/memory/periodic-summary.jsonl"
        }
      }
    }
  }
}
```

## Events

- `cron:hourly` - Run every hour (or configured interval)
- `heartbeat` - Or run on heartbeat

## Output

Saves a reconstructable summary snapshot (JSONL) to the configured output path.

Each line uses schema `omniclaw.memory.periodic-summary.v1` and includes:

- Core narrative (decisions and progress)
- Session replay capsules with ordered keyframes
- Detail anchors (names/products/numbers/suggestions/symbols)
- Keyword capsule (critical terms and punctuation signals like `?`)
- Prompt + metadata for deterministic reconstruction
