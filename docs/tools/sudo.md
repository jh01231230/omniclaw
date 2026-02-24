---
summary: "Sudo/root password policy for commands needing elevation"
read_when:
  - Configuring tools.sudo or sudo onboarding
  - Implementing exec with sudo fallback
title: "Sudo Password Policy"
---

# Sudo password policy

OmniClaw can store your sudo/root password so that commands needing elevation can run when allowed by policy. This is configured during onboarding or via `tools.sudo.mode`.

## Modes

| Mode      | Behavior                                                                      |
| --------- | ----------------------------------------------------------------------------- |
| `never`   | Do not store or use sudo password. Commands needing elevation will fail.      |
| `consent` | Store password; use only after you explicitly approve each sudo use in chat.  |
| `always`  | Store password; use automatically when commands need sudo. No per-use prompt. |

## Configuration

Set during onboarding (`omniclaw onboard`) or in config:

```json5
{
  tools: {
    sudo: {
      mode: "never", // or "consent" | "always"
    },
  },
}
```

## Storage

When `mode` is `consent` or `always`, the password is stored at:

```
~/.omniclaw/credentials/sudo.json
```

The file is created with permissions `0o600` (user-only read/write). Never commit this file or share it.

## Changing the policy

- Re-run `omniclaw onboard` and pick a different option.
- Or edit `~/.omniclaw/omniclaw.json` and `~/.omniclaw/credentials/sudo.json` directly.
- To clear the stored password: set `mode` to `never` and delete or empty the credentials file.

## Security notes

- `always` mode means the agent can run sudo without asking. Use only if you fully trust the agent and its prompts.
- `consent` mode requires approval in chat before each use. Approval flow forwards to configured channels (Discord, Telegram, etc.) when exec approvals are forwarded.
- The password is stored in plaintext with restrictive file permissions. Prefer `consent` when possible.

## Related

- [Exec approvals](/tools/exec-approvals)
- [Elevated mode](/tools/elevated)
- [Gateway configuration](/gateway/configuration)
