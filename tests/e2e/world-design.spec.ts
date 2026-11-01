import { test, expect } from '@playwright/test';

test('world artwork, phone layout and reduced motion remain usable', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Создать аккаунт', exact: true })).toBeVisible();
  await expect(page.locator('.royale-world img')).toBeVisible();
  await expect
    .poll(() => page.locator('.royale-world img').evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await page.screenshot({ path: 'artifacts/world-welcome-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.getByRole('button', { name: 'Создать аккаунт', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'artifacts/world-welcome-phone.png', fullPage: true });

  const registration = await context.request.post('/api/auth/register', {
    data: {
      username: 'Мир игр',
      email: `world-${Date.now()}@royale.test`,
      password: 'Browser-test-password-2026!',
    },
  });
  expect(registration.ok()).toBe(true);
  await page.goto('/#home');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Твой следующий уровень', exact: true })).toBeVisible();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `artifacts/world-home-${width}.png`, fullPage: true });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      page
        .locator('.royale-world-token')
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe('none');
  await page.getByRole('button', { name: 'Начать приключение' }).click();
  await expect(page).toHaveURL(/#games\/jeopardy$/);
  await page.goto('/#games');
  await expect(page.locator('.rr-game-card.available')).toHaveCount(3);
  await page.screenshot({ path: 'artifacts/world-catalog-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'artifacts/world-catalog-phone.png', fullPage: true });
  await page.getByRole('button', { name: 'Для одного', exact: true }).click();
  await expect(page.locator('.arcade-mode')).toHaveCount(5);
  await page.locator('.arcade-mode.practice').click();
  await expect(page.getByRole('button', { name: 'Поехали', exact: true })).toBeVisible();
});
