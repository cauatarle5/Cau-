import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((v) => v === 'true');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Normalizado para o formato do header Origin (sem barra final).
  WEB_ORIGIN: z
    .url()
    .default('http://localhost:3000')
    .transform((u) => new URL(u).origin),
  // Proxies confiáveis para X-Forwarded-For: `loopback` ou lista de IPs/CIDRs separada por vírgula.
  TRUST_PROXY: z.string().default('loopback'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_FAST: z.string().optional(),
  AI_MODEL_CHAT: z.string().optional(),
  AI_DAILY_TOKEN_LIMIT: z.coerce.number().int().positive().default(200_000),
  // Coach roteirizado sem rede, só para E2E/dev (ADR-056); recusado em produção.
  AI_FAKE: booleanString.optional(),
  AI_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: booleanString.optional(),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  // Worker pg-boss no processo da API (ADR-049); desligado por padrão e nos testes.
  JOBS_ENABLED: booleanString.optional(),
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
  trustProxy: string;
  anthropicApiKey: string | undefined;
  aiModelFast: string | undefined;
  aiRateLimitMax: number;
  aiModelChat: string | undefined;
  aiDailyTokenLimit: number;
  aiFake: boolean;
  jobsEnabled: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.parse(env);
  if (parsed.AI_FAKE && parsed.NODE_ENV === 'production')
    throw new Error('AI_FAKE não pode ser usado em produção');
  return {
    nodeEnv: parsed.NODE_ENV,
    databaseUrl: parsed.DATABASE_URL,
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    logLevel: parsed.LOG_LEVEL,
    webOrigin: parsed.WEB_ORIGIN,
    cookieSecure: parsed.COOKIE_SECURE ?? parsed.NODE_ENV === 'production',
    authRateLimitMax: parsed.AUTH_RATE_LIMIT_MAX,
    trustProxy: parsed.TRUST_PROXY,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY || undefined,
    aiModelFast: parsed.AI_MODEL_FAST || undefined,
    aiRateLimitMax: parsed.AI_RATE_LIMIT_MAX,
    jobsEnabled: parsed.JOBS_ENABLED ?? false,
    aiModelChat: parsed.AI_MODEL_CHAT || undefined,
    aiDailyTokenLimit: parsed.AI_DAILY_TOKEN_LIMIT,
    aiFake: parsed.AI_FAKE ?? false,
  };
}
