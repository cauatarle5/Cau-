import { createDb } from '@atlas/db';

import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from '../src/demo/seed';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não definido');
const { db, close } = createDb(url);
try {
  const r = await seedDemo(db);
  console.log(
    `Usuário demo criado (${r.today}): ${DEMO_EMAIL} / ${DEMO_PASSWORD} — ${r.insights} insights.`,
  );
} finally {
  await close();
}
