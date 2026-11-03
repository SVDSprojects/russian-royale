import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
test('profile appearance persists across devices and shows owned gifts around the avatar and by the name', async ({
  page,
  context,
  browser,
}) => {
  const email = randomUUID() + '@profile-design.test';
  const r = await context.request.post('/api/auth/register', {
    data: { email, username: 'CEO SDVS', password: 'Strong-test-password!' },
  });
  expect(r.ok()).toBeTruthy();
  const user = (await r.json()).user;
  const me = (await (await context.request.get('/api/social/me')).json()).me;
  const db = new DatabaseSync('data/e2e/royale.sqlite');
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(user.id);
  db.prepare('INSERT INTO rr_shop_profile(user_id,premium_until) VALUES(?,?)').run(
    user.id,
    Date.now() + 86400000,
  );
  const ids = Array.from({ length: 6 }, () => randomUUID());
  for (const [i, id] of ids.entries())
    db.prepare('INSERT INTO rr_inventory VALUES(?,?,?,?,?,?)').run(
      id,
      user.id,
      'gift',
      ['tsarukyan', 'quill', 'lexicon', 'orbit', 'belt', 'crown'][i],
      i + 1,
      Date.now(),
    );
  db.close();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#profile');
  await expect(page.locator('.profile-hero')).toBeVisible();
  await page.getByRole('button', { name: 'Редактировать профиль', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Редактировать профиль' });
  await dialog.getByLabel('О себе').fill('SDVS · игры, друзья и хорошие вечера');
  await dialog.getByLabel('День рождения', { exact: true }).fill('2000-11-03');
  await dialog.getByRole('button', { name: 'Сохранить профиль', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.profile-info')).toContainText('3 ноября');
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Оформление профиля' });
  await dialog.getByRole('button', { name: 'Палитра Роза' }).click();
  await dialog.getByLabel('Узор', { exact: true }).selectOption('paws');
  await dialog.getByLabel('Расположение подарков').selectOption('both');
  await dialog.getByLabel('Подарок рядом с именем').selectOption(ids[0]);
  for (const check of await dialog.locator('.profile-gift-picker input[type=checkbox]').all())
    await check.check();
  await dialog.getByRole('button', { name: 'Сохранить оформление', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.profile-orbit-gift')).toHaveCount(6);
  await expect(page.locator('.profile-display-name .profile-name-gift')).toBeVisible();
  await expect(page.locator('.profile-display-name .profile-name-gift .sdvs-gift-art')).toHaveCSS(
    'height',
    '27px',
  );
  await expect(page.locator('.profile-orbit-gift .sdvs-gift-art').first()).toHaveCSS('height', '58px');
  await expect(page.locator('.profile-hero')).toHaveCSS('--profile-color', '#b46374');
  await expect(page.locator('.profile-avatar-stage .rr-avatar')).toHaveCSS('border-radius', '50%');
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'artifacts/profile-new-rose.png', fullPage: true });
  await page.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await page.screenshot({ path: 'artifacts/profile-new-rose-dark.png', fullPage: true });
  const other = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const reg = await other.request.post('http://127.0.0.1:4173/api/auth/register', {
      data: { email: randomUUID() + '@viewer.test', username: 'Друг', password: 'Strong-test-password!' },
    });
    expect(reg.ok()).toBeTruthy();
    const q = await other.newPage();
    await q.goto('http://127.0.0.1:4173/#profile/' + me.publicId);
    await expect(q.locator('.profile-orbit-gift')).toHaveCount(6);
    await expect(q.locator('.profile-info')).toContainText('SDVS · игры');
    await expect(q.getByRole('button', { name: 'Редактировать профиль' })).toHaveCount(0);
    await expect(q.getByRole('button', { name: 'Добавить в друзья', exact: true })).toBeVisible();
  } finally {
    await other.close();
  }
  await page.getByRole('button', { name: 'Оформление', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Оформление профиля' });
  await dialog.getByRole('button', { name: 'Палитра Графит' }).click();
  await dialog.getByLabel('Узор', { exact: true }).selectOption('stars');
  await dialog.getByRole('button', { name: 'Сохранить оформление', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await page.screenshot({ path: 'artifacts/profile-new-graphite.png', fullPage: true });
});
