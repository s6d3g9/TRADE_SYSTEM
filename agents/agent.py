import os
import json
import time
from typing import Any, Dict, List

from tools.fs_tool import FileSystemTool
from tools.git_tool import GitTool
from tools.terminal_tool import TerminalTool

# Это новый Stateless-агент, который использует инструменты (Tools) и файловую память.
# Он не хранит состояние в БД, а читает AGENT_PLAN.md и TODO.md для понимания контекста.

class ToolCallingAgent:
    def __init__(self, workspace_dir: str = "/workspaces/TRADE_SYSTEM"):
        self.workspace_dir = workspace_dir
        self.plan_file = os.path.join(self.workspace_dir, "AGENT_PLAN.md")
        self.todo_file = os.path.join(self.workspace_dir, "TODO.md")
        
        # Инициализация инструментов
        self.fs = FileSystemTool(workspace_dir)
        self.git = GitTool(workspace_dir)
        self.terminal = TerminalTool(workspace_dir)

    def read_memory(self) -> str:
        """Чтение процедурной памяти (планов и задач)."""
        memory = ""
        if os.path.exists(self.plan_file):
            with open(self.plan_file, "r", encoding="utf-8") as f:
                memory += f"=== AGENT_PLAN.md ===\n{f.read()}\n\n"
        if os.path.exists(self.todo_file):
            with open(self.todo_file, "r", encoding="utf-8") as f:
                memory += f"=== TODO.md ===\n{f.read()}\n\n"
        return memory

    def update_todo(self, new_content: str) -> None:
        """Обновление файла задач (запись в память)."""
        with open(self.todo_file, "w", encoding="utf-8") as f:
            f.write(new_content)

    def execute_tool(self, tool_name: str, kwargs: Dict[str, Any]) -> Any:
        """Выполнение инструмента."""
        print(f"[Agent] Executing tool: {tool_name} with args: {kwargs}")
        
        if tool_name == "read_file":
            return self.fs.read_file(kwargs.get("path", ""))
        elif tool_name == "write_file":
            return self.fs.write_file(kwargs.get("path", ""), kwargs.get("content", ""))
        elif tool_name == "run_command":
            return self.terminal.run_command(kwargs.get("command", ""))
        elif tool_name == "git_status":
            return self.git.status()
        elif tool_name == "git_commit":
            return self.git.commit(kwargs.get("message", ""))
        else:
            return {"status": "error", "message": f"Unknown tool: {tool_name}"}

    def run(self, task_prompt: str) -> None:
        """Основной цикл работы агента."""
        print(f"[Agent] Starting task: {task_prompt}")
        
        # 1. Чтение памяти (контекста)
        context = self.read_memory()
        print(f"[Agent] Loaded context ({len(context)} chars).")
        
        # 2. Здесь должен быть вызов LLM (например, OpenAI API) с передачей context и task_prompt
        # LLM вернет список инструментов для вызова (Tool Calling)
        print("[Agent] Thinking... (LLM call placeholder)")
        
        # 3. Выполнение инструментов (пример)
        # self.execute_tool("read_file", {"path": "backend/app/main.py"})
        
        print("[Agent] Task completed.")

if __name__ == "__main__":
    agent = ToolCallingAgent()
    agent.run("Проверь TODO.md и выполни следующую задачу.")
