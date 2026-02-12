---
summary: "CLI reference for `omniclaw health` (gateway health endpoint via RPC)"
read_when:
  - You want to quickly check the running Gateway’s health
title: "health"
---

# `omniclaw health`

Fetch health from the running Gateway.

```bash
omniclaw health
omniclaw health --json
omniclaw health --verbose
```

Notes:

- `--verbose` runs live probes and prints per-account timings when multiple accounts are configured.
- Output includes per-agent session stores when multiple agents are configured.
