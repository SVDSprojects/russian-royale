import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('home invites a server member into waiting games and removes vacated rooms', async ({ browser }) => {
  const host = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
  const guest = await browser.newContext({
    baseURL: 'http://127.0.0.1:4173',
    viewport: { width: 390, height: 844 },
  });
  async function post(ctx: typeof host, path: string, data = {}) {
    const r = await ctx.request.post('/api' + path, { data });
    expect(r.ok(), await r.text()).toBe(true);
    return r.json();
  }
  try {
    for (const [i, ctx] of [host, guest].entries())
      await post(ctx, '/auth/register', {
        username: `Игрок ${i}`,
        email: `${randomUUID()}@waiting.test`,
        password: 'Browser-test-password-2026!',
      });
    const server = await post(host, '/servers', { name: 'Ара Срго' });
    const invite = await post(host, `/servers/${server.id}/invites`);
    await post(guest, `/invites/${invite.token}/join`);
    const page = await guest.newPage();
    await page.goto('/#home');
    await expect(page.locator('.waiting-games')).toHaveCount(0);
    const spy = await post(host, `/servers/${server.id}/rooms`, { name: 'Собираемся играть' });
    await expect(page.getByRole('heading', { name: 'Скорее присоединяйтесь к игре!' })).toBeVisible();
    await expect(page.locator('.waiting-games')).toContainText('Ара Срго');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('.waiting-games').screenshot({ path: 'artifacts/waiting-games-mobile.png' });
    await page.locator('.waiting-games button').click();
    await expect(page.getByRole('button', { name: 'Я готов играть', exact: true })).toBeVisible();
    await post(host, `/rooms/${spy.id}/leave`);
    await page.goto('/#home');
    await expect(page.locator('.waiting-games')).toHaveCount(0);
    for (const game of ['jeopardy', 'roulette']) {
      const r = await post(host, `/games/${game}/rooms`, {
        serverId: server.id,
        name: game,
        commandId: randomUUID(),
        expectedVersion: 0,
        settings:
          game === 'jeopardy'
            ? { contentId: 'demo', teamCount: 2 }
            : { contentId: 'demo', mode: 'points', durations: [30000, 25000, 20000] },
      });
      const card = page
        .locator('.waiting-games article')
        .filter({ has: page.getByText(game, { exact: true }) });
      await expect(card).toBeVisible();
      await card.getByRole('button').click();
      await expect(page).toHaveURL(new RegExp(`#games/${game}/${r.roomId}$`));
      await expect(page.getByRole('button', { name: 'Я готов', exact: true })).toBeVisible();
      await page.goto('/#home');
    }
  } finally {
    await host.close();
    await guest.close();
  }
});
