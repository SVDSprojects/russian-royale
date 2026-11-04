import { it, expect } from 'vitest';
import { checkpointClient } from '../src/games/checkpoint-client';
import { HTTPError } from '../src/games/durak/client';
it('retries a simultaneous vote once with the same command ID, but never across a new round', async () => {
  const sent: any[] = [],
    updates: number[] = [];
  let version = 1,
    round = 1,
    fail = true;
  const envelope = () => ({
    view: { sessionId: 'session', phase: 'voting', round },
    version,
    serverNow: 1,
    roomId: 'room',
  });
  const client = checkpointClient(
    'mafia',
    'room',
    (v) => updates.push(v.version),
    async (_path, options) => {
      if (!options) return envelope();
      const body = JSON.parse(String(options.body));
      sent.push(body);
      if (fail) {
        fail = false;
        version++;
        throw new HTTPError(409, 'Устарело');
      }
      version++;
      return envelope();
    },
  );
  await client.refresh();
  await client.send({ type: 'vote', target: 'player' });
  expect(sent).toHaveLength(2);
  expect(sent[0].commandId).toBe(sent[1].commandId);
  expect(sent.map((s) => s.expectedVersion)).toEqual([1, 2]);
  const across = checkpointClient(
    'mafia',
    'room',
    () => {},
    async (_path, options) => {
      if (options) {
        round++;
        throw new HTTPError(409, 'Новый раунд');
      }
      return envelope();
    },
  );
  await across.refresh();
  await expect(across.send({ type: 'vote', target: 'player' })).rejects.toThrow('Партия перешла дальше');
});
