import { it, expect, vi } from "vitest";
import { DurakClient, HTTPError } from "../../../src/games/durak/client";
import type { Envelope, API } from "../../../src/games/durak/client";
const envelope = (version: number): Envelope => ({
  version,
  serverNow: 1000,
  view: {
    roomId: "r",
    serverId: "s",
    name: "Тест",
    hostId: "u",
    settings: { maxPlayers: 2, educational: false, ruleIds: [] },
    members: [{ id: "u", username: "Участник", ready: false, online: true }],
    game: null,
  },
});
it("поздний старый GET не откатывает более новую версию", async () => {
  const resolves: ((v: unknown) => void)[] = [];
  const api: API = () => new Promise((resolve) => resolves.push(resolve));
  const c = new DurakClient("r", api);
  const first = c.view(),
    second = c.view();
  resolves[1](envelope(3));
  expect((await second).version).toBe(3);
  resolves[0](envelope(2));
  expect((await first).version).toBe(3);
  expect(c.version).toBe(3);
});
it("409 загружает View, но не повторяет устаревшее действие", async () => {
  const api = vi.fn<API>(async (_path, options) => {
    if (options?.method === "POST")
      throw new HTTPError(409, "Состояние изменилось");
    return envelope(4);
  });
  const c = new DurakClient("r", api);
  c.version = 2;
  await expect(c.command("ready", { ready: true })).rejects.toThrow(
    "Состояние изменилось",
  );
  expect(c.version).toBe(4);
  expect(api.mock.calls.filter(([, o]) => o?.method === "POST")).toHaveLength(
    1,
  );
  expect(api).toHaveBeenCalledTimes(2);
});
it("не принимает произвольный State вместо безопасной схемы ответа", async () => {
  const api: API = async () => ({
    ...envelope(1),
    view: { ...envelope(1).view, state: { deck: ["secret"] } },
  });
  await expect(new DurakClient("r", api).view()).rejects.toThrow();
});
