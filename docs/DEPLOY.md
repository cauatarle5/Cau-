# Deploy do Atlas

Host único com Docker Compose: Caddy (TLS) na frente do web (Next) e da API (Fastify), Postgres 16 e backup diário. Decisões em ADR-058 (deploy), ADR-059 (backup), ADR-060 (PWA) e ADR-062 (desempenho).

```
Internet ──443──▶ Caddy ──/api/*──▶ api:3001 ──▶ postgres:5432
                        └─ resto ──▶ web:3000         ▲
                                       backup (cron) ─┘──▶ volume backups (+ S3 opcional)
```

## Requisitos

- **Servidor:** VPS Linux com 1 vCPU e 2 GB de RAM já basta para um usuário. Precisa de Docker 24+ com o plugin `docker compose`.
- **Domínio:** registro DNS A/AAAA apontando para o servidor.
- **Rede:** portas 80 e 443 abertas (TLS automático via Let's Encrypt).
- **Recomendado:** bucket S3 compatível (Backblaze B2, Cloudflare R2, AWS S3) para a cópia externa do backup.

## Primeira subida

```sh
git clone <repo> atlas && cd atlas
cp deploy/.env.production.example deploy/.env
# Preencha: DOMAIN, ACME_EMAIL, POSTGRES_PASSWORD (openssl rand -base64 32) e, se quiser, IA e S3.
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

Ordem de subida, garantida pelos healthchecks:

1. `postgres`.
2. `migrate`: aplica as migrations e semeia os catálogos (TACO, exercícios), de forma idempotente.
3. `api`.
4. `web`.
5. `caddy`.

O `backup` sobe junto e agenda o cron.

Para conferir:

```sh
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env ps
curl https://$DOMAIN/api/v1/health      # {"status":"ok","db":"up",...}
SMOKE_URL=https://$DOMAIN pnpm --filter @atlas/web smoke   # da sua máquina, com o repo instalado
```

O smoke cria um usuário de teste. Exclua-o depois em Perfil, Excluir conta.

**Valores de produção que importam (ADR-014):**

- `WEB_ORIGIN=https://$DOMAIN`: o compose monta sozinho a partir do `DOMAIN`.
- `TRUST_PROXY`: só a rede interna do compose (o Caddy).
- Cookie `Secure`: ligado em produção.
- O seed demo nunca roda em produção, e `AI_FAKE` é recusado.

## Atualizar

```sh
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

O `migrate` roda de novo antes da API nova. As migrations são só aditivas (nunca editar uma migration aplicada).

**Voltar uma versão:**

1. Antes de atualizar, marque a imagem atual: `docker tag atlas-api:latest atlas-api:anterior` (e o mesmo para `atlas-web`).
2. Suba com `ATLAS_VERSION=anterior`.

Uma migration já aplicada continua aplicada. Como elas são aditivas, a versão anterior segue funcionando.

## Backup e restauração

- **Agendamento:** `pg_dump -Fc` todo dia em `BACKUP_CRON`, no fuso `BACKUP_TZ` (padrão 03:30 de São Paulo).
- **Retenção:** 14 cópias diárias e 8 semanais (domingo), no volume `backups`.
- **Validação:** cada arquivo é verificado com `pg_restore --list` antes de valer.
- **Cópia externa:** com `BACKUP_S3_URI`, cada backup também vai para o bucket.

Configure a cópia externa: sem ela, perder o disco do servidor perde os backups junto.

```sh
# Backup agora
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec backup backup.sh

# Listar
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec backup ls -lh /backups/daily /backups/weekly

# Testar o ciclo completo: backup, restauração num banco temporário e comparação das contagens
deploy/test-backup.sh --env-file deploy/.env
```

### Restaurar em produção

1. Pare quem escreve no banco:
   ```sh
   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env stop api web
   ```
2. Restaure (substitui os objetos existentes, numa transação só):
   ```sh
   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env exec backup \
     restore.sh /backups/daily/atlas-AAAAMMDD-HHMMSS.dump
   ```
   Para um arquivo baixado do S3, copie-o antes para o volume: `docker compose cp arquivo.dump backup:/backups/`.
3. Suba de novo:
   ```sh
   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d
   ```

## Segredos

- **Onde ficam:** só em `deploy/.env`, que não é versionado (está no `.gitignore`). A chave da Anthropic fica apenas na API; o front nunca a recebe.
- **Trocar a senha do Postgres:**
  1. `docker compose exec postgres psql -U atlas -c "alter user atlas password '<nova>'"`;
  2. atualize `POSTGRES_PASSWORD` em `deploy/.env`;
  3. rode `up -d`.
- **Trocar a chave da IA:** atualize `ANTHROPIC_API_KEY` e rode `up -d api`.
- **Encerrar todas as sessões:** `docker compose exec postgres psql -U atlas -c "delete from sessions"`.

## Dados pessoais (LGPD)

- **Exportação:** Perfil, Exportar meus dados (`GET /api/v1/account/export`).
- **Exclusão:** Perfil, Excluir conta (`DELETE /api/v1/account`). Remove tudo em cascata na hora.
- **Backups:** cópias anteriores à exclusão saem da retenção em até 8 semanas (14 dias nas diárias), inclusive no bucket se ele tiver a mesma política de ciclo de vida. Configure no bucket uma expiração compatível (ex.: 60 dias).

## Problemas comuns

- **Certificado não sai:**
  - confira o DNS e as portas 80 e 443;
  - veja os logs: `docker compose logs caddy`.
- **`api` não fica saudável:**
  - veja `docker compose logs migrate api`;
  - variável obrigatória ausente aparece já na primeira linha.
- **Rate limit bloqueando todo mundo:** o IP real vem do Caddy pela rede interna fixa `172.28.0.0/16`. Não publique a porta da API direto.
- **Build atrás de proxy com TLS interceptado:** passe o CA com `docker build --secret id=ca_bundle,src=<arquivo>`. As imagens aceitam o secret só durante a instalação.

## Alternativa: PaaS

As imagens rodam em qualquer plataforma com Dockerfile, como Fly.io, Railway ou Render, com Postgres gerenciado:

- `apps/api/Dockerfile`, com o comando de release `node dist/release.js`;
- `apps/web/Dockerfile`, com o build arg `API_URL` apontando para a API.

Nesse caso, web e API ficam atrás do mesmo domínio (rewrite `/api/v1` do Next ou roteamento da plataforma), para manter o cookie e a ausência de CORS (ADR-007). Uma separação de domínios pede nova ADR. O backup passa a ser o da plataforma, ou este mesmo container de backup apontado para o banco gerenciado.
