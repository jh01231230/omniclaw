#!/usr/bin/env python3
"""
Intent Detection Demo
Shows how the intent tracker works.
"""

import sys
sys.path.insert(0, '/home/tars/Workspace/safeclaw/skills/intent_tracker')

from intent_tracker import IntentAwareAssistant, IntentDetector


def demo_detection():
    """Demo intent detection."""
    print("\n" + "="*70)
    print("  INTENT DETECTION DEMO")
    print("="*70)
    
    detector = IntentDetector()
    
    test_messages = [
        "我想做个项目管理工具",
        "明天要开产品评审会议",
        "决定了，就用 Python 来做后端",
        "记得去配置服务器",
        "最近想了解一下 Docker",
        "这周要完成用户认证模块",
    ]
    
    for msg in test_messages:
        intents = detector.detect(msg)
        
        print(f"\n📝 「{msg}」")
        if intents:
            for intent in intents:
                print(f"   → [{intent.intent_type.upper()}] {intent.content} ({intent.confidence:.0%})")
        else:
            print("   → 未检测到意图")
    
    print()


def demo_full_workflow():
    """Demo the full workflow."""
    print("\n" + "="*70)
    print("  FULL WORKFLOW DEMO")
    print("="*70)
    
    assistant = IntentAwareAssistant()
    
    # Simulate conversation
    print("\n💬 【对话开始】")
    
    conversation = [
        ("用户: 我想做个项目管理工具", True),
        ("Assistant: 检测到项目意图！", False),
        ("Assistant: 已创建待办跟进", False),
        ("", False),  # Empty to trigger check
        ("用户: 今天天气不错", True),
        ("Assistant: 是的，顺便跟进一下...", False),
        ("用户: 原型图画完了，开始做数据库设计", True),
    ]
    
    for msg, is_user in conversation:
        if not msg:
            # Check for follow-up
            if assistant.get_follow_up_message():
                print(f"\n🤖 {assistant.get_follow_up_message()}")
            continue
            
        print(f"\n💬 {msg}")
        
        if is_user:
            result = assistant.process_message(msg)
            
            if result['todos_created']:
                print(f"\n✅ 检测到 {len(result['todos_created'])} 个待办:")
                for todo in result['todos_created']:
                    print(f"   📌 {todo.title} (优先级: {todo.priority}/5)")
            
            if result['should_follow_up']:
                follow_up = assistant.get_follow_up_message()
                print(f"\n🤖 AI 跟进: 「{follow_up}」")
        
        # Check for reminder opportunities
        if not is_user:
            # This would be called during heartbeat or idle time
            pass
    
    print()


def demo_todo_list():
    """Demo todo list."""
    print("\n" + "="*70)
    print("  TODO LIST DEMO")
    print("="*70)
    
    assistant = IntentAwareAssistant()
    todos = assistant.todo_manager.get_pending_todos()
    
    print(f"\n📋 当前有 {len(todos)} 个待跟进事项:")
    
    if not todos:
        print("   (暂无待办)")
    else:
        for i, todo in enumerate(todos, 1):
            print(f"\n  {i}. [{todo.intent_type.upper()}] {todo.title}")
            print(f"     优先级: {'⭐'*todo.priority}{'☆'*(5-todo.priority)}")
            print(f"     提醒次数: {todo.reminder_count}")
            print(f"     创建时间: {todo.created_at[:16]}")
    
    print()


def demo_reminder_check():
    """Demo reminder check."""
    print("\n" + "="*70)
    print("  REMINDER CHECK")
    print("="*70)
    
    assistant = IntentAwareAssistant()
    candidates = assistant.todo_manager.get_reminder_candidates()
    
    print(f"\n⏰ 需要提醒的待办: {len(candidates)} 个")
    
    if candidates:
        for todo in candidates:
            print(f"\n  📌 {todo.title}")
            print(f"     创建: {todo.created_at[:16]}")
            print(f"     已提醒: {todo.reminder_count} 次")
    else:
        print("   (暂无需要提醒的待办)")
    
    print()


def main():
    """Run all demos."""
    print("\n" + "⭐"*35)
    print("   INTENT DETECTION & TODO SYSTEM")
    print("   "*35)
    
    demo_detection()
    demo_full_workflow()
    demo_todo_list()
    demo_reminder_check()
    
    print("="*70)
    print("  DEMO COMPLETE")
    print("="*70)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Intent Detection Demo")
    parser.add_argument("command", 
        choices=["all", "detect", "workflow", "list", "remind"],
        default="all")
    parser.add_argument("-t", "--text", help="Text to analyze")
    
    args = parser.parse_args()
    
    if args.command == "all":
        main()
    elif args.command == "detect":
        if args.text:
            detector = IntentDetector()
            intents = detector.detect(args.text)
            print(f"\n检测到 {len(intents)} 个意图:")
            for i in intents:
                print(f"  [{i.intent_type}] {i.content}")
        else:
            demo_detection()
    elif args.command == "workflow":
        demo_full_workflow()
    elif args.command == "list":
        demo_todo_list()
    elif args.command == "remind":
        demo_reminder_check()
