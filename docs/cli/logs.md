---
summary: "CLI reference for `omniclaw logs` (tail gateway logs via RPC)"
read_when:
  - You need to tail Gateway logs remotely (without SSH)
  - You want JSON log lines for tooling
title: "logs"
---

# `omniclaw logs`

Tail Gateway file logs over RPC (works in remote mode).

Related:

- Logging overview: [Logging](/logging)

## Examples

```bash
omniclaw logs
omniclaw logs --follow
omniclaw logs --json
omniclaw logs --limit 500
```
