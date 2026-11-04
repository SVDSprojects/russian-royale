import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

async function api(context: BrowserContext, path: string, data?: unknown) {
  const r =
    data === undefined
      ? await context.request.get('/api' + path)
      : await context.request.post('/api' + path, { data });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
async function screen(page: Page, name: string, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: `artifacts/second-world-${name}-${width}.png`, fullPage: true });
}

for (const game of ['jeopardy', 'roulette'] as const)
  test(`${game}: two players complete a question in the new game world`, async ({ browser }) => {
    test.setTimeout(90000);
    const contexts = await Promise.all(
      [0, 1].map(() =>
        browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 } }),
      ),
    );
    const pages = await Promise.all(contexts.map((c) => c.newPage()));
    const [host, guest] = pages;
    const errors: string[] = [];
    for (const page of pages) page.on('pageerror', (e) => errors.push(e.message));
    try {
      for (const [i, context] of contexts.entries())
        await api(context, '/auth/register', {
          username: ['Саша', 'Ира'][i],
          email: `world-${game}-${randomUUID()}@royale.test`,
          password: 'Browser-test-password-2026!',
        });
      for(const c of contexts) await api(c, '/servers');
      const server = {id:'public-'+game};
      await host.goto('/#games/' + game);
      await host.reload();
      await expect(host.getByRole('button', { name: 'Создать партию', exact: true })).toBeEnabled();
      await host.getByLabel('Набор заданий', { exact: true }).selectOption('demo');
      await screen(host, `${game}-entrance`);
      await screen(host, `${game}-entrance`, 390);
      await host.getByRole('button', { name: 'Создать партию', exact: true }).click();
      await expect(host.getByRole('button', { name: 'Я готов', exact: true })).toBeVisible();
      const roomId = host.url().split(`#games/${game}/`)[1];
      const roomPath = `/games/${game}/rooms/${roomId}`;
      const get = () => api(contexts[0], roomPath + '/view');
      const initial = await get();
      await api(contexts[1], roomPath + '/join', {
        commandId: randomUUID(),
        expectedVersion: initial.version,
      });
      await guest.goto(`/#games/${game}/${roomId}`);
      await host.reload();
      await expect(host.getByRole('button', { name: 'Я готов', exact: true })).toBeVisible();
      await screen(host, `${game}-lobby`);
      await screen(host, `${game}-lobby`, 390);
      await host.getByRole('button', { name: 'Я готов', exact: true }).click();
      await expect(host.getByRole('button', { name: 'Отменить готовность', exact: true })).toBeVisible();
      await guest.reload();
      await guest.getByRole('button', { name: 'Я готов', exact: true }).click();
      await expect(host.getByRole('button', { name: 'Начать игру ↗', exact: true })).toBeEnabled();
      await host.getByRole('button', { name: 'Начать игру ↗', exact: true }).click();
      const content = JSON.parse(readFileSync(`server/games/${game}/initial-content.json`, 'utf8'));
      if (game === 'jeopardy') {
        await expect(host.locator('.rr-board')).toBeVisible();
        await screen(host, `${game}-board`);
        await screen(host, `${game}-board`, 390);
        const boardState = await get();
        const captain = boardState.view.teams.find(
          (t: { id: string }) => t.id === boardState.view.chooserTeamId,
        ).captainId;
        const hostIdentity = (await api(contexts[0], '/auth/me')).user.id;
        const chooserPage = captain === hostIdentity ? host : guest;
        await chooserPage.locator('.rr-active-island button:not([disabled])').first().click();
        await expect.poll(async () => (await get()).view.phase).toBe('answer');
        const state = await get();
        const answeringPage = state.view.answererId === hostIdentity ? host : guest;
        await expect(answeringPage.getByLabel('Ваш ответ', { exact: true })).toBeVisible();
        await screen(answeringPage, `${game}-question`, 390);
        const answer = content.questions.find((q: { id: string }) => q.id === state.view.question.id).acceptedAnswers[0];
        await answeringPage.getByLabel('Ваш ответ', { exact: true }).fill(answer);
        await answeringPage.getByRole('button', { name: 'Отправить ответ', exact: true }).click();
      } else {
        await expect.poll(async () => (await get()).view.phase).toBe('question');
        await expect(
          host.locator('.rr-options').or(host.getByLabel('Ваш ответ', { exact: true })),
        ).toBeVisible();
        await screen(host, `${game}-question`);
        await screen(host, `${game}-question`, 390);
        const state = await get();
        const answer = content.questions.find((q: { id: string }) => q.id === state.view.question.id)
          .acceptedAnswers[0];
        if (state.view.question.options.length)
          await host.locator('.rr-options button').nth(state.view.question.options.indexOf(answer)).click();
        else {
          await host.getByLabel('Ваш ответ', { exact: true }).fill(answer);
          await host.getByRole('button', { name: 'Отправить', exact: true }).click();
        }
        await expect.poll(async () => (await get()).view.answeredUserIds.length).toBe(1);
        const next = await api(contexts[1], roomPath + '/view');
        await api(contexts[1], roomPath + '/actions', {
          commandId: randomUUID(),
          expectedVersion: next.version,
          action: { type: 'answer', text: answer },
        });
      }
      await expect(host.locator('.rr-reveal')).toBeVisible();
      await screen(host, `${game}-answer`, 390);
      const state = await get();
      expect(state.view.reveal.answers.some((a: { correct: boolean }) => a.correct)).toBe(true);

      // Render a final-state fixture for visual QA; real engine completion is covered by imported-games.test.ts.
      const winner = state.view.players[0].id;
      const finalView = {
        ...state,
        version: state.version + 100000,
        serverNow: Date.now(),
        view: {
          ...state.view,
          phase: 'finished',
          deadline: null,
          result: {
            sessionId: state.view.sessionId,
            outcome: 'win',
            winnerUserIds: [winner],
            scores: state.view.players.map((p: { id: string }, i: number) => ({
              userId: p.id,
              score: i ? 300 : 800,
            })),
          },
        },
      };
      await host.route(`**/api${roomPath}/view`, (route) => route.fulfill({ json: finalView }));
      await host.reload();
      await expect(host.locator('.rr-result')).toBeVisible();
      await screen(host, `${game}-result`);
      await screen(host, `${game}-result`, 390);
      await host.emulateMedia({ reducedMotion: 'reduce' });
      await expect
        .poll(() =>
          host
            .locator(`.rr-game-${game}`)
            .evaluate(
              (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
            ),
        )
        .toBe(0);
      await host.emulateMedia({ reducedMotion: 'no-preference' });
      await host.evaluate(() => (document.documentElement.dataset.reduceMotion = 'true'));
      await expect
        .poll(() =>
          host
            .locator(`.rr-game-${game}`)
            .evaluate(
              (el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
            ),
        )
        .toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
