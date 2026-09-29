import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'atlas_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Renova quando restar menos que isto (ADR-009). */
export const SESSION_RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

/** Token aleatório de 32 bytes enviado no cookie. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hash SHA-256 (hex) guardado em `sessions.token_hash`. */
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
