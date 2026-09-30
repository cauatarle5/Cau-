import { createDb } from '../src/client';
import { seedCatalogs } from '../src/seed';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definida');
  process.exit(1);
}
const { db, close } = createDb(url);
await seedCatalogs(db);
await close();
console.log('Catálogos semeados.');
