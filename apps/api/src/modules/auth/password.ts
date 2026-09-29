import { hash, verify } from '@node-rs/argon2';

// argon2id com parâmetros mínimos recomendados pela OWASP (ADR-009).
const ARGON2_OPTIONS = {
  algorithm: 2, // Algorithm.Argon2id (const enum não é usável com isolatedModules)
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}
