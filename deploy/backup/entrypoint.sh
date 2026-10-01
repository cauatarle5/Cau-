#!/bin/sh
# Agenda o backup no cron (fuso em TZ) e mantém o crond em primeiro plano.
set -eu
: "${BACKUP_CRON:=30 3 * * *}"
mkdir -p /backups/daily /backups/weekly
# Variáveis para o cron, entre aspas simples (senhas com $, aspas ou espaços).
env | grep -E '^(PG|BACKUP_|AWS_|TZ=)' | while IFS= read -r line; do
  printf "export %s='%s'\n" "${line%%=*}" "$(printf %s "${line#*=}" | sed "s/'/'\\\\''/g")"
done > /etc/backup.env
echo "$BACKUP_CRON . /etc/backup.env && /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root
echo "backup: agendado '$BACKUP_CRON' (TZ=${TZ:-UTC})"
exec crond -f -l 8
