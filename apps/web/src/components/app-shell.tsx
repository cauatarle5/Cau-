'use client';

import { Activity, Dumbbell, LineChart, MessageCircle, Sun, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

import { QuickLogFab } from './quick-log-fab';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// Ordem fixa da navegação (PROMPT_MESTRE 12.1).
const NAV_ITEMS: readonly NavItem[] = [
  { href: '/hoje', label: 'Hoje', icon: Sun },
  { href: '/treino', label: 'Treino', icon: Dumbbell },
  { href: '/nutricao', label: 'Nutrição', icon: Activity },
  { href: '/progresso', label: 'Progresso', icon: LineChart },
  { href: '/coach', label: 'Coach', icon: MessageCircle },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ userName, children }: { userName: string; children: ReactNode }) {
  const pathname = usePathname();
  const initial = userName.trim().charAt(0).toUpperCase() || '?';

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <aside className="hidden border-r border-border bg-card lg:flex lg:flex-col lg:gap-6 lg:p-4">
        <p className="px-3 pt-2 text-xl font-semibold tracking-tight">Atlas</p>
        <nav aria-label="Principal" className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground',
                isActive(pathname, href) && 'bg-muted text-foreground',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="flex min-h-dvh flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-2 backdrop-blur">
          <p className="text-lg font-semibold tracking-tight lg:invisible">Atlas</p>
          <Link
            href="/perfil"
            aria-label="Perfil"
            className="flex size-11 items-center justify-center rounded-full bg-muted text-sm font-semibold hover:ring-2 hover:ring-ring"
          >
            {initial}
          </Link>
        </header>

        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl flex-1 px-4 pb-24 pt-6 lg:pb-10"
        >
          {children}
        </main>
        <QuickLogFab />

        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(pathname, href) ? 'page' : undefined}
              className={cn(
                'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted-foreground',
                isActive(pathname, href) && 'text-primary',
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
