# Intent Tracker - Project & Habit Awareness

Automatically detects user intentions and provides intelligent follow-ups.

## Two Modes

### 1. Project Tracker (`project_tracker.py`)

For one-time projects with clear phases.

**Detects**: "我要做个XX", "原型图画完了"
**Response**: Auto-generates project plan, tracks phase completion

### 2. Habit Tracker (`habit_tracker.py`)

For long-term commitments requiring daily effort.

**Detects**: "我想健身", "今天跑步了"
**Response**: Logs completion, tracks streaks, reminds daily

## Quick Start

```python
# Project tracking
from project_tracker import ProjectAwareAssistant
assistant = ProjectAwareAssistant()
result = assistant.process_message("我想做个管理系统")
print(result['response'])

# Habit tracking
from habit_tracker import HabitAwareAssistant
assistant = HabitAwareAssistant()
result = assistant.process_message("今天跑步了")
print(result['response'])
```

## CLI

```bash
# Projects
python project_tracker.py create -t "做个XX"
python project_tracker.py list
python project_tracker.py followup

# Habits  
python habit_tracker.py create -t "我想健身"
python habit_tracker.py list
python habit_tracker.py dashboard
```

## Data Storage

- `/home/tars/Workspace/safeclaw/data/projects.json` - Projects
- `/home/tars/Workspace/safeclaw/data/habits.json` - Habits
- `/home/tars/Workspace/safeclaw/data/habit_logs.json` - Habit logs
