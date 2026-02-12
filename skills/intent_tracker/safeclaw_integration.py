#!/usr/bin/env python3
"""
SafeClaw Integration Module
Uses the full-featured project_tracker and habit_tracker.
"""

import sys
import os
import json
from datetime import datetime

# Add skills directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from project_tracker import ProjectAwareAssistant
from habit_tracker import HabitAwareAssistant


class SafeClawIntentBridge:
    """Bridge between SafeClaw and intent tracking systems."""
    
    def __init__(self):
        self.project_assistant = ProjectAwareAssistant()
        self.habit_assistant = HabitAwareAssistant()
    
    def detect_and_track(self, text: str) -> dict:
        """Detect intents from text and track them."""
        result = {"action": "none", "message": None}
        
        # 1. Check for project intents
        project_result = self.project_assistant.process_message(text)
        
        if project_result["action"] in ["create_project", "update_progress"]:
            result["action"] = project_result["action"]
            result["message"] = project_result["response"]
        
        # 2. Check for habit intents
        habit_result = self.habit_assistant.process_message(text)
        
        if habit_result["action"] in ["create_habit", "log_habit"]:
            result["action"] = habit_result["action"]
            result["message"] = habit_result["response"]
        
        # 3. Check for follow-up opportunities on casual messages
        if result["message"] is None and self._is_casual_message(text):
            # Try to generate follow-up
            follow_up = self._generate_follow_up()
            if follow_up:
                result["action"] = "follow_up"
                result["message"] = follow_up
        
        return result
    
    def _is_casual_message(self, text: str) -> bool:
        """Check if this is a casual message that could trigger follow-up."""
        casual_patterns = [
            "天气", "在吗", "最近", "今天", "你好", "哈啰", "hi", "hello", "hey"
        ]
        text_lower = text.lower()
        return any(pattern.lower() in text_lower for pattern in casual_patterns)
    
    def _generate_follow_up(self) -> str:
        """Generate follow-up message for pending items."""
        # Check projects
        projects = self.project_assistant.project_manager.get_pending_projects()
        if projects:
            project = projects[0]
            phase_info = project.phases[project.current_phase]
            return f"对了，{project.name}进展怎么样啦？{phase_info['name']}阶段有什么需要帮忙的吗？"
        
        # Check habits
        habits = self.habit_assistant.habit_manager.get_active_habits()
        if habits:
            habit = habits[0]
            return f"{habit.name}连续{habit.streak}天了！今天做了吗？"
        
        return None
    
    def get_status(self) -> dict:
        """Get all status."""
        projects = self.project_assistant.project_manager.get_pending_projects()
        habits = self.habit_assistant.habit_manager.get_active_habits()
        
        return {
            "active_projects": len(projects),
            "active_habits": len(habits),
            "projects": [
                {
                    "name": p.name,
                    "phase": p.phases[p.current_phase]["name"],
                    "progress": f"{p.current_phase + 1}/{len(p.phases)}"
                }
                for p in projects
            ],
            "habits": [
                {
                    "name": h.name,
                    "streak": h.streak,
                    "total": h.total
                }
                for h in habits
            ]
        }


def process_text(text: str) -> str:
    """Simple function to process text and return response."""
    bridge = SafeClawIntentBridge()
    result = bridge.detect_and_track(text)
    
    if result["message"]:
        return result["message"]
    return None


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Intent Bridge CLI")
    parser.add_argument("command", choices=["process", "status"])
    parser.add_argument("-t", "--text", help="Text to process")
    
    args = parser.parse_args()
    
    bridge = SafeClawIntentBridge()
    
    if args.command == "process":
        if not args.text:
            print("Error: --text required")
            exit(1)
        
        result = bridge.detect_and_track(args.text)
        
        if result["message"]:
            print(f"\n{result['message']}")
        else:
            print("\nNo action taken")
    
    elif args.command == "status":
        status = bridge.get_status()
        print(f"\nActive Projects: {status['active_projects']}")
        print(f"Active Habits: {status['active_habits']}")
        
        if status["projects"]:
            print("\n📌 Projects:")
            for p in status["projects"]:
                print(f"  - {p['name']} ({p['phase']})")
        
        if status["habits"]:
            print("\n🏃 Habits:")
            for h in status["habits"]:
                print(f"  - {h['name']}: {h['streak']} day streak")
