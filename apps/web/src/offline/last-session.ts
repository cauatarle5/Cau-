import type { UserPublic } from '@atlas/schemas';

/**
 * Última sessão conhecida neste aparelho (ADR-060): permite abrir o app sem rede (ex.: recarregar
 * o treino ativo). Só dados públicos do usuário; nada de token (o cookie é `httpOnly`).
 */
interface LastSession {
  user: UserPublic;
  onboardingComplete: boolean;
}

const KEY = 'atlas:last-session';

function read(): LastSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LastSession) : null;
  } catch {
    return null;
  }
}

function write(value: LastSession | null) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
  } catch {
    // Sem armazenamento (modo privado): o app só não abre offline.
  }
}

export function lastUser(): UserPublic | null {
  return read()?.user ?? null;
}

export function lastOnboardingComplete(): boolean {
  return read()?.onboardingComplete ?? false;
}

export function rememberUser(user: UserPublic) {
  const prev = read();
  write({
    user,
    onboardingComplete: prev?.user.id === user.id ? prev.onboardingComplete : false,
  });
}

export function rememberOnboarding(complete: boolean) {
  const prev = read();
  if (prev) write({ ...prev, onboardingComplete: complete });
}

export function forgetSession() {
  write(null);
}
