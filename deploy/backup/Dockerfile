# Backup diário do Postgres (ADR-059): pg_dump no horário do cron (crond e tzdata já vêm na
# imagem), retenção diária e semanal, cópia externa opcional para S3 compatível (aws-cli).
FROM postgres:16-alpine
# `--build-arg EXTRA_PACKAGES=` dispensa o aws-cli (sem cópia externa).
ARG EXTRA_PACKAGES=aws-cli
RUN if [ -n "$EXTRA_PACKAGES" ]; then apk add --no-cache $EXTRA_PACKAGES; fi
COPY backup.sh restore.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh /usr/local/bin/entrypoint.sh
VOLUME /backups
ENTRYPOINT ["entrypoint.sh"]
