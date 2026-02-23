.PHONY: up down build logs ps restart clean migrate web-ready health

up:
	docker compose up -d --build

migrate:
	docker compose exec -T -w /app backend python -m alembic -c /app/alembic.ini upgrade head

health:
	@echo "Backend health:"
	@curl -fsS "http://localhost:$${BACKEND_PORT:-8000}/health" | head -c 500; echo

web-ready: up migrate health ps

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f --tail=200

ps:
	docker compose ps

restart:
	docker compose restart

clean:
	docker compose down -v --remove-orphans
