#!/usr/bin/env python3
"""
Intent Detection and Automatic Todo System
Automatically detects user intentions and creates follow-up reminders.
"""

import re
import json
import os
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from typing import List, Optional, Dict


# ============================================================================
# Intent Patterns
# ============================================================================

INTENT_PATTERNS = {
    # Project/Goal intentions
    "project": [
        r"我要做个?([^\s，。]+)",
        r"我想开发([^\s，。]+)",
        r"打算做一个?([^\s，。]+)",
        r"准备搭建([^\s，。]+)",
        r"想做个([^\s，。]+)",
        r"打算开发([^\s，。]+)",
        r"开始做([^\s，。]+)",
        r"启动([^\s，。]+)项目",
        r"来做([^\s，。]+)",
        r"弄个([^\s，。]+)",
    ],
    
    # Todo/Task intentions
    "todo": [
        r"待会儿要([^\s，。]+)",
        r"一会儿要([^\s，。]+)",
        r"记得去([^\s，。]+)",
        r"等下要([^\s，。]+)",
        r"晚点要([^\s，。]+)",
        r"下一步做([^\s，。]+)",
        r"接下来([^\s，。]+)",
        r"下一步是([^\s，。]+)",
        r"下一步要([^\s，。]+)",
    ],
    
    # Decision intentions
    "decision": [
        r"决定了([^\s，。]+)",
        r"就用([^\s，。]+)",
        r"选([^\s，。]+)吧",
        r"还是用([^\s，。]+)",
        r"敲定了([^\s，。]+)",
        r"确定了([^\s，。]+)",
        r"就([^\s，。]+)吧",
    ],
    
    # Research/Learn intentions
    "research": [
        r"想了解一下([^\s，。]+)",
        r"研究一下([^\s，。]+)",
        r"看看([^\s，。]+)",
        r"查查([^\s，。]+)",
        r"了解一下([^\s，。]+)",
    ],
    
    # Meeting/Schedule intentions
    "schedule": [
        r"明天要([^\s，。]+)",
        r"今天下午([^\s，。]+)",
        r"这周要([^\s，。]+)",
        r"找个时间([^\s，。]+)",
        r"安排一下([^\s，。]+)",
    ]
}


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class DetectedIntent:
    """Detected intent from conversation."""
    intent_type: str
    content: str
    confidence: float
    context: str
    created_at: str
    source: str


@dataclass
class TodoItem:
    """Todo item for follow-up."""
    id: str
    title: str
    intent_type: str
    description: str
    context: str
    status: str
    priority: int
    created_at: str
    updated_at: str
    due_at: Optional[str]
    last_reminded_at: Optional[str]
    reminder_count: int
    related_intent_id: Optional[str]


# ============================================================================
# Intent Detector
# ============================================================================

class IntentDetector:
    """Detects user intentions from text."""
    
    def __init__(self):
        self.confidence_threshold = 0.5
    
    def detect(self, text: str, source: str = "user") -> List[DetectedIntent]:
        """Detect intents from text."""
        intents = []
        text = text.strip()
        
        if len(text) < 3:
            return intents
        
        for intent_type, patterns in INTENT_PATTERNS.items():
            for pattern in patterns:
                matches = re.finditer(pattern, text, re.IGNORECASE)
                for match in matches:
                    content = match.group(1).strip() if match.groups() else text
                    confidence = self._calculate_confidence(text, pattern, content, intent_type)
                    
                    if confidence >= self.confidence_threshold:
                        intent = DetectedIntent(
                            intent_type=intent_type,
                            content=content,
                            confidence=confidence,
                            context=text[:200],
                            created_at=datetime.utcnow().isoformat(),
                            source=source
                        )
                        intents.append(intent)
        
        # Remove duplicates
        seen = set()
        unique_intents = []
        for intent in intents:
            key = (intent.intent_type, intent.content.lower())
            if key not in seen:
                seen.add(key)
                unique_intents.append(intent)
        
        return unique_intents
    
    def _calculate_confidence(self, text: str, pattern: str, content: str, intent_type: str) -> float:
        """Calculate confidence score."""
        base_confidence = 0.6
        
        if len(content) > 3:
            base_confidence += 0.1
        if len(content) > 10:
            base_confidence += 0.1
        
        if text.lower().startswith(content.lower()[:10]):
            base_confidence += 0.1
        
        if intent_type in ["project", "decision"]:
            base_confidence += 0.1
        
        return min(1.0, base_confidence)


# ============================================================================
# Todo Manager
# ============================================================================

class TodoManager:
    """Manages todo items and follow-up reminders."""
    
    def __init__(self, data_dir: str = None):
        self.data_dir = data_dir or "/home/tars/Workspace/safeclaw/data"
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.todos_file = os.path.join(self.data_dir, "intents_todos.json")
        self.intents_file = os.path.join(self.data_dir, "intents_detected.json")
        
        self.todos = self._load_json(self.todos_file, {})
        self.intents = self._load_json(self.intents_file, [])
    
    def _load_json(self, filepath: str, default):
        """Load JSON data from file."""
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return default
    
    def _save_json(self, filepath: str, data):
        """Save JSON data to file."""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def create_todo(self, intent: DetectedIntent, priority: int = 3) -> TodoItem:
        """Create a todo from detected intent."""
        import uuid
        
        todo_id = f"todo_{uuid.uuid4().hex[:8]}"
        
        if intent.intent_type == "project":
            title = f"项目: {intent.content}"
        elif intent.intent_type == "todo":
            title = f"待办: {intent.content}"
        elif intent.intent_type == "decision":
            title = f"决定: {intent.content}"
        else:
            title = intent.content
        
        todo = TodoItem(
            id=todo_id,
            title=title,
            intent_type=intent.intent_type,
            description=f"检测到用户意图: {intent.content}",
            context=intent.context,
            status="pending",
            priority=priority,
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat(),
            due_at=None,
            last_reminded_at=None,
            reminder_count=0,
            related_intent_id=None
        )
        
        self.todos[todo_id] = asdict(todo)
        self._save_json(self.todos_file, self.todos)
        
        intent_data = asdict(intent)
        intent_data['id'] = f"intent_{uuid.uuid4().hex[:8]}"
        intent_data['related_todo_id'] = todo_id
        self.intents.append(intent_data)
        self._save_json(self.intents_file, self.intents)
        
        return todo
    
    def complete_todo(self, todo_id: str) -> bool:
        """Mark todo as completed."""
        if todo_id in self.todos:
            self.todos[todo_id]['status'] = 'completed'
            self.todos[todo_id]['updated_at'] = datetime.utcnow().isoformat()
            self._save_json(self.todos_file, self.todos)
            return True
        return False
    
    def dismiss_todo(self, todo_id: str) -> bool:
        """Dismiss a todo."""
        if todo_id in self.todos:
            self.todos[todo_id]['status'] = 'dismissed'
            self.todos[todo_id]['updated_at'] = datetime.utcnow().isoformat()
            self._save_json(self.todos_file, self.todos)
            return True
        return False
    
    def get_pending_todos(self, limit: int = 10) -> List[TodoItem]:
        """Get pending todos."""
        todos = []
        for todo_data in self.todos.values():
            if todo_data['status'] == 'pending':
                todos.append(TodoItem(**todo_data))
        todos.sort(key=lambda x: (-x.priority, x.created_at))
        return todos[:limit]
    
    def should_remind(self, todo_id: str) -> bool:
        """Check if a todo should be reminded."""
        if todo_id not in self.todos:
            return False
        
        todo = self.todos[todo_id]
        
        if todo['status'] != 'pending':
            return False
        
        created = datetime.fromisoformat(todo['created_at'])
        now = datetime.utcnow()
        hours_elapsed = (now - created).total_seconds() / 3600
        
        if todo['last_reminded_at'] is None:
            return hours_elapsed >= 24
        else:
            last = datetime.fromisoformat(todo['last_reminded_at'])
            hours_since_remind = (now - last).total_seconds() / 3600
            
            if todo['reminder_count'] < 2:
                return hours_since_remind >= 48
            else:
                return hours_since_remind >= 168
    
    def mark_reminded(self, todo_id: str):
        """Mark a todo as reminded."""
        if todo_id in self.todos:
            self.todos[todo_id]['last_reminded_at'] = datetime.utcnow().isoformat()
            self.todos[todo_id]['reminder_count'] += 1
            self._save_json(self.todos_file, self.todos)


# ============================================================================
# Intent-Aware Assistant
# ============================================================================

class IntentAwareAssistant:
    """Assistant that detects intents and manages follow-ups."""
    
    def __init__(self, data_dir: str = None):
        self.detector = IntentDetector()
        self.todo_manager = TodoManager(data_dir)
    
    def process_message(self, text: str, is_user: bool = True) -> Dict:
        """Process a message and detect intents."""
        result = {
            'intents': [],
            'todos_created': [],
            'should_follow_up': False,
            'pending_todos': []
        }
        
        if not is_user:
            return result
        
        intents = self.detector.detect(text, source="user")
        result['intents'] = intents
        
        for intent in intents:
            existing = self._find_similar_todo(intent)
            if not existing:
                priority = self._calculate_priority(intent)
                todo = self.todo_manager.create_todo(intent, priority)
                result['todos_created'].append(todo)
        
        pending = self.todo_manager.get_pending_todos(limit=3)
        if pending:
            result['pending_todos'] = pending
            if self._is_follow_up_opportunity(text):
                result['should_follow_up'] = True
        
        return result
    
    def _find_similar_todo(self, intent: DetectedIntent) -> Optional[TodoItem]:
        """Find existing similar todo."""
        for todo_data in self.todo_manager.todos.values():
            if todo_data['status'] != 'pending':
                continue
            if intent.content.lower() in todo_data['title'].lower():
                return TodoItem(**todo_data)
        return None
    
    def _calculate_priority(self, intent: DetectedIntent) -> int:
        """Calculate priority based on intent type."""
        base_priority = {
            "project": 4,
            "decision": 3,
            "todo": 2,
            "research": 2,
            "schedule": 5
        }.get(intent.intent_type, 3)
        
        if intent.confidence > 0.8:
            base_priority += 1
        
        return min(5, max(1, base_priority))
    
    def _is_follow_up_opportunity(self, text: str) -> bool:
        """Check if current message is a good follow-up opportunity."""
        if len(text) > 100:
            return False
        
        task_keywords = ["做", "写", "开发", "完成", "实现", "测试"]
        if any(kw in text.lower() for kw in task_keywords):
            return False
        
        follow_up_triggers = ["天气", "你好", "在吗", "忙吗", "怎样", "今天", "这周", "最近"]
        return any(text.lower().startswith(trigger) for trigger in follow_up_triggers)
    
    def get_follow_up_message(self) -> Optional[str]:
        """Generate a natural follow-up message."""
        candidates = self.todo_manager.get_reminder_candidates()
        
        if not candidates:
            return None
        
        todo = candidates[0]
        
        if todo.intent_type == "project":
            return f"对了，你之前说想做「{todo.title[4:]}」，进展怎么样啦？"
        elif todo.intent_type == "todo":
            return f"提醒一下，你之前说要去「{todo.title[4:]}」，做了吗？"
        elif todo.intent_type == "decision":
            return f"之前你决定了「{todo.title[4:]}」，后来有变化吗？"
        else:
            return f"你之前说{todo.title}，有什么需要帮忙的吗？"


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Intent Detection & Todo System")
    parser.add_argument("command", choices=["detect", "list", "complete", "remind"])
    parser.add_argument("-t", "--text", help="Text to analyze")
    parser.add_argument("--id", help="Todo ID")
    args = parser.parse_args()
    
    assistant = IntentAwareAssistant()
    
    if args.command == "detect":
        if not args.text:
            print("Error: --text required")
            exit(1)
        
        intents = assistant.detector.detect(args.text)
        print(f"\n📌 Detected {len(intents)} intent(s):")
        for i in intents:
            print(f"  [{i.intent_type.upper()}] {i.content} ({i.confidence:.0%})")
    
    elif args.command == "list":
        todos = assistant.todo_manager.get_pending_todos()
        print(f"\n📋 {len(todos)} pending todos:")
        for i, todo in enumerate(todos, 1):
            print(f"  {i}. [{todo.intent_type.upper()}] {todo.title}")
    
    elif args.command == "complete":
        if not args.id:
            print("Error: --id required")
            exit(1)
        
        if assistant.todo_manager.complete_todo(args.id):
            print(f"✅ Completed: {args.id}")
        else:
            print(f"❌ Todo not found: {args.id}")
    
    elif args.command == "remind":
        candidates = assistant.todo_manager.get_reminder_candidates()
        print(f"\n⏰ {len(candidates)} todos need reminding")
        for todo in candidates:
            print(f"  - {todo.title}")
