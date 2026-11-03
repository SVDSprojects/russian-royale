import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
test('admin can credit and debit XP from the users screen', async ({ page, context }) => {
  const email = randomUUID() + '@admin-xp.test';
  const r = await context.request.post('/api/auth/register', {
    data: { email, username: 'Админ XP', password: 'Strong-test-password!' },
  });
  expect(r.ok()).toBeTruthy();
  const user = (await r.json()).user;
  const db = new DatabaseSync('data/e2e/royale.sqlite');
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
  db.close();
  await page.goto('/admin.html#users');
  await page.getByLabel('Поиск пользователей').fill(email);
  const row = page.locator('tbody tr').filter({ hasText: email });
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Изменить XP для Админ XP' }).click();
  const dialog = page.getByRole('dialog', { name: 'Изменение XP' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Количество XP').fill('500');
  await dialog.getByLabel('Причина изменения').fill('Проверка начисления');
  await dialog.getByRole('button', { name: 'Начислить XP', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText('500 XP');
  await row.getByRole('button', { name: 'Изменить XP для Админ XP' }).click();
  await dialog.getByLabel('Действие с XP').selectOption('remove');
  await dialog.getByLabel('Количество XP').fill('200');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/admin-xp-phone.png', fullPage: true });
  await dialog.getByRole('button', { name: 'Списать XP', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText('300 XP');
});
