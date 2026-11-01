import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

test('arcade survival ends after three errors and sprint expires without an answer', async ({ page }) => {
  await signup(page, 'Аркадный игрок');
  await page.goto('/#arcade/survival');
  await page.getByRole('button', { name: 'Поехали', exact: true }).click();
  for (let i = 0; i < 3; i++) {
    const prompt = await page.locator('.arcade-question').innerText();
    const wrong = /Ключ|Мяч/.test(prompt) ? 'Е' : 'И';
    await page.getByRole('button', { name: wrong, exact: true }).click();
    await page.getByRole('button', { name: 'Зафиксировать ответ', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Разбираем промах', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: '0 правильных ответов', exact: true })).toBeVisible();
  await expect(page.locator('.arcade-review article')).toHaveCount(3);
  await page.goto('/#arcade/sprint');
  await page.clock.install();
  await page.getByRole('button', { name: 'Поехали', exact: true }).click();
  await expect(page.locator('.arcade-question')).toBeVisible();
  await page.clock.fastForward(61000);
  await expect(page.getByRole('heading', { name: '0 правильных ответов', exact: true })).toBeVisible();
  await page.goto('/#arcade/practice');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Поехали', exact: true }).click();
  await expect(page.locator('.arcade-question')).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: 'artifacts/arcade-mobile.png', fullPage: true });
});
const password = 'Browser-test-password-2026!';

test('review survives reload, clears corrected tasks, and the catalogue separates playable games', async ({
  page,
}) => {
  await signup(page, 'Повторение');
  await page.goto('/#games');
  await expect(page.getByText('В разработке', { exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'В разработке', exact: true }).click();
  await expect(page.locator('.rr-game-card.upcoming')).toHaveCount(7);
  await page.getByLabel('Поиск игр').fill('бункер');
  await expect(page.locator('.rr-game-card')).toHaveCount(1);
  await page.goto('/#arcade/review');
  await expect(page.getByText('Ошибок для повторения нет.', { exact: false })).toBeVisible();
  const bank = await api(page.context(), '/training');
  const task = bank.exercises[0];
  const response = await api(page.context(), `/exercises/${task.id}/answer`, { answer: 'заведомая ошибка' });
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByText('Подходит заданий: 1', { exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/review-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Поехали', exact: true }).click();
  if (task.options.length) await page.getByRole('button', { name: response.answer, exact: true }).click();
  else await page.getByLabel('Ваш ответ').fill(response.answer);
  await page.getByRole('button', { name: 'Зафиксировать ответ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Попадание!', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Дальше', exact: true }).click();
  await expect(page.getByRole('heading', { name: '1 правильных ответов', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Изменить подборку', exact: true }).click();
  await expect(page.getByText('Подходит заданий: 0', { exact: true })).toBeVisible();
  await noOverflow(page);
});
test('memory keeps mismatches hidden and completes all matched pairs on mobile', async ({ page }) => {
  await signup(page, 'Игрок мемори');
  await page.route('**/api/rules', (route) =>
    route.fulfill({
      json: [
        { id: 'pair-a', title: 'Приставки', examples: ['Подъезд'] },
        { id: 'pair-b', title: 'Суффиксы', examples: ['Ключик'] },
        { id: 'pair-c', title: 'Корни', examples: ['Касаться'] },
      ],
    }),
  );
  await page.goto('/#arcade/memory');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Раздать карточки', exact: true }).click();
  const cards = page.locator('.memory-card');
  await expect(cards).toHaveCount(6);
  const known = new Map<string, number>();
  const pairs = new Map([
    ['ПРАВИЛО: Приставки', 'ПРИМЕР: Подъезд'],
    ['ПРАВИЛО: Суффиксы', 'ПРИМЕР: Ключик'],
    ['ПРАВИЛО: Корни', 'ПРИМЕР: Касаться'],
  ]);
  for (let i = 0; i < 6; i += 2) {
    await cards.nth(i).click();
    known.set((await cards.nth(i).getAttribute('aria-label'))!, i);
    await cards.nth(i + 1).click();
    known.set((await cards.nth(i + 1).getAttribute('aria-label'))!, i + 1);
    await expect.poll(async () => page.locator('.memory-card.revealed:not(.matched)').count()).toBe(0);
  }
  for (const [rule, example] of pairs) {
    const first = cards.nth(known.get(rule)!),
      second = cards.nth(known.get(example)!);
    if (await first.isDisabled()) continue;
    await first.click();
    await second.click();
  }
  await expect(page.locator('.memory-card.matched')).toHaveCount(6);
  await expect(page.getByRole('heading', { name: /Поле раскрыто за/ })).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: 'artifacts/memory-mobile.png', fullPage: true });
});
const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
async function signup(page: Page, name = 'Тестовый игрок') {
  const email = `e2e-${unique()}@royale.test`;
  await page.goto('/');
  await page.getByLabel('Имя игрока', { exact: true }).fill(name);
  await page.getByLabel('Электронная почта', { exact: true }).fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Твой следующий уровень', exact: true })).toBeVisible();
  return email;
}
async function api(context: BrowserContext, path: string, data?: unknown) {
  const r = await context.request.fetch('/api' + path, {
    method: data === undefined ? 'GET' : 'POST',
    ...(data === undefined ? {} : { data }),
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.json();
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
}
test('student registration, real lesson, saved XP and responsive navigation', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await signup(page, 'Саша');
  mkdirSync('artifacts', { recursive: true });
  await expect(page.locator('.rr-lesson-character img')).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('.rr-lesson-character img')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true);
  await page.screenshot({ path: 'artifacts/student-desktop.png', fullPage: true });
  await noOverflow(page);
  await page.getByRole('button', { name: 'Начать урок', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Секрет исчезающей гласной' })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Далее', exact: true }).click();
  await page.screenshot({ path: 'artifacts/lesson-desktop.png', fullPage: true });
  for (const answer of ['Е', 'И', 'Е', 'И']) {
    await page.getByRole('radio', { name: answer, exact: true }).check();
    await page.getByRole('button', { name: 'Проверить ответ', exact: true }).click();
    await expect(page.getByText('Всё верно!', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Далее', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Завершить урок', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Правило стало понятнее!' })).toBeVisible();
  const profile = await api(context, '/profile');
  expect(profile.stats.lessons).toBe(1);
  expect(profile.user.xp).toBe(40);
  await page.goto('/#home');
  await expect(page.getByRole('heading', { name: 'Твой следующий уровень', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({ path: 'artifacts/student-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
  await page.getByRole('link', { name: 'Справочник правил', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Справочник правил', exact: true })).toBeVisible();
  await noOverflow(page);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await context.setOffline(true);
  await page.goto('/offline-check');
  await expect(page.getByRole('heading', { name: 'Сеть взяла паузу' })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Попробовать снова' }).click();
  await expect(page.getByRole('heading', { name: 'Твой следующий уровень' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('server protected Admin and real rule editing/deletion plus character replacement', async ({
  page,
  context,
}) => {
  const email = await signup(page, 'Редактор');
  await page.goto('/admin.html');
  await expect(page.getByRole('heading', { name: 'Это пространство редакторов' })).toBeVisible();
  expect((await context.request.get('/api/admin/rules')).status()).toBe(403);
  execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'server/admin-cli.ts', email], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_PATH: resolve('data/e2e/royale.sqlite') },
    stdio: 'pipe',
    windowsHide: true,
  });
  await page.getByRole('button', { name: 'Обновить доступ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Здесь начинается знание' })).toBeVisible();
  await page.screenshot({ path: 'artifacts/admin-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Правила', exact: true }).click();
  await page.getByRole('button', { name: 'Новое правило', exact: true }).click();
  const title = `Проверка редактора ${unique()}`;
  await page.getByLabel('Название правила', { exact: true }).fill(title);
  await page.getByLabel('Краткое объяснение', { exact: true }).fill('Короткая проверка рабочего редактора.');
  await page.getByLabel(/^Полное объяснение/).fill('Материал создан в изолированной базе браузерных тестов.');
  await page.getByRole('checkbox', { name: /Опубликовать/ }).check();
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('Правило сохранено.', { exact: true })).toBeVisible();
  const rules = await api(context, '/rules');
  const created = rules.find((r: any) => r.title === title);
  expect(created).toBeTruthy();
  await page.getByLabel('Название правила', { exact: true }).fill(title + ' изменено');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect.poll(async () => (await api(context, `/rules/${created.id}`)).title).toBe(title + ' изменено');
  await page.screenshot({ path: 'artifacts/admin-rule.png', fullPage: true });
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  expect((await context.request.get(`/api/rules/${created.id}`)).status()).toBe(404);
  await page.getByRole('button', { name: 'Учительница', exact: true }).click();
  await page.getByLabel('Имя персонажа', { exact: true }).fill('Мария Ивановна');
  await page.locator('input[type=file]').first().setInputFiles('public/assets/teacher-neutral.png');
  await expect(page.locator('.adm-emotion-card img').first()).toHaveAttribute('src', /^\/uploads\//);
  await page.getByRole('button', { name: 'Сохранить персонажа', exact: true }).click();
  await expect(page.getByText('Персонаж и реплики сохранены.', { exact: true })).toBeVisible();
  expect((await api(context, '/teacher')).images.neutral).toMatch(/^\/uploads\/.*\.webp$/);
  // Build a real lesson and reorder blocks, including the local-network UUID fallback.
  await page.getByRole('button', { name: 'Уроки', exact: true }).click();
  await page.getByRole('button', { name: 'Новый урок', exact: true }).click();
  const lessonTitle = `Урок редактора ${unique()}`;
  await page.getByLabel('Название урока', { exact: true }).fill(lessonTitle);
  await page.getByRole('button', { name: 'Добавить блок', exact: true }).click();
  await page.getByLabel('Реплика учительницы', { exact: true }).fill('Начнём новый урок.');
  await page.getByLabel('Тип нового блока', { exact: true }).selectOption('explanation');
  await page.getByRole('button', { name: 'Добавить блок', exact: true }).click();
  await page.getByLabel('Содержание', { exact: true }).fill('Объяснение редактора.');
  await page.getByRole('button', { name: 'Поднять блок 2', exact: true }).click();
  await page.getByRole('checkbox', { name: /Опубликовать урок/ }).check();
  await page.getByRole('button', { name: 'Сохранить сценарий', exact: true }).click();
  await expect(page.getByText('Урок сохранён.', { exact: true })).toBeVisible();
  const publishedLesson = (await api(context, '/lessons')).find((l: any) => l.title === lessonTitle);
  expect(publishedLesson.blocks.map((b: any) => b.type)).toEqual(['explanation', 'dialogue']);
  await page.getByRole('button', { name: 'Удалить', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Удалить', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toBeHidden();
  await page.getByRole('button', { name: 'Учительница', exact: true }).click();
  await expect(page.getByLabel('Имя персонажа', { exact: true })).toHaveValue('Мария Ивановна');
  await page.setViewportSize({ width: 390, height: 844 });
  await noOverflow(page);
  await page.screenshot({ path: 'artifacts/admin-mobile.png', fullPage: true });
});

test('three isolated browser identities play synchronized Spy and recover after refresh', async ({
  browser,
}) => {
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({ baseURL: 'http://127.0.0.1:4173', viewport: { width: 1440, height: 1000 } }),
    ),
  );
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  try {
    for (let i = 0; i < 3; i++) await signup(pages[i], ['Ведущий', 'Ира', 'Дима'][i]);
    const users = await Promise.all(contexts.map(async (c) => (await api(c, '/auth/me')).user));
    const host = pages[0];
    await host.getByRole('button', { name: 'Играть в Шпион', exact: true }).click();
    await host.getByRole('button', { name: 'Создать сервер', exact: true }).click();
    await host.getByLabel('Название сервера', { exact: true }).fill('Наш класс — браузерный тест');
    await host.getByRole('dialog').getByRole('button', { name: 'Создать сервер', exact: true }).click();
    await expect(
      host.getByRole('heading', { name: 'Наш класс — браузерный тест', exact: true }),
    ).toBeVisible();
    await host.getByRole('button', { name: 'Новая ссылка', exact: true }).click();
    const invite = host.getByLabel('Ссылка-приглашение', { exact: true });
    await expect(invite).toHaveValue(/\/invite\//);
    const url = await invite.inputValue();
    for (let i = 1; i < 3; i++) {
      await pages[i].goto(url);
      await pages[i].getByRole('button', { name: 'Присоединиться к серверу', exact: true }).click();
      await expect(
        pages[i].getByRole('heading', { name: 'Наш класс — браузерный тест', exact: true }),
      ).toBeVisible();
    }
    await host.getByRole('button', { name: 'Создать комнату', exact: true }).click();
    await host.getByRole('dialog').getByRole('button', { name: 'Создать комнату', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Я готов играть', exact: true })).toBeVisible();
    const rid = host.url().split('#rooms/')[1];
    expect(rid).toBeTruthy();
    for (let i = 1; i < 3; i++) {
      await pages[i].goto(`/${i === 1 ? '?transport=poll' : ''}#rooms/${rid}`);
      await expect(pages[i].getByRole('button', { name: 'Я готов играть', exact: true })).toBeVisible();
    }
    for (const p of pages) await p.getByRole('button', { name: 'Я готов играть', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Начать игру', exact: true })).toBeEnabled();
    await host.getByRole('button', { name: 'Начать игру', exact: true }).click();
    for (const p of pages)
      await expect(p.getByRole('heading', { name: 'Обсуждение', exact: true })).toBeVisible();
    const views = await Promise.all(contexts.map((c) => api(c, `/rooms/${rid}`)));
    const spy = views.findIndex((r) => r.me.role === 'spy');
    expect(spy).toBeGreaterThanOrEqual(0);
    expect(views[spy].me.topic).toBeUndefined();
    const citizen = views.findIndex((r) => r.me.role === 'citizen');
    await pages[1].reload();
    await expect(pages[1].getByRole('heading', { name: 'Обсуждение', exact: true })).toBeVisible();
    expect((await api(contexts[1], `/rooms/${rid}`)).me.role).toBe(views[1].me.role);
    await pages[citizen].getByRole('button', { name: 'Показать роль', exact: true }).click();
    await expect(pages[citizen].getByText('Суффиксы -ЕК- и -ИК-', { exact: true })).toBeVisible();
    await pages[citizen].screenshot({ path: 'artifacts/game-discussion.png', fullPage: true });
    await host.getByLabel('Сообщение в чат', { exact: true }).fill('Начинаем обсуждение!');
    await host.getByRole('button', { name: 'Отправить сообщение', exact: true }).click();
    await expect(pages[1].getByText('Начинаем обсуждение!', { exact: true })).toBeVisible();
    await host.getByRole('button', { name: 'Перейти к голосованию', exact: true }).click();
    for (const p of pages)
      await expect(p.getByRole('heading', { name: 'Голосование', exact: true })).toBeVisible();
    for (let i = 0; i < 3; i++) {
      const target = i === spy ? citizen : spy;
      await pages[i].locator('.rr-vote-option').filter({ hasText: users[target].username }).click();
      await pages[i].getByRole('button', { name: 'Подтвердить голос', exact: true }).click();
    }
    await expect(pages[spy].getByLabel('Название темы', { exact: true })).toBeVisible();
    await pages[spy].getByLabel('Название темы', { exact: true }).fill('Неверная тема');
    await pages[spy].getByRole('button', { name: 'Назвать тему', exact: true }).click();
    for (const p of pages)
      await expect(p.getByRole('heading', { name: 'Победили знатоки!', exact: true })).toBeVisible();
    await host.screenshot({ path: 'artifacts/game-results.png', fullPage: true });
    for (const c of contexts) expect((await api(c, '/profile')).stats.games).toBe(1);
    await host.getByRole('button', { name: 'Следующий раунд', exact: true }).click();
    for (const p of pages)
      await expect(p.getByRole('button', { name: 'Я готов играть', exact: true })).toBeVisible();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('invitation survives registration on a phone viewport', async ({ browser }) => {
  const owner = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' }),
    guest = await browser.newContext({
      baseURL: 'http://127.0.0.1:4173',
      viewport: { width: 390, height: 844 },
    });
  try {
    await api(owner, '/auth/register', {
      email: `owner-${unique()}@royale.test`,
      password,
      username: 'Создатель',
    });
    const server = await api(owner, '/servers', { name: 'Приглашение на телефон' }),
      invite = await api(owner, `/servers/${server.id}/invites`, {});
    const p = await guest.newPage();
    await p.goto(invite.url);
    await p.getByLabel('Имя игрока', { exact: true }).fill('Гость');
    await p.getByLabel('Электронная почта', { exact: true }).fill(`guest-${unique()}@royale.test`);
    await p.getByLabel('Пароль', { exact: true }).fill(password);
    await p.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
    await expect(p.getByRole('button', { name: 'Присоединиться к серверу', exact: true })).toBeVisible();
    await p.getByRole('button', { name: 'Присоединиться к серверу', exact: true }).click();
    await expect(p.getByRole('heading', { name: 'Приглашение на телефон', exact: true })).toBeVisible();
    await noOverflow(p);
    expect((await api(guest, `/servers/${server.id}`)).memberCount).toBe(2);
  } finally {
    await owner.close();
    await guest.close();
  }
});

for(const game of ['jeopardy','roulette']) test(game+' imported game lobby works inside the site',async({page})=>{
 await signup(page,'Новые игры');
 await api(page.context(),'/servers',{name:'Новый сервер',description:''});
 await page.goto('/#games/'+game);
 await page.getByRole('button',{name:'Создать партию',exact:true}).click();
 await expect(page.getByRole('button',{name:'Я готов',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Я готов',exact:true}).click();
 await expect(page.getByRole('button',{name:'Отменить готовность',exact:true})).toBeVisible();
 await page.reload();
 await expect(page.getByRole('button',{name:'Отменить готовность',exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await noOverflow(page);
 await page.screenshot({path:'artifacts/'+game+'-integrated-mobile.png',fullPage:true});
});
