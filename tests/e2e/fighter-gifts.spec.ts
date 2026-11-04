import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fighterGifts } from '../../shared/fighter-gifts';
import { animatedGifts } from '../../shared/collection';

test('all imported fighter backgrounds render and owned animated gifts work in profiles and transfers', async ({
  page,
  context,
  browser,
}) => {
  const registered = await context.request.post('/api/auth/register', {
    data: {
      email: randomUUID() + '@fighters.test',
      username: 'Коллекционер',
      password: 'Strong-test-password!',
    },
  });
  expect(registered.ok()).toBeTruthy();
  const user = (await registered.json()).user;
  const me = (await (await context.request.get('/api/social/me')).json()).me;
  const itemId = randomUUID();
  const db = new DatabaseSync('data/e2e/royale.sqlite');
  db.prepare('INSERT INTO rr_inventory VALUES(?,?,?,?,?,?)').run(
    itemId,
    user.id,
    'gift',
    'khabib-v01',
    1,
    Date.now(),
  );
  db.close();
  const shop = await (await context.request.get('/api/collection')).json();
  expect(shop.gifts.filter((g: { model?: string }) => g.model)).toHaveLength(animatedGifts.length);
  expect(
    (
      await context.request.patch('/api/collection/appearance', {
        data: { emoji: '', featured: [itemId], style: { giftLayout: 'both', statusGiftId: itemId } },
      })
    ).ok(),
  ).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#collection');
  const filter = page.getByLabel('Коллекция подарков');
  for (const model of ['khabib', 'islam', 'topuria', 'mcgregor', 'omalley']) {
    await filter.selectOption(model);
    const cards = page.locator('.sdvs-catalog-grid .sdvs-gift-card');
    await expect(cards).toHaveCount(5);
    for (const gift of fighterGifts.filter((g) => g.model === model)) {
      const image = page.locator('.sdvs-catalog-grid').getByRole('img', { name: gift.name, exact: true });
      await image.scrollIntoViewIfNeeded();
      await expect(image).toHaveAttribute('src', gift.animation);
      await expect
        .poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth === 512))
        .toBeTruthy();
    }
  }
  await expect(page.locator('html')).toHaveJSProperty('scrollWidth', 390);
  await filter.selectOption('omalley');
  await page.locator('.sdvs-catalog-grid').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/fighter-gifts-mobile.png', fullPage: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const first = fighterGifts.find((g) => g.model === 'omalley')!;
  await expect(
    page.locator('.sdvs-catalog-grid').getByRole('img', { name: first.name, exact: true }),
  ).toHaveAttribute('src', first.poster);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/#profile');
  await expect(page.locator('.profile-display-name .profile-name-gift .sdvs-gift-art')).toHaveCSS(
    'height',
    '27px',
  );
  await expect(page.locator('.profile-orbit-gift .sdvs-gift-art')).toHaveCSS('height', '58px');
  const status = page.locator('.profile-display-name .profile-name-gift img');
  await expect(status).toHaveAttribute('src', fighterGifts[0].animation);
  await page.screenshot({ path: 'artifacts/fighter-profile-mobile.png', fullPage: true });
  const other = await browser.newContext();
  try {
    const recipientRequest = await other.request.post('http://127.0.0.1:4173/api/auth/register', {
      data: { email: randomUUID() + '@fighters.test', username: 'Друг', password: 'Strong-test-password!' },
    });
    expect(recipientRequest.ok()).toBeTruthy();
    const recipient = (await (await other.request.get('http://127.0.0.1:4173/api/social/me')).json()).me;
    await context.request.post('/api/social/friends/' + recipient.publicId, { data: {} });
    await other.request.post('http://127.0.0.1:4173/api/social/friends/' + me.publicId, { data: {} });
    expect(
      (
        await context.request.post('/api/collection/gifts/' + itemId + '/send', {
          data: { targetId: recipient.publicId },
        })
      ).ok(),
    ).toBeTruthy();
    const received = await (await other.request.get('http://127.0.0.1:4173/api/collection')).json();
    expect(received.inventory).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: itemId, reward: 'khabib-v01', serial: 1 })]),
    );
    await page.reload();
    await expect(page.locator('.profile-display-name .profile-name-gift')).toHaveCount(0);
    await expect(page.locator('.profile-orbit-gift')).toHaveCount(0);
  } finally {
    await other.close();
  }
});
