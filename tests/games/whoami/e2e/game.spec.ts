// Playwright: независимые browser contexts, реальные запросы к preview-серверу «Кто я».
import path from "node:path";
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

const SHOTS = path.join(__dirname, "..", "..", "..", "..", "preview", "screenshots");
const TIMINGS = { assignMs: 8_000, nextTurnMs: 4_000 };

interface Player {
  name: string;
  context: BrowserContext;
  page: Page;
}

async function login(browser: Browser, name: string, options: Parameters<Browser["newContext"]>[0] = {}): Promise<Player> {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("heading", { name: "Новая комната" })).toBeVisible();
  return { name, context, page };
}

async function advanceClock(request: APIRequestContext, ms: number): Promise<void> {
  expect((await request.post("/api/demo/clock", { data: { advanceMs: ms } })).ok()).toBeTruthy();
}

async function createRoom(host: Player, name: string): Promise<string> {
  await host.page.getByLabel("Название").fill(name);
  await host.page.getByRole("button", { name: "Создать и войти" }).click();
  await expect(host.page.getByRole("heading", { name: "Кто я · лобби" })).toBeVisible();
  return host.page.url();
}

async function startMatch(browser: Browser, names: string[], roomName: string, mobileLast = false): Promise<Player[]> {
  const players: Player[] = [];
  for (const [index, name] of names.entries()) {
    const mobile = mobileLast && index === names.length - 1;
    players.push(await login(browser, name, mobile ? { viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true } : {}));
  }
  const [host, ...rest] = players as [Player, ...Player[]];
  const url = await createRoom(host, roomName);
  for (const player of rest) {
    await player.page.goto(url);
    await player.page.getByRole("button", { name: "Войти в комнату" }).click();
    await expect(player.page.getByRole("button", { name: "Я готов" })).toBeVisible();
  }
  for (const player of players) await player.page.getByRole("button", { name: "Я готов" }).click();
  await expect(host.page.getByRole("button", { name: "Открыть экспозицию" })).toBeEnabled();
  await host.page.getByRole("button", { name: "Открыть экспозицию" }).click();
  for (const player of players) await expect(player.page.getByRole("heading", { name: "Таблички развешаны" })).toBeVisible();
  return players;
}

/** Термины по чужим табличкам: каждый видит все, кроме своего. */
async function termsByOwner(players: Player[]): Promise<Map<string, string>> {
  const terms = new Map<string, string>();
  for (const player of players) {
    const visible = await player.page.evaluate(() =>
      [...document.querySelectorAll(".rr-whoami-frame")].map((frame) => ({
        owner: (frame.querySelector("figcaption")?.childNodes[0]?.textContent ?? "").trim(),
        term: frame.querySelector(".rr-whoami-plaque-term")?.textContent ?? null,
      })),
    );
    for (const entry of visible) if (entry.term && entry.owner !== player.name) terms.set(entry.owner, entry.term);
  }
  return terms;
}

/** Ждёт спрашивающего; null — партия закончилась. */
async function askerOrFinish(players: Player[]): Promise<Player | null> {
  let found: Player | null = null;
  await expect
    .poll(
      async () => {
        if (await players[0]?.page.getByRole("heading", { name: "Итоги экспозиции" }).isVisible()) return "finished";
        for (const player of players) {
          if (await player.page.getByLabel("Ваш вопрос").isVisible()) {
            found = player;
            return player.name;
          }
        }
        return "";
      },
      { timeout: 20_000 },
    )
    .not.toBe("");
  return found;
}

async function asker(players: Player[]): Promise<Player> {
  const found = await askerOrFinish(players);
  if (!found) throw new Error("никто не спрашивает");
  return found;
}

async function rawView(player: Player): Promise<string> {
  return player.page.evaluate(async (url) => (await fetch(`/api/games/whoami/rooms/${url.split("/").pop() ?? ""}/view`)).text(), player.page.url());
}

test("полная партия: 3 игрока, свой термин скрыт, штампы, ошибка, угадывание, итоги и реванш", async ({ browser, request }) => {
  const players = await startMatch(browser, ["Аня", "Борис", "Вера"], "Полная партия", true);
  const terms = await termsByOwner(players);
  expect(terms.size).toBe(3);
  for (const player of players) {
    await expect(player.page.locator(".rr-whoami-plaque.is-back")).toHaveCount(1);
    const raw = await rawView(player);
    expect(raw).not.toContain(terms.get(player.name) ?? "—");
    expect(raw).not.toMatch(/acceptedAnswers|equivalenceYo|"termId"/);
    for (const other of players) if (other !== player) expect(raw).toContain(terms.get(other.name) ?? "—");
  }
  await advanceClock(request, TIMINGS.assignMs);

  let wrongDone = false;
  let errorShot = false;
  for (let turn = 0; turn < 8; turn += 1) {
    const current = await askerOrFinish(players);
    if (!current) break;
    await current.page.getByLabel("Ваш вопрос").fill("Я часть речи?");
    await current.page.getByLabel("Ваш вопрос").press("Enter");
    if (turn === 0) await players[0]?.page.screenshot({ path: path.join(SHOTS, "02-question.png"), fullPage: true });
    for (const voter of players.filter((p) => p !== current)) {
      const stamp = voter.page.getByRole("button", { name: "Да", exact: true });
      await expect(stamp).toBeVisible();
      if (!errorShot) {
        await voter.context.setOffline(true);
        await stamp.click();
        await expect(voter.page.getByRole("alert")).toContainText("Нет связи");
        await voter.page.screenshot({ path: path.join(SHOTS, "04-error-offline-stamp.png"), fullPage: true });
        await voter.context.setOffline(false);
        errorShot = true;
      }
      await stamp.click();
      await expect(stamp).toBeHidden();
    }
    const guess = current.page.getByLabel("Кто я? Ваша догадка");
    await expect(guess).toBeVisible();
    if (turn === 0) await players[2]?.page.screenshot({ path: path.join(SHOTS, "03-mobile-guessing.png"), fullPage: true });
    if (turn === 1 && !wrongDone) {
      wrongDone = true;
      await guess.fill("совсем не то");
      await guess.press("Enter");
      await expect(current.page.getByText("«совсем не то» — неверно").first()).toBeVisible();
    } else {
      await guess.fill(`  ${(terms.get(current.name) ?? "").toUpperCase()}  `);
      await guess.press("Enter");
      await expect(current.page.getByRole("img", { name: terms.get(current.name) ?? "" }).first()).toBeVisible();
    }
    await advanceClock(request, TIMINGS.nextTurnMs);
  }

  for (const player of players) await expect(player.page.getByRole("heading", { name: "Итоги экспозиции" })).toBeVisible();
  const host0 = players[0] as Player;
  await expect(host0.page.getByText(/^Победа:/)).toBeVisible();
  for (const term of terms.values()) await expect(host0.page.locator(".rr-whoami-exhibits")).toContainText(term);
  await host0.page.screenshot({ path: path.join(SHOTS, "05-result.png"), fullPage: true });

  // Ведущий мог смениться после скачка часов: ищем того, у кого есть кнопка реванша, — она ровно у одного.
  const rematch = (p: Player) => p.page.getByRole("button", { name: "Реванш с новыми табличками" });
  await expect.poll(async () => (await Promise.all(players.map((p) => rematch(p).count()))).reduce((a, b) => a + b, 0)).toBe(1);
  const counts = await Promise.all(players.map((p) => rematch(p).count()));
  const host = players[counts.indexOf(1)] as Player;
  await rematch(host).click();
  for (const player of players) await expect(player.page.getByRole("heading", { name: "Кто я · лобби" })).toBeVisible();
  await host.page.screenshot({ path: path.join(SHOTS, "01-lobby.png"), fullPage: true });
  for (const player of players) await player.context.close();
});

test("перезагрузка посреди хода и offline → online", async ({ browser, request }) => {
  const players = await startMatch(browser, ["Дина", "Егор", "Жанна"], "Перезагрузка");
  await advanceClock(request, TIMINGS.assignMs);
  const current = await asker(players);
  await current.page.getByLabel("Ваш вопрос").fill("черновик");
  await current.page.reload();
  await expect(current.page.getByLabel("Ваш вопрос")).toBeVisible();
  await expect(current.page.locator(".rr-whoami-plaque.is-back")).toHaveCount(1);
  await current.page.getByLabel("Ваш вопрос").fill("После перезагрузки?");
  await current.page.getByLabel("Ваш вопрос").press("Enter");

  const watcher = players.find((p) => p !== current) as Player;
  await watcher.context.setOffline(true);
  await expect(watcher.page.getByRole("status").filter({ hasText: /Связь прервалась|Нет связи/ })).toBeVisible({ timeout: 25_000 });
  await watcher.page.screenshot({ path: path.join(SHOTS, "06-offline.png"), fullPage: true });
  await watcher.context.setOffline(false);
  await expect(watcher.page.getByText("Связь восстановлена")).toBeVisible({ timeout: 25_000 });
  await expect(watcher.page.getByRole("heading", { name: "«После перезагрузки?»" })).toBeVisible();
  for (const player of players) await player.context.close();
});

test("мобильный экран, управление клавиатурой и reduced-motion", async ({ browser }) => {
  const host = await login(browser, "Ира", { viewport: { width: 360, height: 800 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  await createRoom(host, "Телефон");
  const ready = host.page.getByRole("button", { name: "Я готов" });
  await ready.focus();
  await host.page.keyboard.press("Space");
  await expect(host.page.getByRole("button", { name: "Я не готов" })).toBeFocused();
  const layout = await host.page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
    animation: getComputedStyle(document.querySelector(".rr-whoami-lamp") as Element).animationName,
    small: [...document.querySelectorAll(".rr-game-whoami button, .rr-game-whoami select")]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length,
  }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
  expect(layout.animation).toBe("none");
  expect(layout.small).toBe(0);
  await host.page.screenshot({ path: path.join(SHOTS, "07-mobile-lobby.png"), fullPage: true });
  await host.context.close();
});

test("редактор терминов доступен редактору и закрыт игроку", async ({ browser }) => {
  const editor = await login(browser, "Редактор Ева");
  await editor.page.getByRole("link", { name: "Редактор" }).click();
  await expect(editor.page.getByRole("heading", { name: "Кто я · термины" })).toBeVisible();
  await editor.page.getByRole("button", { name: /^Твёрдый знак/ }).click();
  await editor.page.getByLabel("Проверить ответ игрока").fill("твердый знак");
  await expect(editor.page.getByText("Ответ будет засчитан")).toBeVisible();
  await expect(editor.page.getByLabel("Вариант ответа №1")).toHaveValue("ъ");
  await editor.page.screenshot({ path: path.join(SHOTS, "08-admin.png"), fullPage: true });
  const player = await login(browser, "Кирилл");
  expect(await player.page.evaluate(async () => (await fetch("/api/games/whoami/admin/content")).status)).toBe(403);
  await editor.context.close();
  await player.context.close();
});
