import { createDb } from '@atlas/db';

import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const { db, close } = createDb(config.databaseUrl);
const app = await buildApp({ config, db });

const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  await close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ host: config.host, port: config.port });
