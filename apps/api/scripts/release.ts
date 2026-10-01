import { createDb, seedCatalogs } from '@atlas/db';
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
} finally {
  await close();
}
console.log('Release concluído: migrations aplicadas e catálogos semeados.');
