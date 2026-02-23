import os
from typing import Dict, Any

class FileSystemTool:
    """Инструмент для работы с файловой системой."""
    
    def __init__(self, workspace_dir: str):
        self.workspace_dir = workspace_dir

    def _get_abs_path(self, rel_path: str) -> str:
        """Преобразует относительный путь в абсолютный, защищая от выхода за пределы workspace."""
        abs_path = os.path.abspath(os.path.join(self.workspace_dir, rel_path))
        if not abs_path.startswith(os.path.abspath(self.workspace_dir)):
            raise ValueError(f"Access denied: Path {rel_path} is outside workspace.")
        return abs_path

    def read_file(self, path: str) -> Dict[str, Any]:
        """Читает содержимое файла."""
        try:
            abs_path = self._get_abs_path(path)
            if not os.path.exists(abs_path):
                return {"status": "error", "message": f"File not found: {path}"}
            
            with open(abs_path, "r", encoding="utf-8") as f:
                content = f.read()
            return {"status": "success", "content": content}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def write_file(self, path: str, content: str) -> Dict[str, Any]:
        """Записывает содержимое в файл (перезаписывает)."""
        try:
            abs_path = self._get_abs_path(path)
            os.makedirs(os.path.dirname(abs_path), exist_ok=True)
            
            with open(abs_path, "w", encoding="utf-8") as f:
                f.write(content)
            return {"status": "success", "message": f"File written: {path}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

    def list_directory(self, path: str = ".") -> Dict[str, Any]:
        """Возвращает список файлов и папок в директории."""
        try:
            abs_path = self._get_abs_path(path)
            if not os.path.exists(abs_path):
                return {"status": "error", "message": f"Directory not found: {path}"}
            
            items = os.listdir(abs_path)
            return {"status": "success", "items": items}
        except Exception as e:
            return {"status": "error", "message": str(e)}
