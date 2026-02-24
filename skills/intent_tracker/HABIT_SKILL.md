# Habit Tracker - Long-term Commitment Tracking

## Description

Tracks daily habits and provides regular encouragement to help build lasting habits.

## Features

- **Habit Detection**: Automatically detects fitness, health, learning, and productivity habits
- **Daily Logging**: Track completion with streaks
- **Smart Reminders**: Natural follow-ups at conversation opportunities
- **Streak Tracking**: Track current and longest streaks
- **Stop Management**: User can stop habits anytime

## Usage

```python
from habit_tracker import HabitAwareAssistant

assistant = HabitAwareAssistant()

# Process message
result = assistant.process_message("今天跑了5公里")
# → {"action": "log_habit", "response": "太棒了！...", "habit_id": "..."}
```

## CLI Commands

```bash
# Create new habit
python habit_tracker.py create -t "我想开始健身"

# Log habit completion
python habit_tracker.py log -i habit_abc123

# List active habits
python habit_tracker.py list

# View dashboard
python habit_tracker.py dashboard
```

## Supported Habit Types

| Category | Keywords               | Examples       |
| -------- | ---------------------- | -------------- |
| Fitness  | 健身, 运动, 跑步, 瑜伽 | 每日运动30分钟 |
| Health   | 减肥, 早睡, 多喝水     | 每日8000步     |
| Learning | 学习, 背单词, 读书     | 背单词20个     |

## How It Works

```
1. User: "我想开始健身"
   → Detect habit intent
   → Create tracking record
   → Response: "好的！每日目标30分钟"

2. User: "今天跑了5公里"
   → Detect completion
   → Update streak
   → Response: "太棒了！意志力+1！"

3. User: "今天天气不错"
   → Detect follow-up opportunity
   → Response: "提醒一下，健身今天还没做哦~"

4. User: "不练了"
   → Stop tracking
   → Response: "好的，已停止提醒"
```

## Data Storage

Habits stored in: `/home/tars/Workspace/safeclaw/data/`

- `habits.json` - Habit definitions
- `habit_logs.json` - Daily logs

## Integration

Add to `HEARTBEAT.md`:

```markdown
# Habit Follow-up

Check pending: `python habit_tracker.py list`
Generate nudge: `assistant.process_message("今天天气不错")`
```
