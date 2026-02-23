import subprocess
from typing import Dict, Any

class TerminalTool:
    """Инструмент для выполнения команд в терминале."""
    
    def __init__(self, workspace_dir: str):
        self.workspace_dir = workspace_dir

    def run_command(self, command: str, timeout: int = 30) -> Dict[str, Any]:
        """Выполняет shell-команду и возвращает результат."""
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=self.workspace_dir,
                capture_output=True,
                text=True,
                timeout=timeout
            )
            return {
                "status": "success" if result.returncode == 0 else "error",
                "stdout": result.stdout.strip(),
                "stderr": result.stderr.strip(),
                "exit_code": result.returncode
            }
        except subprocess.TimeoutExpired:
            return {
                "status": "error",
                "stdout": "",
                "stderr": f"Command timed out after {timeout} seconds",
                "exit_code": -1
            }
        except Exception as e:
            return {
                "status": "error",
                "stdout": "",
                "stderr": str(e),
                "exit_code": -1
            }
