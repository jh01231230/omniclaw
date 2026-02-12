---
summary: "CLI reference for `omniclaw agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `omniclaw agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
omniclaw agents list
omniclaw agents add work --workspace ~/.omniclaw/workspace-work
omniclaw agents set-identity --workspace ~/.omniclaw/workspace --from-identity
omniclaw agents set-identity --agent main --avatar avatars/omniclaw.png
omniclaw agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.omniclaw/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
omniclaw agents set-identity --workspace ~/.omniclaw/workspace --from-identity
```

Override fields explicitly:

```bash
omniclaw agents set-identity --agent main --name "OmniClaw" --emoji "🦞" --avatar avatars/omniclaw.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "OmniClaw",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/omniclaw.png",
        },
      },
    ],
  },
}
```
