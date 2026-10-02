import { createDb, seedCatalogs, sql } from '@atlas/db';
import { runMigrations } from '@atlas/db/migrate';

/**
 * Etapa de release do deploy (ADR-058): aplica as migrations e semeia os catálogos (idempotente).
 * Roda antes da API subir; o seed demo nunca roda em produção.
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}
await runMigrations(url);
const { db, close } = createDb(url);
try {
  await seedCatalogs(db);
  // RLS sem políticas em todas as tabelas de `public` (ADR-064): a Data API do Supabase (papéis
  // anon/authenticated) não lê nada; o app conecta como dono das tabelas e não é afetado.
  await db.execute(sql`
    do $$
    declare t record;
    begin
      for t in select tablename from pg_tables where schemaname = 'public' and not rowsecurity loop
        execute format('alter table public.%I enable row level security', t.tablename);
      end loop;
    end $$;`);
} finally {
  await close();
}
console.log('Release concluído: migrations, catálogos e RLS.');
