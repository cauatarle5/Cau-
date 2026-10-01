import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sem conexão · Atlas' };

/** Página servida pelo service worker quando não há rede nem cópia da página (ADR-060). */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Sem conexão</h1>
      <p className="text-sm text-muted-foreground">
        Esta tela ainda não foi aberta neste aparelho com internet. Um treino já iniciado continua
        funcionando offline; o que você registrar sincroniza quando a conexão voltar.
      </p>
      <a
        href="/hoje"
        className="mx-auto inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
      >
        Tentar de novo
      </a>
    </main>
  );
}
