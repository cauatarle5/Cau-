# Deploy do Atlas na Vercel + Supabase + GitHub

Decisão em ADR-064. A alternativa de host único com Docker está em `docs/DEPLOY.md`.

```
Navegador ──▶ seu-dominio (Vercel: Next + API Fastify embutida em /api/v1)
                     │
                     └──▶ Supabase Postgres (pooler, modo sessão)
GitHub Actions: Release (push na main) · Jobs (de hora em hora) · Backup (diário, cifrado)
```

Vai precisar de:
- contas na Vercel, no Supabase e no GitHub;
- o domínio;
- opcionalmente, uma `ANTHROPIC_API_KEY` (Coach e parser por IA).

Siga na ordem.

## 1. Supabase (banco)

1. **Criar o projeto:** New project. Região **South America (São Paulo)**. Gere e guarde a senha do banco num gerenciador de senhas.
2. **Pegar a URL de conexão:** botão **Connect**, opção **Session pooler**. É a string `postgresql://postgres.<ref>:<senha>@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`.
   - Use o pooler, não a "Direct connection": a direta é só IPv6, e a Vercel e o GitHub Actions não alcançam.
   - Acrescente ao final `?uselibpqcompat=true&sslmode=require` (TLS como no libpq). Essa string completa é o seu `DATABASE_URL`.
3. **Desligar a Data API (recomendado):** Project Settings, Data API, desligar. O Atlas usa a própria API. A etapa de release já liga RLS sem políticas em todas as tabelas, então mesmo ligada a Data API não lê nada; desligar é a segunda camada.

## 2. GitHub (segredos e workflows)

No repositório, Settings, Secrets and variables, Actions.

**Secrets:**

| Nome | Valor |
| --- | --- |
| `DATABASE_URL` | a URL do passo 1.2 |
| `CRON_SECRET` | gere com `openssl rand -hex 32` (64 caracteres) |
| `BACKUP_PASSPHRASE` | frase longa para cifrar os backups; guarde fora do GitHub também (sem ela o backup não abre) |

**Variables:**

| Nome | Valor |
| --- | --- |
| `ATLAS_URL` | `https://seu-dominio` (sem barra no fim) |

Depois, em Actions:
1. Rode o workflow **Release (banco)** manualmente (Run workflow). Ele aplica migrations, catálogos (TACO, exercícios) e RLS.
2. Confira que terminou em verde antes de abrir o app.

## 3. Vercel (app)

1. **Importar:** Add New, Project, importe o repositório do GitHub.
2. **Configurar o projeto:**
   - Root Directory: `apps/web` (deixe marcada a inclusão de arquivos fora da raiz, que vem por padrão).
   - Framework: Next.js. Comandos de install e build: padrão (pnpm é detectado pelo lockfile).
   - Production Branch: `main` (Settings, Git).
3. **Environment Variables** (Production; marque também Preview se quiser previews funcionais apontando para o mesmo banco, o que não é recomendado):

   | Nome | Valor |
   | --- | --- |
   | `EMBEDDED_API` | `true` |
   | `DATABASE_URL` | a URL do passo 1.2 |
   | `WEB_ORIGIN` | `https://seu-dominio` |
   | `TRUST_PROXY` | `true` |
   | `CRON_SECRET` | o mesmo do GitHub |
   | `JOBS_ENABLED` | `false` |
   | `DB_POOL_MAX` | `3` |
   | `LOG_LEVEL` | `info` |
   | `ANTHROPIC_API_KEY` | sua chave (opcional) |
   | `AI_MODEL_CHAT` | `claude-sonnet-5-5` |
   | `AI_MODEL_FAST` | `claude-haiku-4-5` |
   | `AI_DAILY_TOKEN_LIMIT` | `200000` |

   Não defina `AI_FAKE`, `APP_ENV` nem `API_URL` em produção.
4. **Região das funções:** Settings, Functions, Function Region **São Paulo (gru1)**, perto do banco.
5. **Deploy:** clique em Deploy.
6. **Domínio:** Settings, Domains, adicione o seu domínio e crie no seu DNS o registro que a Vercel indicar. Para subdomínio é um CNAME para `cname.vercel-dns.com`; para domínio raiz, o registro A indicado. O HTTPS é automático.

## 4. Conferir

```sh
curl https://seu-dominio/api/v1/health          # {"status":"ok","db":"up",...}
SMOKE_URL=https://seu-dominio pnpm --filter @atlas/web smoke   # cria um usuário de teste
```

Depois:
1. Exclua o usuário de teste em Perfil, Excluir conta.
2. Crie a sua conta e faça o onboarding.
3. Em Actions, rode **Jobs (rodada horária)** e **Backup (banco)** uma vez manualmente. Os dois devem terminar em verde; o backup aparece como artefato da execução.
4. No celular, abra o site e use "Adicionar à tela inicial" (PWA).

## Dia a dia

- **Atualizar:**
  - Cada push ou merge na `main` publica na Vercel e roda o Release (migrations aditivas).
  - Os dois rodam em paralelo; por alguns segundos o código novo pode encontrar o banco antigo. Por isso migrations nunca removem nem renomeiam colunas usadas.
- **Jobs:** o GitHub chama `/api/v1/internal/tick` de hora em hora (minuto 7). O agendador do GitHub pode atrasar alguns minutos.
- **Backups:**
  - Diários às 06:17 de São Paulo, guardados 30 dias como artefatos (privados ao repositório).
  - Cada execução restaura o dump num Postgres temporário e compara as contagens de todas as tabelas antes de guardar.
  - Os backups automáticos do Supabase continuam como segunda camada.

### Restaurar um backup

1. Baixe o artefato da execução em Actions, Backup (banco), e descompacte o `.zip`.
2. Decifre:
   ```sh
   gpg --batch --pinentry-mode loopback --passphrase '<BACKUP_PASSPHRASE>' -d -o atlas.dump atlas-*.dump.gpg
   ```
3. Restaure. **Isto substitui os dados:**
   - Faça antes um backup manual (rode o workflow).
   - Pause o projeto na Vercel ou entre em modo manutenção.
   ```sh
   pg_restore -l atlas.dump | grep -vE " SCHEMA - public | COMMENT - SCHEMA public " > atlas.list
   pg_restore --clean --if-exists --no-owner --no-privileges -L atlas.list -d "$DATABASE_URL" atlas.dump
   ```
   Use um cliente `pg_restore` 17 ou mais novo, por exemplo `docker run --rm -it -v "$PWD:/w" -w /w postgres:17-alpine ...`.
4. Rode o workflow **Release (banco)** para reaplicar o RLS.

## Limitações conhecidas (ADR-064)

- Os limites em memória (tentativas de login por minuto, um turno do Coach por vez) valem por instância da função. O limite diário de tokens do Coach é no banco e continua global.
- Uma resposta do Coach tem no máximo 300 s (tempo máximo da função).
- Se o GitHub pular a rodada das 05:00 locais, os insights do dia saem na rodada do dia seguinte. TDEE adaptativo e resumo semanal se recuperam sozinhos.
- A versão do cliente do backup acompanha a do servidor: o workflow usa Postgres 17. Se o Supabase migrar o projeto para uma versão mais nova, troque a imagem em `.github/workflows/backup.yml`.
