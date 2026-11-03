import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
test('phone admin has visible navigation, readable controls and user cards without horizontal scrolling', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const email = randomUUID() + '@mobile-admin.test';
  const registered = await context.request.post('/api/auth/register', {
    data: { email, username: 'Админ телефона', password: 'Strong-test-password!' },
  });
  expect(registered.ok()).toBeTruthy();
  const user = (await registered.json()).user;
  const db = new DatabaseSync('data/e2e/royale.sqlite');
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
  db.close();
  await context.request.get('/api/social/me');
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/admin.html');
    const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Меню');
    await expect(menu).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(menu).toHaveCSS('background-color', 'rgb(36, 85, 245)');
    expect((await menu.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await menu.click();
    const drawer = page.getByRole('dialog', { name: 'Разделы админки' });
    await expect(drawer).toBeVisible();
    await expect(drawer).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await drawer.getByRole('button', { name: 'Пользователи', exact: true }).click();
    await expect(drawer).not.toBeVisible();
    await page.getByLabel('Поиск пользователей').fill(email);
    const row = page.locator('.adm-users-panel tbody tr').filter({ hasText: email });
    await expect(row).toHaveCount(1);
    const xp = row.getByRole('button', { name: 'Изменить XP для Админ телефона' });
    await expect(xp).toBeInViewport();
    const box = (await xp.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    if (width === 390) await page.screenshot({ path: 'artifacts/admin-mobile-users.png', fullPage: true });
    await xp.click();
    const dialog = page.getByRole('dialog', { name: 'Изменение XP' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Количество XP')).toHaveCSS('font-size', '16px');
    await dialog.getByRole('button', { name: 'Отмена' }).click();
    await menu.click();
    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(menu).toBeFocused();
    await page.getByLabel('Выбрать раздел админки').selectOption('overview');
    await expect(page.locator('.adm-page-heading h1')).toHaveText('Здесь начинается знание');
    if (width === 390) {
      await page.screenshot({ path: 'artifacts/admin-mobile-overview.png', fullPage: true });
      await menu.click();
      await page.screenshot({
        path: 'artifacts/admin-mobile-menu.png',
        fullPage: true,
        animations: 'disabled',
      });
      await page.getByRole('button', { name: 'Закрыть разделы', exact: true }).click();
    }
  }
  for (const section of ['rules', 'teacher', 'servers', 'dictionary', 'roulette', 'mafia']) {
    await page.getByLabel('Выбрать раздел админки').selectOption(section);
    await expect(page.getByRole('button', { name: 'Открыть меню', exact: true })).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      section,
    ).toBeTruthy();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.getByLabel('Выбрать раздел админки')).not.toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Административные разделы' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Разделы админки' })
    .getByRole('button', { name: 'Выйти', exact: true })
    .click();
  await expect(page.locator('.adm-auth-card')).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
