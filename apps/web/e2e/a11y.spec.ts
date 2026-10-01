import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Usuário do seed demo (`pnpm db:seed:demo`): telas com dados reais. Só leitura.
const DEMO = { email: 'demo@atlas.app', password: 'demo-atlas-2026' };

/** Varre a página (WCAG 2.1 A/AA) e falha em violações sérias ou críticas (P13). */
async function scan(page: Page, name: string) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = result.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      page: name,
      rule: v.id,
      impact: v.impact,
      targets: v.nodes.slice(0, 5).map((n) => n.target.join(' ')),
    }));
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

test('auth screens have no serious accessibility violations', async ({ page }) => {
  await page.goto('/entrar');
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
  await scan(page, '/entrar');
  await page.goto('/cadastro');
  await expect(page.getByRole('button', { name: 'Criar conta' })).toBeVisible();
  await scan(page, '/cadastro');
});

test('main screens have no serious accessibility violations', async ({ page }) => {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(DEMO.email);
  await page.getByLabel('Senha').fill(DEMO.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForURL('**/hoje');

  const screens: [string, string][] = [
    ['/hoje', 'Hoje'],
    ['/nutricao', 'Nutrição'],
    ['/nutricao/planejar', 'Planejar'],
    ['/nutricao/receitas', 'Receitas'],
    ['/treino', 'Treino'],
    ['/progresso', 'Progresso'],
    ['/coach', 'Coach'],
    ['/perfil', 'Perfil'],
  ];
  // Claro e escuro: o tema segue o sistema (prefers-color-scheme).
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const [path, heading] of screens) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: heading }).first()).toBeVisible();
      await page.waitForLoadState('networkidle');
      await scan(page, `${path} (${colorScheme})`);
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });

  await page.goto('/hoje');
  await page.getByRole('button', { name: 'Registro rápido' }).click();
  await expect(page.getByRole('dialog', { name: 'Registro rápido' })).toBeVisible();
  await scan(page, 'registro rápido');
});

test('desktop keyboard: skip link, navigation and quick-log dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(DEMO.email);
  await page.getByLabel('Senha').fill(DEMO.password);
  await page.keyboard.press('Enter');
  await page.waitForURL('**/hoje');
  await expect(page.getByRole('heading', { level: 1, name: 'Hoje' })).toBeVisible();

  await page.keyboard.press('Tab');
  const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main#conteudo')).toBeFocused();

  // Sidebar alcançável por Tab a partir do início.
  await page.goto('/hoje');
  await expect(page.getByRole('heading', { level: 1, name: 'Hoje' })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Tab');
  const nav = page.getByRole('navigation', { name: 'Principal' }).first();
  await expect(nav.getByRole('link', { name: 'Hoje' })).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/treino$/);

  // Diálogo de registro rápido: abre por teclado, foco dentro, Esc fecha e devolve o foco.
  const fab = page.getByRole('button', { name: 'Registro rápido' });
  await fab.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Registro rápido' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(':focus')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(fab).toBeFocused();
});
