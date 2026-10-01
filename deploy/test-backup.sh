#!/bin/sh
# Testa o ciclo de backup da stack no ar (ADR-059): roda um backup agora, restaura num banco vazio
# e compara a contagem de linhas de todas as tabelas.
#   deploy/test-backup.sh [--env-file deploy/.env]
# Escritas no meio do teste (ex.: um job) podem gerar diferença: rode fora do horário dos jobs.
set -eu
COMPOSE_FILE="$(dirname "$0")/docker-compose.prod.yml"
ENV_FILE=""
if [ "${1:-}" = "--env-file" ]; then ENV_FILE="${2:?caminho do --env-file}"; fi

dc() {
  if [ -n "$ENV_FILE" ]; then
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

# Contagem por tabela do schema public, em ordem; $1 = banco ("" = o PGDATABASE do container).
COUNT_SQL="select string_agg(format('%s=%s', t, (xpath('/row/c/text()',
  query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text), ' ' order by t)
  from (select tablename as t from pg_tables where schemaname = 'public') s"
counts() {
  dc exec -T -e "TARGET_DB=$1" -e "COUNT_SQL=$COUNT_SQL" backup \
    sh -c 'psql -X -At -d "${TARGET_DB:-$PGDATABASE}" -c "$COUNT_SQL"'
}

dc exec -T backup backup.sh
latest=$(dc exec -T backup sh -c 'ls -1t /backups/daily/atlas-*.dump | head -n1')
echo "último backup: $latest"

dc exec -T backup sh -c 'dropdb --if-exists atlas_restore_test && createdb atlas_restore_test'
dc exec -T -e PGDATABASE=atlas_restore_test backup restore.sh "$latest"

src=$(counts "")
dst=$(counts atlas_restore_test)
dc exec -T backup dropdb atlas_restore_test

if [ "$src" != "$dst" ]; then
  echo "FALHOU: contagens diferentes" >&2
  echo "origem:   $src" >&2
  echo "restauro: $dst" >&2
  exit 1
fi
echo "OK: backup restaurado com as mesmas contagens em $(echo "$src" | wc -w) tabelas"
