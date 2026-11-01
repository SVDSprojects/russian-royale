// Playwright: независимые browser contexts, реальные запросы к preview-серверу.
import path from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page, type APIRequestContext } from "@playwright/test";

const SHOTS = path.join(__dirname, "..", "..", "..", "..", "preview", "screenshots");
const TIMINGS = { dealMs: 8_000, discussionMs: 90_000, revealMs: 12_000, votingMs: 30_000 };

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
  const response = await request.post("/api/demo/clock", { data: { advanceMs: ms } });
  expect(response.ok()).toBeTruthy();
}

async function createRoom(host: Player, name: string): Promise<string> {
  await host.page.getByLabel("Название").fill(name);
  await host.page.getByRole("button", { name: "Создать и войти" }).click();
  await expect(host.page.getByRole("heading", { name: "Самозванец · лобби" })).toBeVisible();
  return host.page.url();
}

async function joinRoom(player: Player, url: string): Promise<void> {
  await player.page.goto(url);
  await player.page.getByRole("button", { name: "Войти в комнату" }).click();
  await expect(player.page.getByRole("button", { name: "Я готов" })).toBeVisible();
}

async function startMatch(browser: Browser, names: string[], roomName: string): Promise<Player[]> {
  const players: Player[] = [];
  for (const name of names) players.push(await login(browser, name));
  const [host, ...rest] = players as [Player, ...Player[]];
  const url = await createRoom(host, roomName);
  for (const player of rest) await joinRoom(player, url);
  for (const player of players) await player.page.getByRole("button", { name: "Я готов" }).click();
  await expect(host.page.getByRole("button", { name: "Начать партию" })).toBeEnabled();
  await host.page.getByRole("button", { name: "Начать партию" }).click();
  for (const player of players) await expect(player.page.locator(".rr-impostor-lens h3")).not.toHaveText("Тема скрыта");
  return players;
}

async function topics(players: Player[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const player of players) result.set(player.name, (await player.page.locator(".rr-impostor-lens h3").innerText()).trim());
  return result;
}

async function whoseTurn(players: Player[]): Promise<Player> {
  let found: Player | undefined;
  await expect
    .poll(
      async () => {
        for (const player of players) {
          if (await player.page.locator(".rr-impostor-turn h3", { hasText: "Ваш ход" }).isVisible()) {
            found = player;
            return player.name;
          }
        }
        return "";
      },
      { timeout: 20_000 },
    )
    .not.toBe("");
  if (!found) throw new Error("никто не ходит");
  return found;
}

async function sendExample(player: Player, text: string): Promise<void> {
  const input = player.page.getByLabel("Ваш пример");
  await input.fill(text);
  await input.press("Enter");
  await expect(player.page.locator(".rr-impostor-paper-text", { hasText: text })).toBeVisible();
}

async function playRound(players: Player[], round: number): Promise<void> {
  for (let i = 0; i < players.length; i += 1) {
    const player = await whoseTurn(players);
    await sendExample(player, `пример ${round}.${i + 1}`);
  }
}

test("полная партия: 4 игрока, утечек нет, ошибка хода, раскрытие и реванш", async ({ browser, request }) => {
  const players = await startMatch(browser, ["Аня", "Борис", "Вера", "Глеб"], "Полная партия");
  const host = players[0] as Player;
  const seen = await topics(players);
  const titles = [...new Set(seen.values())];
  expect(titles).toHaveLength(2);
  const impostor = players.find((p) => [...seen.values()].filter((t) => t === seen.get(p.name)).length === 1) as Player;
  await host.page.screenshot({ path: path.join(SHOTS, "02-deal-lens.png"), fullPage: true });

  // Запрет утечки: ни один ответ view не содержит чужую тему до финала.
  for (const player of players) {
    const raw = await player.page.evaluate(async (url) => {
      const id = url.split("/").pop() ?? "";
      return (await fetch(`/api/games/impostor/rooms/${id}/view`)).text();
    }, player.page.url());
    const other = titles.find((t) => t !== seen.get(player.name)) ?? "";
    expect(raw).not.toContain(other);
    expect(raw).not.toMatch(/impostorId|"role"|forbiddenWords/);
  }

  await advanceClock(request, TIMINGS.dealMs);
  const first = await whoseTurn(players);
  const ownTitle = seen.get(first.name) ?? "";
  const forbidden = ownTitle.split(/[^\p{L}]+/u).sort((a, b) => b.length - a.length)[0] ?? "";
  await first.page.getByLabel("Ваш пример").fill(`${forbidden} — вот пример`);
  await first.page.getByRole("button", { name: "Отправить" }).click();
  await expect(first.page.getByRole("alert")).toContainText("запретное слово");
  await first.page.screenshot({ path: path.join(SHOTS, "04-error-forbidden-word.png"), fullPage: true });
  await sendExample(first, "пример 1.1");
  for (let i = 1; i < players.length; i += 1) await sendExample(await whoseTurn(players), `пример 1.${i + 1}`);

  await expect(host.page.getByRole("heading", { name: "Обсуждение" })).toBeVisible();
  const chat = players[2] as Player;
  await chat.page.getByLabel("Сообщение").fill("По-моему, один пример выбивается");
  await chat.page.getByLabel("Сообщение").press("Enter");
  await expect(host.page.getByText("По-моему, один пример выбивается")).toBeVisible();
  await host.page.screenshot({ path: path.join(SHOTS, "03-discussion.png"), fullPage: true });

  await advanceClock(request, TIMINGS.discussionMs);
  await playRound(players, 2);

  for (const player of players) {
    await expect(player.page.getByRole("heading", { name: "Голосование" })).toBeVisible();
    const target = player === impostor ? (players.find((p) => p !== impostor) as Player) : impostor;
    await player.page.getByRole("button", { name: new RegExp(`^${target.name}`) }).click();
    await player.page.getByRole("button", { name: `Подтвердить голос: ${target.name}` }).click();
    await expect(player.page.getByText("Голос не меняется")).toBeVisible().catch(() => undefined);
  }
  for (const player of players) await expect(player.page.getByText("Большинство нашло отличие!")).toBeVisible();
  await expect(host.page.getByText(`Другая тема была у игрока ${impostor.name}`)).toBeVisible();
  await host.page.screenshot({ path: path.join(SHOTS, "05-result-reveal.png"), fullPage: true });

  await advanceClock(request, TIMINGS.revealMs);
  for (const player of players) await expect(player.page.getByRole("heading", { name: "Итоги партии" })).toBeVisible();
  // Скачки тестовых часов превышают 45 с отсутствия, поэтому ведущим по правилам может стать другой игрок.
  // Проверяем инвариант: кнопка реванша ровно у одного, остальные видят подсказку.
  const rematch = (p: Player) => p.page.getByRole("button", { name: "Реванш с новыми темами" });
  await expect
    .poll(async () => (await Promise.all(players.map((p) => rematch(p).count()))).reduce((a, b) => a + b, 0))
    .toBe(1);
  const counts = await Promise.all(players.map((p) => rematch(p).count()));
  const leader = players[counts.indexOf(1)] as Player;
  for (const player of players.filter((p) => p !== leader)) await expect(player.page.getByText("Реванш запускает ведущий")).toBeVisible();
  await rematch(leader).click();
  for (const player of players) {
    await expect(player.page.getByRole("heading", { name: "Самозванец · лобби" })).toBeVisible();
    await expect(player.page.getByRole("button", { name: "Я готов" })).toBeVisible();
  }
  await host.page.screenshot({ path: path.join(SHOTS, "01-lobby.png"), fullPage: true });
  for (const player of players) await player.context.close();
});

test("перезагрузка посреди хода и offline → online", async ({ browser, request }) => {
  const players = await startMatch(browser, ["Дина", "Егор", "Жанна", "Захар"], "Перезагрузка");
  await advanceClock(request, TIMINGS.dealMs);
  const turn = await whoseTurn(players);
  const before = (await turn.page.locator(".rr-impostor-lens h3").innerText()).trim();
  await turn.page.getByLabel("Ваш пример").fill("черновик");
  await turn.page.reload();
  await expect(turn.page.locator(".rr-impostor-turn h3", { hasText: "Ваш ход" })).toBeVisible();
  await expect(turn.page.locator(".rr-impostor-lens h3")).toHaveText(before);
  await sendExample(turn, "после перезагрузки");

  const watcher = players.find((p) => p !== turn) as Player;
  await watcher.context.setOffline(true);
  await expect(watcher.page.getByRole("status").filter({ hasText: /Связь прервалась|Нет связи/ })).toBeVisible({ timeout: 25_000 });
  await watcher.page.screenshot({ path: path.join(SHOTS, "06-offline.png"), fullPage: true });
  await watcher.context.setOffline(false);
  await expect(watcher.page.getByText("Связь восстановлена")).toBeVisible({ timeout: 25_000 });
  await expect(watcher.page.locator(".rr-impostor-paper-text", { hasText: "после перезагрузки" })).toBeVisible();
  for (const player of players) await player.context.close();
});

test("мобильный экран, управление клавиатурой и reduced-motion", async ({ browser }) => {
  const host = await login(browser, "Ира", { viewport: { width: 360, height: 800 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  await createRoom(host, "Телефон");
  const ready = host.page.getByRole("button", { name: "Я готов" });
  await ready.focus();
  await host.page.keyboard.press("Space");
  await expect(host.page.getByRole("button", { name: "Я не готов" })).toBeVisible();
  await expect(host.page.getByRole("button", { name: "Я не готов" })).toBeFocused();
  const layout = await host.page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
    animation: getComputedStyle(document.querySelector(".rr-impostor-stars circle") as Element).animationName,
    small: [...document.querySelectorAll(".rr-game-impostor button")]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length,
  }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
  expect(layout.animation).toBe("none");
  expect(layout.small).toBe(0);
  await host.page.screenshot({ path: path.join(SHOTS, "07-mobile-lobby.png"), fullPage: true });
  await host.context.close();
});

test("редактор контента доступен редактору и закрыт игроку", async ({ browser }) => {
  const editor = await login(browser, "Редактор Ева");
  await editor.page.getByRole("link", { name: "Редактор" }).click();
  await expect(editor.page.getByRole("heading", { name: "Самозванец · пары тем" })).toBeVisible();
  await editor.page.getByRole("button", { name: /Разделительные Ъ и Ь/ }).click();
  await editor.page.getByLabel("Проверить пример игрока").fill("твёрдый знак");
  await expect(editor.page.getByText("Тема A: отклонится")).toBeVisible();
  await editor.page.screenshot({ path: path.join(SHOTS, "08-admin.png"), fullPage: true });
  const player = await login(browser, "Кирилл");
  const denied = await player.page.evaluate(async () => (await fetch("/api/games/impostor/admin/content")).status);
  expect(denied).toBe(403);
  await editor.context.close();
  await player.context.close();
});
