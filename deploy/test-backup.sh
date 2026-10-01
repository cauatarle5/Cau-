#!/bin/sh
# Testa o ciclo de backup da stack no ar (ADR-059): roda um backup agora, restaura num banco vazio
# e compara a contagem de linhas de todas as tabelas.
#   deploy/test-backup.sh --env-file deploy/.env
set -eu
COMPOSE_FILE="$(dirname "$0")/docker-compose.prod.yml"
dc() { docker compose -f "$COMPOSE_FILE" "$@"; }
ARGS="$*"

# shellcheck disable=SC2086
dc $ARGS exec -T backup backup.sh
# shellcheck disable=SC2086
latest=$(dc $ARGS exec -T backup sh -c 'ls -1t /backups/daily/atlas-*.dump | head -n1')
echo "último backup: $latest"

counts() { # contagem por tabela do schema public, ordenada
  # shellcheck disable=SC2086
  dc $ARGS exec -T backup psql -X -At -d "$1" -c "
    select string_agg(format('%s=%s', t, (xpath('/row/c/text()',
      query_to_xml(format('select count(*) as c from public.%I', t), false, true, '')))[1]::text), ' ' order by t)
    from (select tablename as t from pg_tables where schemaname = 'public') s"
}

# shellcheck disable=SC2086
dc $ARGS exec -T backup sh -c 'dropdb --if-exists atlas_restore_test && createdb atlas_restore_test'
# shellcheck disable=SC2086
dc $ARGS exec -T -e PGDATABASE=atlas_restore_test backup restore.sh "$latest"

src=$(counts "${POSTGRES_DB:-atlas}")
dst=$(counts atlas_restore_test)
# shellcheck disable=SC2086
dc $ARGS exec -T backup dropdb atlas_restore_test

if [ "$src" != "$dst" ]; then
  echo "FALHOU: contagens diferentes" >&2
  echo "origem:   $src" >&2
  echo "restauro: $dst" >&2
  exit 1
fi
tables=$(echo "$src" | wc -w)
echo "OK: backup restaurado com as mesmas contagens em $tables tabelas"
