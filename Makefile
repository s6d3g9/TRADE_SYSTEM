.PHONY: up down build logs ps restart clean

up:
	docker compose up -d --build

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
