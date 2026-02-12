#!/usr/bin/env python3
"""
Project-Aware Intent Tracker
Automatically generates project plans, tracks milestones, and provides adaptive follow-ups.
"""

import re
import json
import os
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict, field
from typing import List, Optional, Dict, Tuple
from enum import Enum


# ============================================================================
# Project Phase Templates
# ============================================================================

class Phase(Enum):
    """Project phases."""
    IDEATION = "ideation"           # 构思/想法
    PLANNING = "planning"          # 规划/设计
    IMPLEMENTATION = "implementation"  # 开发/实现
    TESTING = "testing"            # 测试
    DEPLOYMENT = "deployment"      # 部署/发布
    COMPLETED = "completed"        # 完成


# Default project templates
PROJECT_TEMPLATES = {
    "web_app": {
        "name": "Web 应用",
        "phases": [
            {"name": "需求分析", "duration_days": 2, "tasks": ["收集需求", "写文档", "确认功能"]},
            {"name": "原型设计", "duration_days": 3, "tasks": ["画原型图", "UI设计", "用户确认"]},
            {"name": "后端开发", "duration_days": 5, "tasks": ["数据库设计", "API开发", "业务逻辑"]},
            {"name": "前端开发", "duration_days": 4, "tasks": ["页面开发", "交互实现", "API对接"]},
            {"name": "测试", "duration_days": 2, "tasks": ["功能测试", "Bug修复"]},
            {"name": "部署上线", "duration_days": 1, "tasks": ["服务器部署", "域名配置", "上线发布"]}
        ]
    },
    "mobile_app": {
        "name": "移动应用",
        "phases": [
            {"name": "需求分析", "duration_days": 2},
            {"name": "UI/UX设计", "duration_days": 4},
            {"name": "前端开发", "duration_days": 7},
            {"name": "后端开发", "duration_days": 5},
            {"name": "测试", "duration_days": 3},
            {"name": "上架发布", "duration_days": 2}
        ]
    },
    "api_service": {
        "name": "API 服务",
        "phases": [
            {"name": "API 设计", "duration_days": 2},
            {"name": "接口开发", "duration_days": 5},
            {"name": "文档编写", "duration_days": 1},
            {"name": "测试", "duration_days": 2},
            {"name": "部署", "duration_days": 1}
        ]
    },
    "data_project": {
        "name": "数据项目",
        "phases": [
            {"name": "数据收集", "duration_days": 2},
            {"name": "数据清洗", "duration_days": 2},
            {"name": "数据分析", "duration_days": 3},
            {"name": "可视化", "duration_days": 2},
            {"name": "报告撰写", "duration_days": 1}
        ]
    },
    "general": {
        "name": "通用项目",
        "phases": [
            {"name": "准备工作", "duration_days": 1},
            {"name": "核心开发", "duration_days": 3},
            {"name": "测试完善", "duration_days": 2},
            {"name": "收尾", "duration_days": 1}
        ]
    }
}


# ============================================================================
# Data Classes
# ============================================================================

@dataclass
class ProjectPhase:
    """A phase in a project."""
    name: str
    status: str  # pending, in_progress, completed, blocked
    start_date: Optional[str]
    end_date: Optional[str]
    tasks: List[str]
    completed_tasks: List[str] = field(default_factory=list)
    notes: str = ""


@dataclass
class Project:
    """A tracked project."""
    id: str
    name: str
    description: str
    template: str
    phases: List[Dict]
    current_phase: int
    status: str  # active, paused, completed, cancelled
    priority: int
    created_at: str
    updated_at: str
    start_date: str
    target_end_date: str
    context: Dict  # Original conversation context
    user_updates: List[Dict] = field(default_factory=list)
    ai_suggestions: List[Dict] = field(default_factory=list)


@dataclass
class ProgressMilestone:
    """A progress milestone to track."""
    id: str
    project_id: str
    phase_name: str
    description: str
    target_date: str
    status: str  # upcoming, due, overdue, completed
    reminders_sent: int


# ============================================================================
# Project Plan Generator
# ============================================================================

class ProjectPlanGenerator:
    """Generates project plans based on detected intents."""
    
    @staticmethod
    def detect_project_type(prompt: str) -> str:
        """Detect what type of project this is."""
        prompt_lower = prompt.lower()
        
        type_keywords = {
            "web_app": ["网站", "web", "前端", "后端", "网站开发", "管理系统", "工具", "平台"],
            "mobile_app": ["手机", "app", "移动应用", "小程序", "iOS", "Android"],
            "api_service": ["api", "接口", "后端服务", "微服务", "server"],
            "data_project": ["数据分析", "数据处理", "数据可视化", "报表", "机器学习", "AI"]
        }
        
        for project_type, keywords in type_keywords.items():
            if any(kw in prompt_lower for kw in keywords):
                return project_type
        
        return "web_app"  # Most common, use this as default
    
    @staticmethod
    def extract_project_name(prompt: str) -> str:
        """Extract project name from prompt."""
        # Pattern: "做个 X" or "开发 X"
        patterns = [
            r"做个?(.+?)(?:的|用|吧|，|$)",
            r"开发(.+?)(?:的|用|吧|，|$)",
            r"做个?(.+?)项目",
            r"做(.+?)工具",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, prompt)
            if match:
                name = match.group(1).strip()
                # Clean up
                name = re.sub(r"[，。！？]", "", name)
                if len(name) > 2:
                    return name
        
        # Default
        return "未命名项目"
    
    @staticmethod
    def generate_plan(
        prompt: str,
        project_type: str = None
    ) -> Dict:
        """Generate a complete project plan."""
        if project_type is None:
            project_type = ProjectPlanGenerator.detect_project_type(prompt)
        
        template = PROJECT_TEMPLATES.get(project_type, PROJECT_TEMPLATES["general"])
        
        # Build phases
        phases = []
        start_date = datetime.utcnow()
        
        for phase_info in template["phases"]:
            phase = {
                "name": phase_info["name"],
                "status": "pending",
                "start_date": None,
                "end_date": None,
                "tasks": phase_info.get("tasks", []),
                "completed_tasks": [],
                "notes": ""
            }
            phases.append(phase)
        
        # Calculate target end date
        total_days = sum(p.get("duration_days", 3) for p in template["phases"])
        target_end = start_date + timedelta(days=total_days)
        
        return {
            "project_type": project_type,
            "template_name": template["name"],
            "total_estimated_days": total_days,
            "phases": phases,
            "target_end_date": target_end.isoformat()
        }
    
    @staticmethod
    def generate_intro_message(project_name: str, template_name: str, phases: List[Dict]) -> str:
        """Generate a natural introduction message."""
        phase_names = [p["name"] for p in phases]
        
        msg = f"好的！我来帮你规划「{project_name}」这个{template_name}项目。\n\n"
        msg += f"📋 计划分为 {len(phases)} 个阶段：\n"
        
        for i, phase in enumerate(phases, 1):
            tasks = phase.get("tasks", [])
            tasks_str = f"（{', '.join(tasks[:3])}）" if tasks else ""
            msg += f"  {i}. {phase['name']}{tasks_str}\n"
        
        msg += f"\n⏱️ 预计完成时间：约 {sum(p.get('duration_days', 3) for p in PROJECT_TEMPLATES.get(template_name, PROJECT_TEMPLATES['general'])['phases'])} 天\n"
        msg += "💡 有任何调整随时告诉我！"
        
        return msg


# ============================================================================
# Progress Tracker
# ============================================================================

class ProgressTracker:
    """Tracks project progress based on user feedback."""
    
    # Progress keywords mapping
    PROGRESS_SIGNALS = {
        "ideation": {
            "started": ["想好了", "决定了", "构思完成", "想法有了"],
            "completed": ["想清楚了", "方案定了", "思路明确了"]
        },
        "planning": {
            "started": ["开始设计", "规划中", "画原型", "设计方案"],
            "completed": ["设计完成", "原型画完", "文档写完", "设计定稿"]
        },
        "implementation": {
            "started": ["开始写代码", "开发中", "动手做了", "开始写"],
            "completed": ["写完了", "开发完成", "代码写完", "功能做完"]
        },
        "testing": {
            "started": ["开始测试", "测试中", "测一下"],
            "completed": ["测试完成", "测完了", "Bug修完", "测试通过"]
        },
        "deployment": {
            "started": ["开始部署", "上线中", "发布"],
            "completed": ["部署完成", "上线了", "发布了", "跑通了"]
        }
    }
    
    @staticmethod
    def detect_progress(text: str) -> Tuple[Optional[str], str]:
        """
        Detect progress from user text.
        
        Returns:
            (phase, progress_type) or (None, None)
            progress_type: "started" or "completed"
        """
        text_lower = text.lower()
        
        for phase, signals in ProgressTracker.PROGRESS_SIGNALS.items():
            # Check for completion
            for signal in signals.get("completed", []):
                if signal in text:
                    return phase, "completed"
            
            # Check for start
            for signal in signals.get("started", []):
                if signal in text:
                    return phase, "started"
        
        # Check for "继续" (continue) signals - general progress without specific phase
        continue_signals = ["继续", "接着做", "继续做", "继续开发", "继续推进"]
        if any(signal in text for signal in continue_signals):
            return "implementation", "started"  # Default to implementation phase
        
        return None, None
    
    @staticmethod
    def extract_update_content(text: str) -> str:
        """Extract the actual update content from user message."""
        # Remove common prefixes
        patterns = [
            r"原型图画完了，(.+)",
            r"代码写完了，(.+)",
            r"(.+)，接下来做",
            r"(.+)，然后",
            r"(.+)，现在开始",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                return match.group(1).strip()
        
        return text[:100] if len(text) > 100 else text


# ============================================================================
# Smart Follow-Up Generator
# ============================================================================

class FollowUpGenerator:
    """Generates natural follow-up messages."""
    
    @staticmethod
    def should_follow_up(text: str, pending_projects: List[Project]) -> Tuple[bool, Optional[str]]:
        """
        Determine if this is a good time for follow-up.
        
        Returns:
            (should_follow_up, project_id_to_follow_up)
        """
        # Not good time if:
        # - User is actively working on something
        # - Message is very short casual greeting
        # - Already mentioned the project
        
        if len(text) < 5:
            return False, None
        
        task_keywords = ["做", "写", "开发", "完成", "测试", "部署", "实现"]
        if any(kw in text for kw in task_keywords):
            return False, None
        
        # Good opportunities: casual messages
        casual_triggers = ["天气", "最近", "今天", "这周", "忙", "在吗", "你好"]
        if any(trigger in text for trigger in casual_triggers):
            # Find most urgent pending project
            for project in pending_projects:
                if project.status == "active":
                    return True, project.id
        
        return False, None
    
    @staticmethod
    def generate_follow_up(project: Project) -> str:
        """Generate a natural follow-up message."""
        current_phase = project.phases[project.current_phase]
        phase_name = current_phase["name"]
        next_phase = None
        if project.current_phase + 1 < len(project.phases):
            next_phase = project.phases[project.current_phase + 1]["name"]
        
        templates = {
            "ideation": [
                f"「{project.name}」的想法想清楚了吗？",
                f"「{project.name}」有什么新想法吗？",
            ],
            "planning": [
                f"「{project.name}」的设计进展如何？",
                f"「{project.name}」的原型图画完了吗？",
            ],
            "implementation": [
                f"「{project.name}」开发得怎么样了？",
                f"「{project.name}」写到哪一步了？",
            ],
            "testing": [
                f"「{project.name}」测试完了吗？",
                f"「{project.name}」还有Bug要修吗？",
            ],
            "deployment": [
                f"「{project.name}」部署了吗？",
                f"「{project.name}」上线了没？",
            ]
        }
        
        import random
        messages = templates.get(current_phase.get("status", "implementation"), 
                                [f"「{project.name}」有什么进展吗？"])
        
        return random.choice(messages)
    
    @staticmethod
    def generate_encouragement(project: Project) -> str:
        """Generate encouragement after user progress update."""
        current_phase = project.phases[project.current_phase]
        
        encouragements = [
            f"好的，记录下来！{current_phase['name']} 阶段完成。",
            f"收到！{current_phase['name']} 完成，棒！🎉",
            f"好的，继续加油！进入下一阶段。",
        ]
        
        import random
        return random.choice(encouragements)
    
    @staticmethod
    def generate_suggestion(project: Project) -> str:
        """Generate AI suggestions for the project."""
        current_phase = project.phases[project.current_phase]["name"]
        
        suggestions = {
            "ideation": [
                "建议先梳理清楚核心功能，不用一次想太多",
                "可以先做个最小可行性版本 MVP",
            ],
            "planning": [
                "原型图可以用 Figma 快速画",
                "设计阶段建议先确认流程，再做详细设计",
            ],
            "implementation": [
                "建议先搭框架，再填充细节",
                "代码可以先写注释，保持清晰",
            ],
            "testing": [
                "测试用例建议覆盖核心流程",
                "可以先用自动化测试省时间",
            ],
            "deployment": [
                "建议先部署到测试环境，确认没问题再正式上线",
                "记得做好监控和日志",
            ]
        }
        
        import random
        return random.choice(suggestions.get(current_phase, suggestions["implementation"]))


# ============================================================================
# Project Manager
# ============================================================================

class ProjectManager:
    """Manages projects, tracks progress, and generates follow-ups."""
    
    def __init__(self, data_dir: str = None):
        self.data_dir = data_dir or "/home/tars/Workspace/safeclaw/data"
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.projects_file = os.path.join(self.data_dir, "projects.json")
        self.milestones_file = os.path.join(self.data_dir, "progress_milestones.json")
        
        self.projects = self._load_json(self.projects_file, {})
        self.milestones = self._load_json(self.milestones_file, [])
    
    def _load_json(self, filepath: str, default):
        """Load JSON data."""
        if os.path.exists(filepath):
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except:
                pass
        return default
    
    def _save_json(self, filepath: str, data):
        """Save JSON data."""
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def create_project(self, prompt: str) -> Tuple[Project, str]:
        """Create a new project from user intent."""
        import uuid
        
        project_id = f"proj_{uuid.uuid4().hex[:8]}"
        
        # Generate plan
        project_type = ProjectPlanGenerator.detect_project_type(prompt)
        project_name = ProjectPlanGenerator.extract_project_name(prompt)
        plan = ProjectPlanGenerator.generate_plan(prompt, project_type)
        
        # Create project
        project = Project(
            id=project_id,
            name=project_name,
            description=prompt[:200],
            template=project_type,
            phases=plan["phases"],
            current_phase=0,
            status="active",
            priority=3,
            created_at=datetime.utcnow().isoformat(),
            updated_at=datetime.utcnow().isoformat(),
            start_date=datetime.utcnow().isoformat(),
            target_end_date=plan["target_end_date"],
            context={"original_prompt": prompt}
        )
        
        # Save
        self.projects[project_id] = asdict(project)
        self._save_json(self.projects_file, self.projects)
        
        # Generate intro message
        intro = ProjectPlanGenerator.generate_intro_message(
            project_name,
            plan["template_name"],
            plan["phases"]
        )
        
        return project, intro
    
    def update_progress(self, project_id: str, phase: str, progress_type: str, update_text: str) -> Tuple[bool, str]:
        """Update project progress based on user feedback."""
        if project_id not in self.projects:
            return False, "项目不存在"
        
        project = self.projects[project_id]
        
        # Find target phase index
        target_idx = None
        for i, phase_data in enumerate(project["phases"]):
            if phase_data["name"] == phase or phase_data.get("status") == phase:
                target_idx = i
                break
        
        if target_idx is None:
            return False, f"找不到阶段: {phase}"
        
        # Update based on progress type
        if progress_type == "completed":
            # Mark current phase as completed
            project["phases"][target_idx]["status"] = "completed"
            project["phases"][target_idx]["end_date"] = datetime.utcnow().isoformat()
            
            # Start next phase if exists
            if target_idx + 1 < len(project["phases"]):
                next_phase = project["phases"][target_idx + 1]
                if next_phase["status"] != "completed":
                    next_phase["status"] = "in_progress"
                    next_phase["start_date"] = datetime.utcnow().isoformat()
                    project["current_phase"] = target_idx + 1
            else:
                project["status"] = "completed"
        
        elif progress_type == "started":
            project["phases"][target_idx]["status"] = "in_progress"
            if not project["phases"][target_idx].get("start_date"):
                project["phases"][target_idx]["start_date"] = datetime.utcnow().isoformat()
        
        # Record update
        project["user_updates"].append({
            "phase": phase,
            "type": progress_type,
            "content": update_text,
            "timestamp": datetime.utcnow().isoformat()
        })
        
        project["updated_at"] = datetime.utcnow().isoformat()
        self.projects[project_id] = project
        self._save_json(self.projects_file, self.projects)
        
        # Generate encouragement
        encouragement = FollowUpGenerator.generate_encouragement(
            Project(**project)
        )
        
        # Generate suggestion
        suggestion = FollowUpGenerator.generate_suggestion(
            Project(**project)
        )
        
        return True, f"{encouragement}\n\n💡 {suggestion}"
    
    def get_pending_projects(self) -> List[Project]:
        """Get all active pending projects."""
        active = []
        for p in self.projects.values():
            if p["status"] == "active":
                active.append(Project(**p))
        # Sort by priority and creation time
        active.sort(key=lambda x: (-x.priority, x.created_at))
        return active
    
    def check_milestones(self) -> List[Dict]:
        """Check for due/overdue milestones."""
        due = []
        now = datetime.utcnow()
        
        for mid, milestone in enumerate(self.milestones):
            if milestone["status"] in ["upcoming", "due"]:
                target = datetime.fromisoformat(milestone["target_date"])
                
                if now > target:
                    milestone["status"] = "overdue"
                    due.append(milestone)
                elif (target - now).total_seconds() < 86400:  # Due within 24h
                    milestone["status"] = "due"
                    due.append(milestone)
        
        self._save_json(self.milestones_file, self.milestones)
        return due
    
    def should_follow_up_now(self, user_text: str) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Check if should follow up now.
        
        Returns:
            (should_follow_up, project_id, message)
        """
        pending = self.get_pending_projects()
        
        if not pending:
            return False, None, None
        
        should, project_id = FollowUpGenerator.should_follow_up(user_text, pending)
        
        if should:
            project = self.projects[project_id]
            message = FollowUpGenerator.generate_follow_up(Project(**project))
            return True, project_id, message
        
        return False, None, None
    
    def get_project_status(self, project_id: str) -> Optional[Dict]:
        """Get project status summary."""
        if project_id not in self.projects:
            return None
        
        project = Project(**self.projects[project_id])
        
        completed = sum(1 for p in project.phases if p["status"] == "completed")
        total = len(project.phases)
        
        current = project.phases[project.current_phase] if project.phases else {}
        
        return {
            "id": project.id,
            "name": project.name,
            "progress": f"{completed}/{total} 阶段完成",
            "current_phase": current.get("name", "N/A"),
            "status": project.status,
            "created": project.created_at[:10]
        }


# ============================================================================
# Main Integration Class
# ============================================================================

class ProjectAwareAssistant:
    """
    Main class that integrates:
    - Intent detection
    - Project creation
    - Progress tracking
    - Smart follow-ups
    """
    
    def __init__(self, data_dir: str = None):
        self.project_manager = ProjectManager(data_dir)
        self.progress_tracker = ProgressTracker()
    
    def process_message(self, text: str) -> Dict:
        """
        Process a user message and handle accordingly.
        
        Returns:
            Dict with:
                - action: "create_project", "update_progress", "check_followup", "none"
                - response: AI response message
                - project_id: if applicable
        """
        result = {
            "action": "none",
            "response": None,
            "project_id": None,
            "data": {}
        }
        
        # 1. FIRST: Check for progress update in existing projects
        # This must come BEFORE project creation check to avoid creating duplicate projects
        phase, progress_type = self.progress_tracker.detect_progress(text)
        
        if phase:
            # Find active project to update
            pending = self.project_manager.get_pending_projects()
            
            for project in pending:
                current = project.phases[project.current_phase]["name"]
                
                # For ANY progress report, advance to next phase
                # This handles cases where user completes a phase not explicitly named
                if progress_type == "completed":
                    update_content = self.progress_tracker.extract_update_content(text)
                    success, message = self.project_manager.update_progress(
                        project.id, current, "completed", update_content
                    )
                    
                    if success:
                        result["action"] = "update_progress"
                        result["response"] = message
                        result["project_id"] = project.id
                        result["data"]["phase"] = current
                        result["data"]["progress_type"] = "completed"
                        return result
        
        # 2. SECOND: Check for explicit project creation intent
        # Only create new project if no active project matches
        
        # 2. SECOND: Check for explicit project creation intent
        # Only create new project if no active project matches
        project_creation_signals = [
            ("start", ["我要开始做", "我想开始做", "正式启动"]),
            ("create", ["打算做个新的", "想做一个新的", "准备启动一个新"]),
        ]
        
        is_new_project = False
        for signal_type, signals in project_creation_signals:
            if any(signal in text for signal in signals):
                is_new_project = True
                break
        
        # Also check if this looks like starting something entirely new
        if not is_new_project:
            # Only create if text is primarily about starting something new
            # and doesn't contain progress-related keywords
            progress_keywords = ["完成了", "画完了", "写完了", "测试", "部署", "通过"]
            has_progress = any(kw in text for kw in progress_keywords)
            
            # If text has progress keywords but didn't match existing project,
            # it might be completing a phase
            if not has_progress:
                # Check for clear "start new project" intent
                start_patterns = [
                    r"^(我要|我想)做个?(.+)",
                    r"^(打算|准备)做个?(.+)",
                    r"^(启动|开始)一个新?(.+)项目",
                ]
                for pattern in start_patterns:
                    if re.match(pattern, text):
                        is_new_project = True
                        break
        
        if is_new_project:
            project, intro = self.project_manager.create_project(text)
            
            result["action"] = "create_project"
            result["response"] = intro
            result["project_id"] = project.id
            result["data"]["project_name"] = project.name
            result["data"]["phases"] = len(project.phases)
            return result
        
        # 2.5: Check for "continue existing project" intent
        # This handles "继续做XX项目" for existing projects
        continue_patterns = [
            r"继续做(.+)项目",
            r"继续做(.+)",
            r"继续开发(.+)",
            r"继续推进(.+)",
            r"继续之前(.+)",
        ]
        continue_match = None
        for pattern in continue_patterns:
            match = re.search(pattern, text)
            if match:
                continue_match = match
                break
        
        if continue_match:
            project_name = continue_match.group(1).strip()
            # Find existing project by name
            pending = self.project_manager.get_pending_projects()
            for project in pending:
                if project_name in project.name or project.name in project_name:
                    # Return a message about continuing this project
                    current_phase = project.phases[project.current_phase]["name"]
                    result["action"] = "check_followup"
                    result["response"] = f"好的，继续推进「{project.name}」！\n\n目前处于{current_phase}阶段，上次我们说到哪里了？有什么需要帮忙的吗？"
                    result["project_id"] = project.id
                    return result
            
            # No existing project found - this is a "continue" signal for a NEW project
            # Treat as project creation with modified text
            modified_text = f"做{project_name}"
            project, intro = self.project_manager.create_project(modified_text)
            
            result["action"] = "create_project"
            result["response"] = f"好的！我来继续帮你做「{project_name}」项目。\n\n{intro.split('好的！我来帮你规划')[1] if '好的！我来帮你规划' in intro else intro}"
            result["project_id"] = project.id
            result["data"]["project_name"] = project.name
            result["data"]["phases"] = len(project.phases)
            return result
        
        # 3. Check if should follow up (casual messages)
        should, project_id, message = self.project_manager.should_follow_up_now(text)
        
        if should:
            result["action"] = "follow_up"
            result["response"] = message
            result["project_id"] = project_id
            return result
        
        # 4. Default - no action needed
        result["response"] = None
        return result
    
    def get_all_projects(self) -> List[Dict]:
        """Get all projects with status."""
        return [
            self.project_manager.get_project_status(pid)
            for pid in self.project_manager.projects
        ]


# ============================================================================
# CLI Demo
# ============================================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Project-Aware Assistant")
    parser.add_argument("command", choices=["create", "list", "update", "followup", "demo"])
    parser.add_argument("-t", "--text", help="Text to process")
    parser.add_argument("-p", "--project", help="Project ID")
    parser.add_argument("--phase", help="Phase name")
    parser.add_argument("--type", help="Progress type", default="completed")
    
    args = parser.parse_args()
    
    assistant = ProjectAwareAssistant()
    
    if args.command == "create":
        if not args.text:
            print("Error: --text required")
            exit(1)
        
        result = assistant.process_message(args.text)
        
        print(f"\n{'='*60}")
        print(f"  ACTION: {result['action'].upper()}")
        print(f"{'='*60}")
        
        if result['response']:
            print(f"\n{result['response']}")
        
        print(f"\nProject ID: {result.get('project_id', 'N/A')}")
    
    elif args.command == "list":
        projects = assistant.get_all_projects()
        
        print(f"\n{'='*60}")
        print(f"  PROJECTS ({len(projects)})")
        print(f"{'='*60}")
        
        for p in projects:
            if p:
                print(f"\n📌 {p['name']}")
                print(f"   进度: {p['progress']}")
                print(f"   当前: {p['current_phase']}")
                print(f"   状态: {p['status']}")
    
    elif args.command == "followup":
        projects = assistant.project_manager.get_pending_projects()
        
        print(f"\n{'='*60}")
        print(f"  PENDING PROJECTS ({len(projects)})")
        print(f"{'='*60}")
        
        for project in projects:
            msg = FollowUpGenerator.generate_follow_up(project)
            print(f"\n📌 {project.name}")
            print(f"   当前: {project.phases[project.current_phase]['name']}")
            print(f"   💬 跟进: {msg}")
    
    elif args.command == "demo":
        print("\n" + "="*60)
        print("  PROJECT-AWARE ASSISTANT DEMO")
        print("="*60)
        
        # Demo conversation - more realistic flow
        conversation = [
            ("我想做个项目管理工具", "Create initial project"),
            ("原型图画完了，开始做数据库设计", "Advance to design phase"),
            ("数据库设计完成，开始写代码", "Advance to implementation"),
            ("代码写完了，开始测试", "Advance to testing"),
            ("测试通过，准备部署", "Advance to deployment"),
            ("今天天气不错", "Follow-up opportunity"),
        ]
        
        for msg, desc in conversation:
            print(f"\n💬 用户: 「{msg}」")
            result = assistant.process_message(msg)
            print(f"\n💬 用户: 「{msg}」")
            result = assistant.process_message(msg)
            
            print(f"🤖 Action: {result['action']}")
            if result['response']:
                print(f"   Response: {result['response'][:100]}...")
        
        print("\n" + "="*60)
        print("  PROJECT LIST")
        print("="*60)
        
        for p in assistant.get_all_projects():
            if p:
                print(f"\n📌 {p['name']} ({p['progress']})")
                print(f"   当前阶段: {p['current_phase']}")
        
        print()
