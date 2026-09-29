import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  COOKIE_SECURE: booleanString.optional(),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  databaseUrl: string;
  host: string;
  port: number;
  logLevel: string;
  webOrigin: string;
  cookieSecure: boolean;
  /** Tentativas por minuto em login (por IP e por e-mail) e cadastro (por IP). */
  authRateLimitMax: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  return {
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    logLevel: parsed.LOG_LEVEL,
    webOrigin: parsed.WEB_ORIGIN,
    cookieSecure: parsed.COOKIE_SECURE ?? parsed.NODE_ENV === 'production',
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
  };
}
