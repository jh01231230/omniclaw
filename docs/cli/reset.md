---
summary: "CLI reference for `omniclaw reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `omniclaw reset`

Reset local config/state (keeps the CLI installed).

```bash
omniclaw reset
omniclaw reset --dry-run
omniclaw reset --scope config+creds+sessions --yes --non-interactive
```
