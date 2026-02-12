---
summary: "CLI reference for `omniclaw onboard` (interactive onboarding wizard)"
read_when:
  - You want guided setup for gateway, workspace, auth, channels, and skills
title: "onboard"
---

# `omniclaw onboard`

Interactive onboarding wizard (local or remote Gateway setup).

Related:

- Wizard guide: [Onboarding](/start/onboarding)

## Examples

```bash
omniclaw onboard
omniclaw onboard --flow quickstart
omniclaw onboard --flow manual
omniclaw onboard --mode remote --remote-url ws://gateway-host:18789
```

Flow notes:

- `quickstart`: minimal prompts, auto-generates a gateway token.
- `manual`: full prompts for port/bind/auth (alias of `advanced`).
- Fastest first chat: `omniclaw dashboard` (Control UI, no channel setup).
