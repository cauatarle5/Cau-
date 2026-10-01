#!/bin/sh
# Restaura um backup no banco de PGHOST/PGDATABASE (substitui os objetos existentes).
#   restore.sh /backups/daily/atlas-AAAAMMDD-HHMMSS.dump
set -eu
file="${1:?uso: restore.sh <arquivo.dump>}"
[ -f "$file" ] || { echo "arquivo não encontrado: $file" >&2; exit 1; }
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction -d "$PGDATABASE" "$file"
echo "restore: $file aplicado em $PGDATABASE"
