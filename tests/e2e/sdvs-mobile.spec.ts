import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
test('phone navigation, collections, dictionary and three learning games work together', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const email = randomUUID() + '@sdvs.test';
  const registered = await context.request.post('/api/auth/register', {
    data: { email, username: 'Мобильный игрок', password: 'Browser-test-password-2026!' },
  });
  expect(registered.ok()).toBe(true);
  const user = (await registered.json()).user;
  const db = new DatabaseSync('data/e2e/royale.sqlite');
  try {
    db.prepare('UPDATE users SET xp=100000 WHERE id=?').run(user.id);
  } finally {
    db.close();
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#home');
  const nav = page.getByRole('navigation', { name: 'Навигация на телефоне' });
  await expect(nav).toBeVisible();
  await nav.getByRole('link', { name: 'Учиться', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Учиться в своём темпе' })).toBeVisible();
  await page.getByRole('link', { name: 'Академический словарь', exact: false }).last().click();
  await expect(page.getByRole('heading', { name: 'Словарь готовится', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/sdvs-dictionary-phone.png', fullPage: true });
  await page.goto('/#collection');
  await expect(page.getByRole('heading', { name: 'Коллекции SDVS' })).toBeVisible();
  for (const card of await page.locator('.sdvs-catalog-grid .sdvs-gift-card').all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(
      card.locator('img:not(.tsarukyan-motion):not(.tsarukyan-still), .sdvs-tsarukyan-render'),
    ).toBeVisible();
    await expect.poll(() => card.locator('img').first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.getByRole('button', { name: 'Открыть · 500 XP', exact: true }).click();
  const reveal = page.getByRole('dialog');
  await expect(reveal).toBeVisible();
  await reveal.getByRole('button', { name: 'Отлично', exact: true }).click();
  await expect(page.locator('.sdvs-owned-grid .sdvs-gift-card')).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'В витрину' }).check();
  await page.getByRole('button', { name: 'Сохранить оформление' }).click();
  await expect(page.getByText('Витрина сохранена.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Получить · 30 000 XP' }).click();
  await expect(reveal).toBeVisible();
  await reveal.getByRole('button', { name: 'Отлично' }).click();
  await page.getByRole('button', { name: 'Фон 🔥', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить оформление' }).click();
  await expect(page.locator('.sdvs-profile-pattern').first()).toContainText('🔥');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'artifacts/sdvs-collection-phone.png', fullPage: true });
  await nav.getByRole('link', { name: 'Профиль', exact: true }).click();
  await expect(page.locator('.sdvs-showcase')).toBeVisible();
  await page.screenshot({ path: 'artifacts/sdvs-profile-phone.png', fullPage: true });
  for (const [mode, first] of [
    ['editor', 'Самый вкусный кофе — он здесь!'],
    ['stress', 'НИТ'],
    ['punctuation', 'Запятая нужна'],
  ] as const) {
    await page.goto('/#challenge/' + mode);
    await expect(page.locator('.sdvs-challenge-stage')).toBeVisible();
    await page.getByRole('button', { name: first, exact: false }).click();
    if (mode === 'punctuation')
      await page.getByRole('button', { name: 'Граница главной и придаточной частей', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Точно!', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: 'artifacts/sdvs-' + mode + '-phone.png', fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#collection');
  await expect(page.locator('.sdvs-case-grid')).toBeVisible();
  for (const card of await page.locator('.sdvs-catalog-grid .sdvs-gift-card').all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(
      card.locator('img:not(.tsarukyan-motion):not(.tsarukyan-still), .sdvs-tsarukyan-render'),
    ).toBeVisible();
    await expect.poll(() => card.locator('img').first().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'artifacts/sdvs-collection-desktop.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('small phones have readable registration and usable learning navigation', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/');
  await expect(page.locator('.rr-auth-form')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'artifacts/sdvs-registration-320.png', fullPage: true });
});
