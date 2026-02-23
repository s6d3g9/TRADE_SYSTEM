import os
import json
import psycopg2
from pgvector.psycopg2 import register_vector
import tiktoken
from google import genai

# Конфигурация
DB_URL = os.getenv("DATABASE_URL", "postgresql://trade:trade@localhost:5432/trade_system")
WORKSPACE_DIR = os.getenv("WORKSPACE_DIR", "/workspaces/TRADE_SYSTEM")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Игнорируемые директории и файлы
IGNORE_DIRS = {".git", "node_modules", "__pycache__", "venv", ".venv", "freqtrade", "alembic"}
IGNORE_EXTS = {".pyc", ".pyo", ".pyd", ".db", ".sqlite3", ".log", ".png", ".jpg", ".jpeg", ".gif", ".pdf"}

def get_db_connection():
    """Подключение к PostgreSQL и регистрация типа vector."""
    conn = psycopg2.connect(DB_URL)
    conn.autocommit = True
    
    with conn.cursor() as cur:
        cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
        
    register_vector(conn)
    return conn

def init_db(conn):
    """Создание таблицы для хранения эмбеддингов."""
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS agent_memories (
                id SERIAL PRIMARY KEY,
                file_path TEXT NOT NULL,
                content TEXT NOT NULL,
                embedding vector(768), -- Размерность для text-embedding-004 (Gemini)
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS agent_memories_embedding_idx 
            ON agent_memories USING hnsw (embedding vector_cosine_ops);
        """)
        print("[Indexer] Таблица agent_memories инициализирована.")

def chunk_text(text: str, max_tokens: int = 1000) -> list[str]:
    """Разбивает текст на чанки с учетом лимита токенов."""
    enc = tiktoken.get_encoding("cl100k_base")
    tokens = enc.encode(text)
    
    chunks = []
    for i in range(0, len(tokens), max_tokens):
        chunk_tokens = tokens[i:i + max_tokens]
        chunks.append(enc.decode(chunk_tokens))
    return chunks

def get_embedding(text: str, client: genai.Client) -> list[float]:
    """Получает векторное представление текста через Gemini API."""
    if not GEMINI_API_KEY:
        # Заглушка для тестирования без ключа (возвращает нулевой вектор)
        return [0.0] * 768
        
    response = client.models.embed_content(
        model="text-embedding-004",
        contents=text
    )
    return response.embeddings[0].values

def index_workspace():
    """Основной процесс индексации файлов проекта."""
    print(f"[Indexer] Запуск индексации директории: {WORKSPACE_DIR}")
    
    conn = get_db_connection()
    init_db(conn)
    
    client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
    if not client:
        print("[Indexer] ВНИМАНИЕ: GEMINI_API_KEY не задан. Будут использованы нулевые векторы (режим тестирования БД).")

    indexed_files = 0
    
    with conn.cursor() as cur:
        # Очистка старых данных перед полной переиндексацией
        cur.execute("TRUNCATE TABLE agent_memories;")
        
        for root, dirs, files in os.walk(WORKSPACE_DIR):
            # Исключаем ненужные директории
            dirs[:] = [d for d in dirs if d not in IGNORE_DIRS and not d.startswith('.')]
            
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in IGNORE_EXTS or file.startswith('.'):
                    continue
                    
                file_path = os.path.join(root, file)
                rel_path = os.path.relpath(file_path, WORKSPACE_DIR)
                
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        content = f.read()
                        
                    if not content.strip():
                        continue
                        
                    chunks = chunk_text(content)
                    for chunk in chunks:
                        embedding = get_embedding(chunk, client)
                        
                        cur.execute("""
                            INSERT INTO agent_memories (file_path, content, embedding)
                            VALUES (%s, %s, %s)
                        """, (rel_path, chunk, embedding))
                        
                    indexed_files += 1
                    print(f"[Indexer] Проиндексирован: {rel_path} ({len(chunks)} чанков)")
                    
                except Exception as e:
                    print(f"[Indexer] Ошибка чтения {rel_path}: {e}")

    conn.close()
    print(f"[Indexer] Индексация завершена. Обработано файлов: {indexed_files}")

if __name__ == "__main__":
    index_workspace()
