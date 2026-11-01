// Playwright: независимые browser contexts, реальные запросы к preview-серверу.
import path from "node:path";
import { expect, test, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";

const SHOTS = path.join(__dirname, "..", "..", "..", "..", "preview", "screenshots");
const PREPARE_MS = 5_000;
const STEP_MS = 30_000;

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

function roomIdOf(page: Page): string {
  return page.url().split("/").pop() ?? "";
}

/** Все клиенты обращаются к серверу: присутствие свежее, ведущий не меняется из-за скачка часов. */
async function pulse(players: Player[]): Promise<void> {
  for (const player of players) {
    await player.page.evaluate(async (id) => {
      await fetch(`/api/games/alias/rooms/${id}/view`);
    }, roomIdOf(player.page));
  }
}

async function advance(request: APIRequestContext, players: Player[], ms: number): Promise<void> {
  let left = ms;
  while (left > 0) {
    const step = Math.min(STEP_MS, left);
    await pulse(players);
    const response = await request.post("/api/demo/clock", { data: { advanceMs: step } });
    expect(response.ok()).toBeTruthy();
    left -= step;
  }
  await pulse(players);
}

async function rawView(player: Player): Promise<string> {
  return player.page.evaluate(async (id) => (await fetch(`/api/games/alias/rooms/${id}/view`)).text(), roomIdOf(player.page));
}

async function startMatch(browser: Browser, names: string[], roomName: string, mobileIndex = -1): Promise<Player[]> {
  const players: Player[] = [];
  for (const [index, name] of names.entries()) {
    players.push(await login(browser, name, index === mobileIndex ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {}));
  }
  const [host, ...rest] = players as [Player, ...Player[]];
  await host.page.getByLabel("Название").fill(roomName);
  await host.page.getByLabel(/Кругов/).selectOption("3");
  await host.page.getByRole("button", { name: "Создать и войти" }).click();
  await expect(host.page.getByRole("heading", { name: "Alias · лобби" })).toBeVisible();
  const url = host.page.url();
  for (const player of rest) {
    await player.page.goto(url);
    await player.page.getByRole("button", { name: "Войти в комнату" }).click();
    await expect(player.page.getByRole("button", { name: "Я готов" })).toBeVisible();
  }
  for (const player of players) await player.page.getByRole("button", { name: "Я готов" }).click();
  await expect(host.page.getByRole("button", { name: "Запустить конвейер" })).toBeEnabled();
  return players;
}

test("полная партия: 2 команды, фильтр, угадывание, пропуск, итоги и реванш", async ({ browser, request }) => {
  const players = await startMatch(browser, ["Аня", "Борис", "Вера", "Глеб"], "Полная партия", 3);
  const [anya, boris, vera, gleb] = players as [Player, Player, Player, Player];
  await anya.page.screenshot({ path: path.join(SHOTS, "01-lobby.png"), fullPage: true });
  await anya.page.getByRole("button", { name: "Запустить конвейер" }).click();
  for (const player of players) await expect(player.page.getByRole("heading", { name: "Подготовка" })).toBeVisible();
  await expect(boris.page.locator(".rr-alias-step")).toContainText("Объясняет Аня");

  await advance(request, players, PREPARE_MS);
  const term = (await anya.page.locator(".rr-alias-term").innerText()).trim();
  expect(term.length).toBeGreaterThan(1);
  await expect(vera.page.getByLabel("Ваш ответ")).toBeVisible();
  await expect(boris.page.getByText("Сейчас угадывает команда «Шестерёнки»")).toBeVisible();

  // Запрет утечки: термин видит только объясняющий.
  for (const player of [boris, vera, gleb]) expect(await rawView(player)).not.toContain(term);

  await anya.page.getByRole("textbox", { name: "Объяснение" }).fill(`Это ${term.toUpperCase()}!`);
  await anya.page.getByRole("button", { name: "Отправить объяснение" }).click();
  await expect(anya.page.getByRole("alert")).toContainText("запрещённое");
  await anya.page.screenshot({ path: path.join(SHOTS, "04-error-forbidden.png"), fullPage: true });

  await anya.page.getByRole("textbox", { name: "Объяснение" }).fill("Подсказка от фабрики смыслов");
  await anya.page.getByRole("textbox", { name: "Объяснение" }).press("Enter");
  await expect(boris.page.locator(".rr-alias-cloud", { hasText: "Подсказка от фабрики смыслов" })).toBeVisible();
  await expect(gleb.page.locator(".rr-alias-cloud", { hasText: "Подсказка от фабрики смыслов" })).toBeVisible();
  await anya.page.screenshot({ path: path.join(SHOTS, "02-explainer-window.png"), fullPage: true });
  await gleb.page.screenshot({ path: path.join(SHOTS, "03-mobile-observer.png"), fullPage: true });

  await vera.page.getByLabel("Ваш ответ").fill("неверная догадка");
  await vera.page.getByLabel("Ваш ответ").press("Enter");
  await expect(anya.page.getByText("неверная догадка")).toBeVisible();
  expect(await rawView(boris)).not.toContain("неверная догадка");

  await vera.page.waitForTimeout(900);
  await vera.page.getByLabel("Ваш ответ").fill(` ${term.toLowerCase()} `);
  await vera.page.getByRole("button", { name: "Ответить" }).click();
  for (const player of players) await expect(player.page.getByLabel("Счёт: 1").first()).toBeVisible();
  await expect(boris.page.locator(".rr-alias-box", { hasText: term })).toBeVisible();

  await anya.page.getByRole("button", { name: "Пропустить (−1)" }).click();
  await expect(boris.page.getByLabel("Счёт: 0").first()).toBeVisible();

  await advance(request, players, 60_000);
  await expect(boris.page.getByRole("heading", { name: "Итог хода" })).toBeVisible();
  await expect(boris.page.getByText("Боковая ветка (пропуск, −1)")).toBeVisible();

  // Остальные 5 ходов идут по таймеру: у всех команд одинаковое число ходов.
  await advance(request, players, 6_000 + 5 * 71_000);
  for (const player of players) await expect(player.page.getByRole("heading", { name: "Итоги партии" })).toBeVisible();
  await expect(anya.page.getByText("Принятые термины")).toBeVisible();
  await expect(anya.page.locator(".rr-alias-defs dt", { hasText: term })).toBeVisible();
  await anya.page.screenshot({ path: path.join(SHOTS, "05-result.png"), fullPage: true });

  const withRematch: Player[] = [];
  for (const player of players) {
    if (await player.page.getByRole("button", { name: "Реванш теми же командами" }).isVisible()) withRematch.push(player);
  }
  expect(withRematch).toHaveLength(1);
  await (withRematch[0] as Player).page.getByRole("button", { name: "Реванш теми же командами" }).click();
  for (const player of players) {
    await expect(player.page.getByRole("heading", { name: "Alias · лобби" })).toBeVisible();
    await expect(player.page.getByRole("button", { name: "Я готов" })).toBeVisible();
  }
  for (const player of players) await player.context.close();
});

test("перезагрузка посреди хода и offline → online", async ({ browser, request }) => {
  const players = await startMatch(browser, ["Дина", "Егор", "Жанна", "Захар"], "Перезагрузка");
  const [dina, egor, zhanna] = players as [Player, Player, Player, Player];
  await dina.page.getByRole("button", { name: "Запустить конвейер" }).click();
  await advance(request, players, PREPARE_MS);
  const term = (await dina.page.locator(".rr-alias-term").innerText()).trim();
  await dina.page.getByRole("textbox", { name: "Объяснение" }).fill("черновик");
  await dina.page.reload();
  await expect(dina.page.locator(".rr-alias-term")).toHaveText(term);
  await dina.page.getByRole("textbox", { name: "Объяснение" }).fill("после перезагрузки");
  await dina.page.getByRole("textbox", { name: "Объяснение" }).press("Enter");
  await expect(zhanna.page.locator(".rr-alias-cloud", { hasText: "после перезагрузки" })).toBeVisible();

  await egor.context.setOffline(true);
  await expect(egor.page.getByRole("status").filter({ hasText: /Связь прервалась|Нет связи/ })).toBeVisible({ timeout: 25_000 });
  await egor.page.screenshot({ path: path.join(SHOTS, "06-offline.png"), fullPage: true });
  await egor.context.setOffline(false);
  await expect(egor.page.getByText("Связь восстановлена")).toBeVisible({ timeout: 25_000 });
  await expect(egor.page.locator(".rr-alias-cloud", { hasText: "после перезагрузки" })).toBeVisible();
  for (const player of players) await player.context.close();
});

test("мобильный экран, управление клавиатурой и reduced-motion", async ({ browser }) => {
  const host = await login(browser, "Ира", { viewport: { width: 360, height: 800 }, reducedMotion: "reduce", isMobile: true, hasTouch: true });
  await host.page.getByRole("button", { name: "Создать и войти" }).click();
  await expect(host.page.getByRole("heading", { name: "Alias · лобби" })).toBeVisible();
  const ready = host.page.getByRole("button", { name: "Я готов" });
  await ready.focus();
  await host.page.keyboard.press("Space");
  await expect(host.page.getByRole("button", { name: "Я не готов" })).toBeFocused();
  await host.page.getByRole("button", { name: "3", exact: true }).first().focus();
  await host.page.keyboard.press("Enter");
  await expect(host.page.getByRole("group", { name: "Команды" }).getByRole("button", { name: "3", exact: true })).toHaveAttribute("aria-pressed", "true");
  const layout = await host.page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
    animation: getComputedStyle(document.querySelector(".rr-alias-gear") as Element).animationName,
    small: [...document.querySelectorAll(".rr-game-alias button")]
      .map((b) => b.getBoundingClientRect())
      .filter((r) => r.width > 0 && (r.width < 44 || r.height < 44)).length,
  }));
  expect(layout.scroll).toBeLessThanOrEqual(layout.width);
  expect(layout.animation).toBe("none");
  expect(layout.small).toBe(0);
  await host.page.screenshot({ path: path.join(SHOTS, "07-mobile-lobby.png"), fullPage: true });
  await host.context.close();
});

test("редактор карточек доступен редактору и закрыт игроку", async ({ browser }) => {
  const editor = await login(browser, "Редактор Ева");
  await editor.page.getByRole("link", { name: "Редактор" }).click();
  await expect(editor.page.getByRole("heading", { name: "Alias · карточки" })).toBeVisible();
  await editor.page.getByRole("button", { name: /^Существительное/ }).click();
  await editor.page.getByLabel("Предпросмотр фильтра: объяснение").fill("Это предмет, кто или что");
  await expect(editor.page.getByText("Отклонится: сработал запрет «предмет»")).toBeVisible();
  await editor.page.getByLabel("Предпросмотр фильтра: объяснение").fill("Часто стоит рядом с прилагательным");
  await expect(editor.page.getByText("Пройдёт: запрещённых слов нет")).toBeVisible();
  await editor.page.screenshot({ path: path.join(SHOTS, "08-admin.png"), fullPage: true });
  const player = await login(browser, "Кирилл");
  const denied = await player.page.evaluate(async () => (await fetch("/api/games/alias/admin/content")).status);
  expect(denied).toBe(403);
  await editor.context.close();
  await player.context.close();
});
