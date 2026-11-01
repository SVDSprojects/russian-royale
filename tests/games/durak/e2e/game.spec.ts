import { test, expect } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import type { Envelope } from "../../../../src/games/durak/client";
import type { Card, Action, View } from "../../../../shared/games/durak/types";
const prefix = "/api/games/durak";
const command = (v: number, extra: Record<string, unknown> = {}) => ({
  commandId: crypto.randomUUID(),
  expectedVersion: v,
  ...extra,
});
const beats = (c: Card, a: Card, trump: Card["suit"]) =>
  c.suit === a.suit ? c.rank > a.rank : c.suit === trump && a.suit !== trump;
async function view(api: APIRequestContext, id: string) {
  const r = await api.get(`${prefix}/rooms/${id}/view`);
  expect(r.ok()).toBe(true);
  return (await r.json()) as Envelope;
}
async function act(
  api: APIRequestContext,
  id: string,
  path: string,
  version: number,
  extra: Record<string, unknown> = {},
) {
  const r = await api.post(`${prefix}/rooms/${id}/${path}`, {
    data: command(version, extra),
  });
  expect(r.status(), await r.text()).toBe(200);
  return (await r.json()) as Envelope;
}
test("Два независимых игрока: лобби, UI-ход, ошибка, сеть, полная партия, реванш", async ({
  browser,
}) => {
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
  ]);
  const pages = await Promise.all(contexts.map((c) => c.newPage()));
  const apis = contexts.map((c) => c.request);
  for (let i = 0; i < 2; i++)
    expect(
      (
        await apis[i].post("/preview/login", { data: { id: `demo-${i + 1}` } })
      ).ok(),
    ).toBe(true);
  await pages[0].goto("/");
  await expect(
    pages[0].getByRole("heading", { name: "Ваш вечер. Ваш ход." }),
  ).toBeVisible();
  await pages[0].screenshot({
    path: "screenshots/catalog.png",
    fullPage: true,
  });
  let response = await apis[0].post(prefix + "/rooms", {
    data: command(0, {
      serverId: "demo-server",
      name: "Письма друзьям",
      settings: { maxPlayers: 6, educational: true, ruleIds: [] },
    }),
  });
  expect(response.ok()).toBe(true);
  let e = (await response.json()) as Envelope;
  const room = e.view.roomId;
  await pages[0].goto(`/#games/durak/${room}`);
  await expect(pages[0].getByText("Ждём второго игрока")).toBeVisible();
  await pages[0].screenshot({
    path: "screenshots/lobby-empty.png",
    fullPage: true,
  });
  e = await act(apis[1], room, "join", e.version);
  await pages[1].goto(`/#games/durak/${room}`);
  await expect(pages[0].getByText("Борис", { exact: true })).toBeVisible();
  await pages[0].getByRole("button", { name: "Я готов", exact: true }).click();
  await expect(
    pages[0].getByRole("button", { name: "Снять готовность" }),
  ).toBeVisible();
  e = await view(apis[1], room);
  e = await act(apis[1], room, "ready", e.version, { ready: true });
  await expect(
    pages[0].getByRole("button", { name: "Начать партию" }),
  ).toBeEnabled();
  await pages[0].screenshot({ path: "screenshots/lobby.png", fullPage: true });
  await pages[0].getByRole("button", { name: "Начать партию" }).click();
  await expect(
    pages[0].getByRole("heading", { name: "Ваши билеты" }),
  ).toBeVisible();
  await pages[0].waitForTimeout(700);
  e = await view(apis[0], room);
  let v = e.view.game!;
  const actorIndex = v.turnId === "demo-1" ? 0 : 1;
  const page = pages[actorIndex];
  await expect(
    page.getByRole("heading", { name: "Выберите первую карту" }),
  ).toBeVisible();
  await page.screenshot({ path: "screenshots/active.png", fullPage: true });
  await page.getByRole("button", { name: "Задание · +10 сек" }).click();
  await expect(
    page.getByText("Отметьте все правильные варианты."),
  ).toBeVisible();
  await page.screenshot({ path: "screenshots/bonus.png", fullPage: true });
  await page.locator(".rr-durak-options input").first().check();
  await page.getByRole("button", { name: "Ответить", exact: true }).click();
  await expect(page.getByText("Верно! +10 секунд")).toBeVisible();
  // Виден только свой разрешённый View, другие руки не сериализованы.
  for (let i = 0; i < 2; i++) {
    const data = await view(apis[i], room);
    const raw = JSON.stringify(data);
    for (const word of [
      "acceptedAnswers",
      "contentSnapshot",
      '"deck":',
      '"state":',
    ])
      expect(raw).not.toContain(word);
    expect(data.view.game!.players.every((p) => !("hand" in p))).toBe(true);
  }
  await page.route("**/api/games/durak/rooms/*/actions", (r) =>
    r.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: "Этот билет нельзя отправить. Выберите другую карту.",
      }),
    }),
  );
  await page.locator(".rr-durak-card").first().click();
  await page
    .getByRole("button", { name: "Отправить карту", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Этот билет нельзя отправить",
  );
  await page.screenshot({ path: "screenshots/error.png", fullPage: true });
  await page.unroute("**/api/games/durak/rooms/*/actions");
  await page.getByRole("button", { name: "Закрыть ошибку" }).click();
  // Обязательная альтернатива drag-and-drop: выбрать и подтвердить.
  await page.locator(".rr-durak-card.rr-durak-legal").first().focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: "Отправить карту", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Выберите первую карту" }),
  ).not.toBeVisible();
  await pages[0].reload();
  await expect(
    pages[0].getByRole("heading", { name: "Ваши билеты" }),
  ).toBeVisible();
  await contexts[0].setOffline(true);
  await expect(pages[0].getByRole("status")).toContainText("Нет связи");
  await contexts[0].setOffline(false);
  await expect(
    pages[0].getByText("Нет связи. Действия недоступны."),
  ).not.toBeVisible();
  await pages[0].setViewportSize({ width: 390, height: 844 });
  await pages[0].emulateMedia({ reducedMotion: "reduce" });
  await pages[0].screenshot({ path: "screenshots/mobile.png", fullPage: true });
  for (const [width, height] of [
    [360, 800],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    await pages[0].setViewportSize({ width, height });
    expect(
      await pages[0].evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await pages[0].screenshot({
      path: `screenshots/viewport-${width}.png`,
      fullPage: true,
    });
  }
  const animation = await pages[0]
    .locator(".rr-durak-card")
    .first()
    .evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(animation).toBe("0s");
  // Играем только через настоящие запросы двух cookie-сессий. Драйвер не читает SQLite или State.
  for (let step = 0; step < 2200; step++) {
    e = await view(apis[0], room);
    v = e.view.game!;
    if (v.final) break;
    const i = v.turnId === "demo-1" ? 0 : 1;
    e = await view(apis[i], room);
    v = e.view.game!;
    let action: Action;
    if (v.phase === "dealing") {
      await pages[0].waitForTimeout(100);
      continue;
    }
    if (v.phase === "defend") {
      const pair = v.table.findIndex((p) => !p.defense);
      const card = v.hand.find((c) =>
        beats(c, v.table[pair].attack, v.trump.suit),
      );
      action = card ? { type: "defend", card, pair } : { type: "take" };
    } else
      action = v.legalCards.length
        ? { type: "attack", card: v.legalCards[0] }
        : { type: "pass" };
    e = await act(apis[i], room, "actions", e.version, { action });
    await pages[0].waitForTimeout(45);
  }
  e = await view(apis[0], room);
  expect(e.view.game!.final).not.toBeNull();
  const firstSession = e.view.game!.sessionId;
  await pages[0].reload();
  await expect(pages[0].getByText("ИТОГОВАЯ КВИТАНЦИЯ")).toBeVisible();
  await pages[0].screenshot({ path: "screenshots/result.png", fullPage: true });
  await pages[0].getByRole("button", { name: "Сыграть ещё" }).click();
  await expect(
    pages[0].getByRole("button", { name: "Я готов", exact: true }),
  ).toBeVisible();
  e = await view(apis[0], room);
  expect(e.view.game).toBeNull();
  for (let i = 0; i < 2; i++)
    e = await act(apis[i], room, "ready", e.version, { ready: true });
  e = await act(apis[0], room, "start", e.version);
  expect(e.view.game!.sessionId).not.toBe(firstSession);
  for (const c of contexts) await c.close();
});

test("Редактор: создание, публикация, изменение, JSON-импорт/экспорт и удаление", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const api = context.request;
  await api.post("/preview/login", { data: { id: "demo-7" } });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Редактор заданий" }).click();
  await expect(
    page.getByRole("heading", { name: "Сортировочное бюро" }),
  ).toBeVisible();
  await page
    .getByLabel("Идентификатор", { exact: true })
    .fill("e2e-editor-card");
  await page
    .getByLabel("Идентификатор правила", { exact: true })
    .fill("e2e-rule");
  await page.getByLabel("Текст задания").fill("Как пишется слово «машина»?");
  await page
    .getByRole("textbox", { name: "Вариант 1", exact: true })
    .fill("машина");
  await page
    .getByRole("textbox", { name: "Вариант 2", exact: true })
    .fill("машына");
  await page
    .getByLabel("Объяснение", { exact: true })
    .fill("Сочетание ши пишется с буквой и: машина.");
  await page
    .getByRole("combobox", { name: "Статус", exact: true })
    .selectOption("published");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Изменения сохранены");
  await page
    .getByRole("navigation", { name: "Список заданий" })
    .getByRole("button", { name: /Как пишется слово/ })
    .click();
  await page
    .getByLabel("Текст задания")
    .fill("Выберите верное написание слова «машина».");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Список заданий" })
      .getByRole("button", { name: /Выберите верное написание/ }),
  ).toBeVisible();
  await page.screenshot({ path: "screenshots/admin.png", fullPage: true });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Экспорт JSON" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("durak-content.json");
  await page.getByLabel("Импорт JSON", { exact: true }).setInputFiles({
    name: "import.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          id: "e2e-import",
          ruleId: "e2e-rule",
          prompt: "Укажите неопределённую форму.",
          options: ["учиться", "учится"],
          acceptedAnswers: [0],
          explanation: "Учиться отвечает на вопрос «что делать?».",
          difficulty: 2,
          revision: 1,
          status: "draft",
        },
      ]),
    ),
  });
  await expect(
    page
      .getByRole("navigation", { name: "Список заданий" })
      .getByRole("button", { name: /Укажите неопределённую/ }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Список заданий" })
    .getByRole("button", { name: /Выберите верное написание/ })
    .click();
  await page.getByRole("button", { name: "Удалить задание" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Список заданий" })
      .getByRole("button", { name: /Выберите верное написание/ }),
  ).not.toBeVisible();
  const student = await browser.newContext();
  await student.request.post("/preview/login", { data: { id: "demo-3" } });
  expect(
    (await student.request.get("/api/games/durak/admin/content")).status(),
  ).toBe(403);
  await student.close();
  await context.close();
});
