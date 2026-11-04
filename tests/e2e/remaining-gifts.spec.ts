import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { additionalGifts } from '../../shared/additional-gifts';

test('all remaining gift models are selectable, render their supplied art and respect reduced motion', async ({
  page,
  context,
}) => {
  const registered = await context.request.post('/api/auth/register', {
    data: {
      email: randomUUID() + '@remaining.test',
      username: 'Подарки SDVS',
      password: 'Strong-test-password!',
    },
  });
  expect(registered.ok()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#collection');
  const filter = page.getByLabel('Коллекция подарков');
  const models = Array.from(new Set(additionalGifts.map((g) => g.model)));
  expect(models).toHaveLength(32);
  expect(additionalGifts).toHaveLength(158);
  for (const model of models) {
    const variants = additionalGifts.filter((g) => g.model === model);
    await filter.selectOption(model);
    await expect(page.locator('.sdvs-catalog-grid .sdvs-gift-card')).toHaveCount(variants.length);
    const art = page.locator('.sdvs-catalog-grid').getByRole('img', { name: variants[0].name, exact: true });
    await art.scrollIntoViewIfNeeded();
    await expect(art).toHaveAttribute('src', variants[0].animation);
    await expect
      .poll(() => art.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 512))
      .toBeTruthy();
  }
  await filter.selectOption('corgi');
  await expect(page.locator('.sdvs-catalog-grid .sdvs-gift-card')).toHaveCount(3);
  await filter.selectOption('snoop');
  await page.locator('.sdvs-catalog-grid').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/remaining-gifts-snoop.png' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.sdvs-catalog-grid img').first()).toHaveAttribute(
    'src',
    additionalGifts.find((g) => g.model === 'snoop')!.poster,
  );
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  }
});
