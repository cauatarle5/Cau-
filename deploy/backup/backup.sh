#!/bin/sh
# Um backup agora: pg_dump -Fc em /backups/daily (cópia semanal aos domingos), retenção e envio
# opcional para S3. Usa PGHOST/PGUSER/PGPASSWORD/PGDATABASE.
set -eu
: "${BACKUP_DIR:=/backups}"
: "${BACKUP_KEEP_DAILY:=14}"
: "${BACKUP_KEEP_WEEKLY:=8}"
# Pelo menos 1: a cópia recém-criada nunca é apagada pela retenção.
[ "$BACKUP_KEEP_DAILY" -ge 1 ] || BACKUP_KEEP_DAILY=1
[ "$BACKUP_KEEP_WEEKLY" -ge 1 ] || BACKUP_KEEP_WEEKLY=1
mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"

stamp=$(date +%Y%m%d-%H%M%S)
file="$BACKUP_DIR/daily/atlas-$stamp.dump"
# Dump que falhou não deixa arquivo parcial para trás.
trap 'rm -f "$file.partial"' EXIT
pg_dump -Fc --no-owner --no-privileges -f "$file.partial"
# Confere que o arquivo é legível antes de considerá-lo válido.
pg_restore --list "$file.partial" > /dev/null
mv "$file.partial" "$file"
echo "backup: $file ($(du -h "$file" | cut -f1))"

if [ "$(date +%u)" = "7" ]; then
  cp "$file" "$BACKUP_DIR/weekly/"
fi

prune() { # mantém os N mais novos
  ls -1t "$1"/atlas-*.dump 2>/dev/null | tail -n +"$(($2 + 1))" | xargs -r rm -f
}
prune "$BACKUP_DIR/daily" "$BACKUP_KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$BACKUP_KEEP_WEEKLY"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  command -v aws > /dev/null || { echo "backup: aws-cli ausente na imagem" >&2; exit 1; }
  endpoint=""
  [ -n "${BACKUP_S3_ENDPOINT:-}" ] && endpoint="--endpoint-url $BACKUP_S3_ENDPOINT"
  # shellcheck disable=SC2086
  aws s3 cp $endpoint "$file" "${BACKUP_S3_URI%/}/daily/$(basename "$file")"
  echo "backup: enviado para ${BACKUP_S3_URI%/}/daily/"
fi
