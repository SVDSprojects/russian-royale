import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
test('social profiles persist, friends accept and graphs render on mobile', async ({ browser }) => {
  const a = await browser.newContext({ viewport: { width: 390, height: 844 } }),
    b = await browser.newContext();
  try {
    for (const [i, c] of [a, b].entries())
      await c.request.post('http://127.0.0.1:4173/api/auth/register', {
        data: {
          username: 'Друг ' + i,
          email: randomUUID() + '@social.test',
          password: 'Strong-test-password!',
        },
      });
    const p = await a.newPage();
    await p.goto('http://127.0.0.1:4173/#profile');
    await p.getByRole('button', { name: 'Редактировать профиль', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Редактировать профиль' })).toBeVisible();
    await p.getByLabel('Ник', { exact: true }).fill('Игрок после правки');
    await p.getByLabel('О себе').fill('Мой новый профиль');
    await p.getByRole('button', { name: 'Сохранить профиль' }).click();
    await expect(p.getByRole('heading', { name: 'Игрок после правки' })).toBeVisible();
    const other = (await (await b.request.get('http://127.0.0.1:4173/api/social/me')).json()).me;
    await p.getByLabel('Ник или ID друга').fill(other.publicId);
    await p.getByRole('button', { name: 'Найти', exact: true }).click();
    await p.getByRole('button', { name: 'Добавить', exact: true }).click();
    const q = await b.newPage();
    await q.goto('http://127.0.0.1:4173/#friends');
    await q.getByRole('button', { name: 'Принять', exact: true }).click();
    await expect(q.getByRole('button', { name: 'Где играет' })).toBeVisible();
    await p.reload();
    await expect(p.getByRole('button', { name: 'Где играет' })).toBeVisible();
    await expect(p.getByRole('img', { name: 'График вашей активности и активности друзей' })).toBeVisible();
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await p.screenshot({ path: 'artifacts/social-mobile.png', fullPage: true });
  } finally {
    await a.close();
    await b.close();
  }
});
