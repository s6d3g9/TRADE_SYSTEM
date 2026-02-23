import subprocess
from typing import Dict, Any

class GitTool:
    """Инструмент для работы с Git."""
    
    def __init__(self, workspace_dir: str):
        self.workspace_dir = workspace_dir

    def _run_git(self, args: list[str]) -> Dict[str, Any]:
        """Выполняет git-команду."""
        try:
            result = subprocess.run(
                ["git"] + args,
                cwd=self.workspace_dir,
                capture_output=True,
                text=True,
                check=False
            )
            return {
                "status": "success" if result.returncode == 0 else "error",
                "stdout": result.stdout.strip(),
                "stderr": result.stderr.strip(),
                "exit_code": result.returncode
            }
        except Exception as e:
            return {"status": "error", "stdout": "", "stderr": str(e), "exit_code": -1}

    def status(self) -> Dict[str, Any]:
        """Возвращает статус репозитория."""
        return self._run_git(["status", "--short"])

    def commit(self, message: str, files: list[str] = None) -> Dict[str, Any]:
        """Добавляет файлы и создает коммит."""
        if not files:
            files = ["."]
        
        add_res = self._run_git(["add"] + files)
        if add_res["exit_code"] != 0:
            return add_res
            
        return self._run_git(["commit", "-m", message])

    def checkout_branch(self, branch_name: str, create: bool = False) -> Dict[str, Any]:
        """Переключается на ветку (или создает новую)."""
        args = ["checkout"]
        if create:
            args.append("-b")
        args.append(branch_name)
        return self._run_git(args)
