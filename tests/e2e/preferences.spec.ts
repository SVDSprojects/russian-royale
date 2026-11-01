import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('theme persists across devices and notification bell opens', async ({ browser }) => {
  const c = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const email = randomUUID() + '@theme.test',
    password = 'Strong-test-password!';
  try {
    await c.request.post('http://127.0.0.1:4173/api/auth/register', {
      data: { email, password, username: 'Тема' },
    });
    const p = await c.newPage();
    await p.goto('http://127.0.0.1:4173/#settings');
    await p.getByLabel('Тема оформления').selectOption('dark');
    await expect(p.locator('html')).toHaveAttribute('data-theme', 'dark');
    await p.reload();
    await expect(p.locator('html')).toHaveAttribute('data-theme', 'dark');
    await p.getByRole('button', { name: 'Уведомления', exact: true }).click();
    await expect(p.getByLabel('Центр уведомлений')).toBeVisible();
    await p.getByLabel('Закрыть уведомления').click();
    await p.screenshot({ path: 'artifacts/settings-dark.png', fullPage: true });
    await p.goto('http://127.0.0.1:4173/#home');
    await p.screenshot({ path: 'artifacts/home-dark.png', fullPage: true });
    const d = await browser.newContext();
    try {
      await d.request.post('http://127.0.0.1:4173/api/auth/login', { data: { email, password } });
      const q = await d.newPage();
      await q.goto('http://127.0.0.1:4173/#settings');
      await expect(q.locator('html')).toHaveAttribute('data-theme', 'dark');
      await q.getByLabel('Тема оформления').selectOption('light');
      await expect(q.locator('html')).toHaveAttribute('data-theme', 'light');
    } finally {
      await d.close();
    }
  } finally {
    await c.close();
  }
});
