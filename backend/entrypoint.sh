#!/usr/bin/env bash
set -euo pipefail

if [[ "${RUN_MIGRATIONS:-1}" == "1" ]]; then
  echo "[entrypoint] Running alembic migrations…"
  # DB may not be ready yet; retry a bit.
  for i in $(seq 1 "${MIGRATION_RETRIES:-30}"); do
    if python -m alembic -c /app/alembic.ini upgrade head; then
      echo "[entrypoint] Migrations OK"
      break
    fi
    if [[ "$i" == "${MIGRATION_RETRIES:-30}" ]]; then
      echo "[entrypoint] Migrations failed after retries" >&2
      exit 1
    fi
    echo "[entrypoint] Waiting for DB… ($i)"
    sleep 1
  done
fi

exec "$@"
