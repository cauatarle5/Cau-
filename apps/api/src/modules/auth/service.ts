import type { User } from '@atlas/db';
import type { LoginInput, RegisterInput, UserPublic } from '@atlas/schemas';

import { AppError } from '../../lib/errors';
import { PG_UNIQUE_VIOLATION, pgErrorCode } from '../../lib/pg';

import { hashPassword, verifyPassword } from './password';
import type { AuthRepository } from './repository';
import {
  generateSessionToken,
  hashSessionToken,
  SESSION_RENEW_THRESHOLD_MS,
  SESSION_TTL_MS,
} from './tokens';

export interface ClientInfo {
  userAgent: string | null;
  ip: string | null;
}

export interface IssuedSession {
  token: string;
  expiresAt: Date;
  user: UserPublic;
}

export interface AuthContext {
  userId: string;
  sessionId: string;
  user: UserPublic;
  /** Preenchido quando a sessão foi renovada e o cookie precisa ser reenviado. */
  renewedExpiresAt: Date | null;
}

const isUniqueViolation = (error: unknown) => pgErrorCode(error) === PG_UNIQUE_VIOLATION;

export function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timezone: user.timezone,
    locale: user.locale,
  };
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Credenciais inválidas', 'E-mail ou senha incorretos.');

export function createAuthService(repo: AuthRepository, now: () => Date = () => new Date()) {
  // Hash usado para gastar o mesmo tempo quando o e-mail não existe (ADR-009).
  // Calculado já na criação para a primeira requisição não ser mais lenta.
  const dummyHash = hashPassword('atlas-timing-equalizer');

  async function issueSession(user: User, client: ClientInfo): Promise<IssuedSession> {
    const token = generateSessionToken();
    const expiresAt = new Date(now().getTime() + SESSION_TTL_MS);
    await repo.insertSession({
      userId: user.id,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: client.userAgent,
      ip: client.ip,
    });
    return { token, expiresAt, user: toUserPublic(user) };
  }

  return {
    async register(input: RegisterInput, client: ClientInfo): Promise<IssuedSession> {
      const passwordHash = await hashPassword(input.password);
      let user: User;
      try {
        user = await repo.insertUser({ email: input.email, name: input.name, passwordHash });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(409, 'EMAIL_TAKEN', 'E-mail já cadastrado', undefined, [
            { field: 'email', message: 'Este e-mail já está cadastrado' },
          ]);
        }
        throw error;
      }
      return issueSession(user, client);
    },

    async login(input: LoginInput, client: ClientInfo): Promise<IssuedSession> {
      const user = await repo.findUserByEmail(input.email);
      if (!user) {
        await verifyPassword(await dummyHash, input.password);
        throw invalidCredentials();
      }
      if (!(await verifyPassword(user.passwordHash, input.password))) throw invalidCredentials();
      return issueSession(user, client);
    },

    async authenticate(token: string): Promise<AuthContext | null> {
      const current = now();
      const found = await repo.findValidSession(hashSessionToken(token), current);
      if (!found) return null;

      let renewedExpiresAt: Date | null = null;
      if (found.expiresAt.getTime() - current.getTime() < SESSION_RENEW_THRESHOLD_MS) {
        renewedExpiresAt = new Date(current.getTime() + SESSION_TTL_MS);
        await repo.extendSession(found.user.id, found.sessionId, renewedExpiresAt);
      }
      return {
        userId: found.user.id,
        sessionId: found.sessionId,
        user: toUserPublic(found.user),
        renewedExpiresAt,
      };
    },

    async logout(auth: Pick<AuthContext, 'userId' | 'sessionId'>): Promise<void> {
      await repo.deleteSession(auth.userId, auth.sessionId);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
