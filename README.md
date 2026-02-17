# OmniClaw — Self-Hosted Personal AI Assistant

<p align="center">
  <strong>Efficient · Professional · Secure · Modular</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
</p>

**OmniClaw** is a deep-customized version of `OpenClaw`, rebuilt with the enhanced capabilities, security reinforcement, a cleaner onboarding/configuration experience, and multi-channel automation.

It is a self-hosted personal AI assistant you run on your own devices. It answers you on the channels you already use: WhatsApp, Telegram, Slack, Discord, Signal, iMessage, and more. The Gateway is the control plane, and the product is the assistant.

OmniClaw is designed to be efficient, secure, modular, and production-friendly for serious self-hosted AI assistant deployments. If you want a personal, single-user assistant that feels local, fast, and always-on, this is it.

---

## Quick Start

**Requirements:** Node.js ≥22, pnpm (or bun)

```bash
git clone https://github.com/openclaw/omniclaw.git
cd omniclaw

pnpm install
pnpm build
pnpm omniclaw onboard --install-daemon

# Start the gateway
pnpm omniclaw gateway --port 18789 --verbose

# Send a message
pnpm omniclaw agent --message "Hello from OmniClaw"
```

The onboarding wizard (`pnpm omniclaw onboard`) walks through gateway, model, channels, and skills. **Recommended for first-time users.**

---

## Installation from source

```bash
git clone https://github.com/openclaw/omniclaw.git
cd omniclaw

pnpm install
pnpm ui:build   # Auto-installs UI deps on first run
pnpm build

# Run onboarding (creates ~/.omniclaw, config, workspace)
pnpm omniclaw onboard --install-daemon

# Optional: Install shell completion
OMNICLAW_FORCE_BUILD=1 pnpm omniclaw completion --install --shell bash --yes
```

**Dev loop** (auto-reload on changes):
```bash
pnpm gateway:watch
```

### Convenience scripts

- **`./start.sh`** — Quick launcher: checks Node.js, installs deps and builds if needed, then starts the gateway on port 18789. Use when you want to run OmniClaw directly without systemd.
- **`./install-system-service.sh`** — Installs OmniClaw as a systemd service (`omniclaw-gateway`). Requires sudo. Auto-detects `$USER`, script directory, and Node.js path. Creates `/etc/systemd/system/omniclaw-gateway.service` and enables/starts it.

```bash
./start.sh
# or, to run as a system service:
sudo ./install-system-service.sh
```

---

## Configuration

All runtime state and config live under `~/.omniclaw/` (configurable via `OMNICLAW_STATE_DIR`).

Minimal config `~/.omniclaw/omniclaw.json`:

```json5
{
  agent: {
    model: "anthropic/claude-opus-4-5",
  },
}
```

| Path | Purpose |
|------|---------|
| `~/.omniclaw/omniclaw.json` | Main config (JSON5) |
| `~/.omniclaw/workspace` | Agent workspace, skills, prompts |
| `~/.omniclaw/credentials` | OAuth tokens, channel creds |
| `~/.omniclaw/sessions` | Session transcripts, memory |

**Environment variables:**
- `OMNICLAW_STATE_DIR` — Override state root (default: `~/.omniclaw`)
- `OMNICLAW_CONFIG_PATH` — Override config file path
- `OMNICLAW_GATEWAY_PORT` — Override gateway port (default: 18789)

---

## Usage examples

```bash
# Run the gateway
pnpm omniclaw gateway --port 18789

# Chat with the agent
pnpm omniclaw agent --message "Summarize my week" --thinking high

# Send a message to a channel
pnpm omniclaw message send --target +1234567890 --message "Hello"

# Check status
pnpm omniclaw gateway status
pnpm omniclaw channels status

# Health checks and repairs
pnpm omniclaw doctor
pnpm omniclaw doctor --fix

# Interactive TUI
pnpm omniclaw tui
```

---

## Highlights

| Feature | Description |
|---------|-------------|
| **Local-first Gateway** | Single control plane for sessions, channels, tools, and events |
| **Multi-channel inbox** | WhatsApp, Telegram, Slack, Discord, Signal, iMessage, WebChat, and more |
| **Guided onboarding** | Step-by-step wizard with clear options and hints |
| **Pi agent runtime** | RPC mode with tool streaming and block streaming |
| **Skills platform** | Bundled, managed, and workspace skills |
| **Security defaults** | Loopback bind, pairing/allowlists, log redaction |

---

## Security

- **Gateway bind:** Loopback (`127.0.0.1`) by default. Public bind requires explicit opt-in.
- **DM policy:** Pairing/allowlists for unknown senders (configurable per channel).
- **Log redaction:** Sensitive headers and fields masked.
- **Skills sandbox:** Local-only install; restricted filesystem and network.

Run regularly:
```bash
pnpm omniclaw security audit
pnpm omniclaw security audit --deep
pnpm omniclaw security audit --fix
```

---

## Project structure

```
src/
├── cli/           # CLI wiring, commands
├── commands/      # Command handlers (onboard, doctor, agent, etc.)
├── config/        # Config load/save, paths, schema
├── gateway/       # WebSocket control plane, server
├── agents/        # Pi agent, tools, sessions
├── channels/      # WhatsApp, Telegram, Slack, Discord, etc.
├── wizard/        # Onboarding wizard
└── ...
```

---

## Acknowledgments

- Original OpenClaw project: https://github.com/openclaw/openclaw
- Special thanks to the original OpenClaw author for creating the foundation and vision that made OmniClaw possible.

---

## License

MIT — see [LICENSE](LICENSE).
