# Migration Notes (SafeClaw → OmniClaw)

This document summarizes migration decisions and candidates for future cleanup.

## Naming Changes

- **Product/CLI:** `openclaw` → `omniclaw`
- **State directory:** `~/.openclaw` → `~/.omniclaw`
- **Config file:** `openclaw.json` → `omniclaw.json`
- **Environment variables:** `OPENCLAW_*` → `OMNICLAW_*`
- **Legacy compatibility:** `OPENCLAW_*` and `~/.openclaw` are still read for migration

## Modules to Review for Removal

Candidates for deprecation or removal in future releases:

| Module | Location | Notes |
|--------|----------|-------|
| **Intent Tracker Hook** | `src/hooks/bundled/intent-tracker/` | References `skills/intent_tracker/safeclaw_integration.py` — may need path update or removal if unused |
| **Legacy state dirs** | `src/config/paths.ts` | `.clawdbot`, `.moltbot`, `.moldbot` kept for migration; consider removing after a deprecation period |
| **CLAWDBOT_* env vars** | Various | Fallback reads for legacy installs; can be dropped in a future major |

## Safe to Remove (if not used)

- `data/` — Repo-local data; move to `~/.omniclaw` if needed
- `memory/` — Repo-local memory; should use state dir
- Any `./*.json` in repo root that hold runtime state

## Security-Related

- Run `omniclaw security audit` and `omniclaw doctor` after migration
- Ensure no secrets or real config in repo
