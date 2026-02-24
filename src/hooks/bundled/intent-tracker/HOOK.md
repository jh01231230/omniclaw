---
name: intent-tracker
description: "Automatically detects user intents and generates natural follow-ups"
homepage: https://docs.omniclaw.ai/hooks/intent-tracker
metadata:
  omniclaw:
    emoji: "🎯"
    events:
      - "command"
    requires:
      bins:
        - "python3"
    install:
      - id: bundled
        kind: bundled
---

# Intent Tracker Hook

Automatically detects user intents (projects, habits, todos) and generates natural follow-up reminders during casual conversations.

## How It Works

1. **Intent Detection**: Analyzes user messages for intent patterns:
   - Project intentions ("我想做个XX")
   - Habit intentions ("我想健身")
   - Progress updates ("完成了")

2. **Smart Follow-up**: On casual messages (greetings, "今天天气如何"), checks for pending projects/habits and generates natural reminders.

3. **No Manual Tracking**: Users don't need to explicitly invoke tracking - it happens automatically.

## Usage

Just talk naturally! The hook works automatically:

```
用户: "我想做个项目管理工具"
AI: "好的！我来帮你规划项目管理工具..."

用户: "今天天气不错"
AI: "对了，项目管理工具进展怎么样啦？现在是规划阶段。"
```

## Data Storage

- `~/.omniclaw/data/projects.json` - Active projects
- `~/.omniclaw/data/habits.json` - Habit tracking

## Commands

View tracking status:

```bash
python3 skills/intent_tracker/safeclaw_integration.py status
```

Manual intent detection:

```bash
python3 skills/intent_tracker/safeclaw_integration.py process -t "你的消息"
```

## Disable Hook

```bash
omniclaw hooks disable intent-tracker
```
