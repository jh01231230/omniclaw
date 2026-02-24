---
name: tars-memory
description: "Auto-start TARS Memory services (PostgreSQL, Redis) on gateway startup"
homepage: https://docs.omniclaw.ai/hooks#tars-memory
metadata:
  {
    "omniclaw":
      {
        "emoji": "💾",
        "events": ["gateway:startup"],
        "requires": {},
        "install": [{ "id": "bundled", "kind": "bundled", "label": "Bundled with OmniClaw" }],
      },
  }
---

# TARS Memory Auto-Start Hook

Automatically starts TARS Memory services (PostgreSQL, Redis) when the gateway starts.

This hook ensures:

- TARS Memory (Optane) is mounted
- PostgreSQL 17 is started
- Redis is started

Required for "full" memory deployment mode.
