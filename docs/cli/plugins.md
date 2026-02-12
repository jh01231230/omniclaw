---
summary: "CLI reference for `omniclaw plugins` (list, install, enable/disable, doctor)"
read_when:
  - You want to install or manage in-process Gateway plugins
  - You want to debug plugin load failures
title: "plugins"
---

# `omniclaw plugins`

Manage Gateway plugins/extensions (loaded in-process).

Related:

- Plugin system: [Plugins](/plugin)
- Plugin manifest + schema: [Plugin manifest](/plugins/manifest)
- Security hardening: [Security](/gateway/security)

## Commands

```bash
omniclaw plugins list
omniclaw plugins info <id>
omniclaw plugins enable <id>
omniclaw plugins disable <id>
omniclaw plugins doctor
omniclaw plugins update <id>
omniclaw plugins update --all
```

Bundled plugins ship with OmniClaw but start disabled. Use `plugins enable` to
activate them.

All plugins must ship a `omniclaw.plugin.json` file with an inline JSON Schema
(`configSchema`, even if empty). Missing/invalid manifests or schemas prevent
the plugin from loading and fail config validation.

### Install

```bash
omniclaw plugins install <path-or-spec>
```

Security note: treat plugin installs like running code. Prefer pinned versions.

Supported archives: `.zip`, `.tgz`, `.tar.gz`, `.tar`.

Use `--link` to avoid copying a local directory (adds to `plugins.load.paths`):

```bash
omniclaw plugins install -l ./my-plugin
```

### Update

```bash
omniclaw plugins update <id>
omniclaw plugins update --all
omniclaw plugins update <id> --dry-run
```

Updates only apply to plugins installed from npm (tracked in `plugins.installs`).
