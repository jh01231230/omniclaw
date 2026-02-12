---
summary: "CLI reference for `omniclaw security` (audit and fix common security footguns)"
read_when:
  - You want to run a quick security audit on config/state
  - You want to apply safe “fix” suggestions (chmod, tighten defaults)
title: "security"
---

# `omniclaw security`

Security tools (audit + optional fixes).

Related:

- Security guide: [Security](/gateway/security)

## Audit

```bash
omniclaw security audit
omniclaw security audit --deep
omniclaw security audit --fix
```

The audit warns when multiple DM senders share the main session and recommends `session.dmScope="per-channel-peer"` (or `per-account-channel-peer` for multi-account channels) for shared inboxes.
It also warns when small models (`<=300B`) are used without sandboxing and with web/browser tools enabled.
