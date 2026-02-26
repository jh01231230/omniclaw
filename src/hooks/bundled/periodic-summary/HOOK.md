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
          "outputPath": "~/.omniclaw/memory/summaries.md"
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

Saves summarized conversations to the configured output path for later LLM processing or direct review.
