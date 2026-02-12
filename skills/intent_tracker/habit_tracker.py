#!/usr/bin/env python3
"""
Habit Tracker - Long-term commitment tracking
Tracks daily habits and provides regular encouragement.
"""

import re
import json
import os
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Tuple


HABIT_CATEGORIES = {
    "fitness": {
        "name": "健身运动",
        "keywords": ["健身", "运动", "锻炼", "跑步", "瑜伽", "减脂", "增肌", "力量训练"],
        "frequency": "daily",
        "reminder_times": ["07:00", "18:00"],
        "templates": [
            {"name": "每日运动", "duration_min": 30, "unit": "分钟"},
            {"name": "跑步", "duration_min": 20, "unit": "公里"},
        ]
    },
    "health": {
        "name": "健康生活",
        "keywords": ["减肥", "减重", "控制饮食", "早睡", "早起", "多喝水", "养生"],
        "frequency": "daily",
        "reminder_times": ["09:00", "14:00", "21:00"],
        "templates": [
            {"name": "每日步数", "duration_min": 8000, "unit": "步"},
            {"name": "喝水量", "duration_min": 8, "unit": "杯"},
        ]
    },
    "learning": {
        "name": "学习提升",
        "keywords": ["学习", "读书", "背单词", "练琴", "学英语", "学编程", "考证"],
        "frequency": "daily",
        "reminder_times": ["08:00", "20:00"],
        "templates": [
            {"name": "背单词", "duration_min": 20, "unit": "个"},
            {"name": "阅读", "duration_min": 30, "unit": "页"},
        ]
    },
}


@dataclass
class Habit:
    """A tracked habit."""
    id: str
    name: str
    category: str
    description: str
    frequency: str
    target_value: float
    unit: str
    reminder_times: List[str]
    start_date: str
    status: str
    streak: int
    longest_streak: int
    total_completed: int
    last_completed_date: Optional[str]
    created_at: str
    updated_at: str
    stop_date: Optional[str]
    cancel_reason: Optional[str]


@dataclass
class HabitLog:
    """A single habit log entry."""
    id: str
    habit_id: str
    date: str
    completed: bool
    value: Optional[float]
    notes: str
    created_at: str


class HabitManager:
    """Manages habits and tracks progress."""
    
    def __init__(self, data_dir: str = None):
        self.data_dir = data_dir or "/home/tars/Workspace/safeclaw/data"
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.habits_file = os.path.join(self.data_dir, "habits.json")
        self.logs_file = os.path.join(self.data_dir, "habit_logs.json")
        
        self.habits = self._load_json(self.habits_file, {})
        self.logs = self._load_json(self.logs_file, [])
    
    def _load_json(self, filepath: str, default):
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return default
    
    def _save_json(self, filepath: str, data):
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def create_habit(self, category: str, name: str, target_value: float = None, unit: str = "次") -> Tuple[Habit, str]:
        import uuid
        habit_id = f"habit_{uuid.uuid4().hex[:8]}"
        
        category_info = HABIT_CATEGORIES.get(category, HABIT_CATEGORIES["fitness"])
        if target_value is None:
            target_value = category_info["templates"][0]["duration_min"]
            unit = category_info["templates"][0]["unit"]
        
        habit = Habit(
            id=habit_id,
            name=name,
            category=category,
            description=f"培养{name}习惯",
            frequency="daily",
            target_value=target_value or 1,
            unit=unit,
            reminder_times=category_info["reminder_times"],
            start_date=datetime.utcnow().isoformat(),
            status="active",
            streak=0,
            longest_streak=0,
            total_completed=0,
            last_completed_date=None,
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat(),
            stop_date=None,
            cancel_reason=None
        )
        
        self.habits[habit_id] = asdict(habit)
        self._save_json(self.habits_file, self.habits)
        
        intro = f"好的！我来帮你养成{name}这个习惯。\n目标：每日{target_value}{unit}\n坚持就是胜利！"
        return habit, intro
    
    def log_habit(self, habit_id: str, completed: bool = True, value: float = None, notes: str = "") -> Tuple[bool, str]:
        import uuid
        if habit_id not in self.habits:
            return False, "习惯不存在"
        
        habit = self.habits[habit_id]
        today = datetime.utcnow().strftime("%Y-%m-%d")
        
        # Check if already logged today
        for log in self.logs:
            if log["habit_id"] == habit_id and log["date"] == today:
                log["completed"] = completed
                log["value"] = value or habit["target_value"]
                log["notes"] = notes
                self._save_json(self.logs_file, self.logs)
                return True, f"已更新今日记录！"
        
        log_entry = {
            "id": f"log_{uuid.uuid4().hex[:8]}",
            "habit_id": habit_id,
            "date": today,
            "completed": completed,
            "value": value or habit["target_value"],
            "notes": notes,
            "created_at": datetime.utcnow().isoformat()
        }
        self.logs.append(log_entry)
        
        if completed:
            habit["total_completed"] += 1
            habit["last_completed_date"] = today
            
            yesterday = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
            last_date = habit.get("last_completed_date")
            if last_date == yesterday:
                habit["streak"] += 1
            elif last_date != today:
                habit["streak"] = 1
            
            if habit["streak"] > habit["longest_streak"]:
                habit["longest_streak"] = habit["streak"]
        
        habit["updated_at"] = datetime.utcnow().isoformat()
        self._save_json(self.habits_file, self.habits)
        self._save_json(self.logs_file, self.logs)
        
        messages = [
            f"太棒了！完成{name}！",
            f"意志力+1！坚持第{habit['streak']}天！",
            f"打卡成功！习惯养成中！",
        ]
        import random
        return True, random.choice(messages)
    
    def stop_habit(self, habit_id: str, reason: str = "用户主动停止") -> bool:
        if habit_id not in self.habits:
            return False
        
        self.habits[habit_id]["status"] = "cancelled"
        self.habits[habit_id]["stop_date"] = datetime.utcnow().isoformat()
        self.habits[habit_id]["cancel_reason"] = reason
        self._save_json(self.habits_file, self.habits)
        return True
    
    def get_active_habits(self) -> List[Habit]:
        return [Habit(**h) for h in self.habits.values() if h["status"] == "active"]
    
    def get_pending_habits(self) -> List[Habit]:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        completed_ids = {log["habit_id"] for log in self.logs if log["date"] == today}
        return [Habit(**h) for h in self.habits.values() if h["status"] == "active" and h["id"] not in completed_ids]
    
    def get_dashboard(self) -> Dict:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        today_logs = [log for log in self.logs if log["date"] == today]
        pending = self.get_pending_habits()
        
        return {
            "total_habits": len(self.habits),
            "active_habits": len([h for h in self.habits.values() if h["status"] == "active"]),
            "completed_today": len(today_logs),
            "pending_today": len(pending),
            "total_streak": sum(h["streak"] for h in self.habits.values() if h["status"] == "active")
        }


class HabitAwareAssistant:
    def __init__(self, data_dir: str = None):
        self.habit_manager = HabitManager(data_dir)
    
    def process_message(self, text: str) -> Dict:
        result = {"action": "none", "response": None, "habit_id": None, "data": {}}
        
        # Check for completion
        completion_signals = ["做完了", "完成了", "练完了", "背完了", "跑了", "打了卡"]
        if any(signal in text for signal in completion_signals):
            for habit_id, habit in self.habit_manager.habits.items():
                if habit["status"] == "active" and habit["name"] in text:
                    success, message = self.habit_manager.log_habit(habit_id)
                    if success:
                        result["action"] = "log_habit"
                        result["response"] = message
                        result["habit_id"] = habit_id
                        return result
        
        # Check for stop signal
        stop_signals = ["不练了", "不跑了", "放弃了", "停止提醒", "别提醒了"]
        if any(signal in text for signal in stop_signals):
            for habit_id, habit in self.habit_manager.habits.items():
                if habit["status"] == "active":
                    self.habit_manager.stop_habit(habit_id)
                    result["action"] = "stop_habit"
                    result["response"] = f"好的，已停止{habit['name']}的提醒。"
                    return result
        
        # Check for new habit
        habit_keywords = ["健身", "跑步", "运动", "背单词", "读书", "减肥", "早睡"]
        for kw in habit_keywords:
            if kw in text:
                for category, info in HABIT_CATEGORIES.items():
                    if kw in info["keywords"]:
                        habit, intro = self.habit_manager.create_habit(category, kw)
                        result["action"] = "create_habit"
                        result["response"] = intro
                        result["habit_id"] = habit.id
                        return result
        
        # Check for follow-up
        casual_signals = ["天气", "在吗", "最近", "今天"]
        if any(signal in text for signal in casual_signals):
            pending = self.habit_manager.get_pending_habits()
            if pending:
                habit = pending[0]
                messages = [
                    f"提醒一下，{habit.name}今天还没做哦~",
                    f"{habit.name}今日目标：{habit.target_value}{habit.unit}，加油！",
                ]
                import random
                result["action"] = "follow_up"
                result["response"] = random.choice(messages)
                result["habit_id"] = habit.id
                return result
        
        return result
    
    def get_all_habits(self) -> List[Dict]:
        return [self.habit_manager.get_dashboard()]


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Habit Tracker")
    parser.add_argument("command", choices=["create", "log", "list", "dashboard", "demo"])
    parser.add_argument("-t", "--text", help="Text to process")
    parser.add_argument("-i", "--id", help="Habit ID")
    
    args = parser.parse_args()
    
    assistant = HabitAwareAssistant()
    
    if args.command == "create":
        if not args.text:
            print("Error: --text required")
            exit(1)
        result = assistant.process_message(args.text)
        print(f"\nAction: {result['action']}\n{result['response']}")
    
    elif args.command == "log":
        if not args.id:
            print("Error: --id required")
            exit(1)
        success, msg = assistant.habit_manager.log_habit(args.id)
        print(f"\n{msg}")
    
    elif args.command == "list":
        habits = assistant.habit_manager.get_active_habits()
        print(f"\nActive Habits ({len(habits)}):")
        for h in habits:
            print(f"  - {h.name}: {h.streak}天连续")
    
    elif args.command == "dashboard":
        dash = assistant.habit_manager.get_dashboard()
        print(f"\nDashboard:")
        print(f"  Active: {dash['active_habits']}")
        print(f"  Completed Today: {dash['completed_today']}")
        print(f"  Pending: {dash['pending_today']}")
    
    elif args.command == "demo":
        print("\n" + "="*50)
        print("  HABIT TRACKER DEMO")
        print("="*50)
        
        conversation = [
            ("用户: 我想开始健身", "Create fitness habit"),
            ("用户: 今天跑了5公里", "Log completion"),
            ("用户: 今天天气不错", "Follow-up opportunity"),
            ("用户: 不练了", "Stop habit"),
        ]
        
        for msg, desc in conversation:
            print(f"\n{msg}")
            result = assistant.process_message(msg)
            print(f"Action: {result['action']}")
            if result['response']:
                print(f"Response: {result['response']}")
        
        print("\n" + "="*50)
