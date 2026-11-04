import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
test('admin sets and resets streak on a phone and the profile uses the new value', async ({
  page,
  context,
}) => {
  const email = randomUUID() + '@admin-streak.test';
  const r = await context.request.post('/api/auth/register', {
    data: { email, username: 'Админ серии', password: 'Strong-test-password!' },
  });
  expect(r.ok()).toBeTruthy();
  const user = (await r.json()).user;
  const db = new DatabaseSync('data/e2e/royale.sqlite');
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
  db.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin.html#users');
  await page.getByLabel('Поиск пользователей').fill(email);
  const row = page.locator('tbody tr').filter({ hasText: email });
  await row.getByRole('button', { name: 'Изменить серию для Админ серии' }).click();
  const dialog = page.getByRole('dialog', { name: 'Изменение серии' });
  await dialog.getByLabel('Количество дней подряд').fill('42');
  await dialog.getByLabel('Причина изменения').fill('Восстановление после пропуска');
  await expect(dialog.getByLabel('Количество дней подряд')).toHaveCSS('font-size', '16px');
  await page.screenshot({ path: 'artifacts/admin-streak-phone.png' });
  await dialog.getByRole('button', { name: 'Сохранить серию', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText('42 дн. подряд');
  await page.goto('/#profile');
  await expect(page.locator('.profile-hero-status')).toContainText('42 дн.');
  await page.getByRole('tab', { name: 'Статистика', exact: true }).click();
  await expect(page.locator('.social-legend')).toContainText('42');
  await page.goto('/admin.html#users');
  await page.getByLabel('Поиск пользователей').fill(email);
  await row.getByRole('button', { name: 'Изменить серию для Админ серии' }).click();
  await dialog.getByLabel('Количество дней подряд').fill('0');
  await dialog.getByRole('button', { name: 'Сохранить серию', exact: true }).click();
  await expect(row).toContainText('0 дн. подряд');
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  }
});
