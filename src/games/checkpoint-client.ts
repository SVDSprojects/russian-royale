import { http, HTTPError, type API } from './durak/client';
import type { Envelope } from './mafia/client';
import type { Action } from '../../shared/games/mafia/types';
export function checkpointClient(
  game: string,
  roomId: string,
  onUpdate: (value: Envelope) => void,
  request: API = http,
) {
  const base = '/api/games/' + game + '/rooms/' + roomId;
  let current: Envelope | null = null,
    refreshing: Promise<Envelope> | null = null,
    disposed = false;
  const accept = (value: unknown) => {
    const data = value as Envelope;
    if (!current || data.version >= current.version) {
      current = data;
      if (!disposed) onUpdate(data);
    }
    return current;
  };
  const refresh = () => {
    if (!refreshing)
      refreshing = request(base + '/view')
        .then(accept)
        .finally(() => {
          refreshing = null;
        });
    return refreshing;
  };
  async function command(kind: string, extra: Record<string, unknown> = {}) {
    if (!current) await refresh();
    const previous = current!,
      commandId = crypto.randomUUID();
    const attempt = () =>
      request(base + '/' + kind, {
        method: 'POST',
        body: JSON.stringify({ ...extra, commandId, expectedVersion: current!.version }),
      }).then(accept);
    try {
      return await attempt();
    } catch (e) {
      if (!(e instanceof HTTPError) || e.status !== 409) throw e;
      await refresh();
      const action = extra.action as Action | undefined;
      if (
        current!.view.sessionId === previous.view.sessionId &&
        current!.view.phase === previous.view.phase &&
        current!.view.round === previous.view.round &&
        (kind === 'ready' ||
          (action && ['vote', 'night', 'answer', 'edit', 'submit', 'reveal'].includes(action.type)))
      )
        return attempt();
      throw new HTTPError(409, 'Партия перешла дальше. Состояние обновлено — посмотри доступное действие.');
    }
  }
  return {
    refresh,
    command,
    dispose: () => {
      disposed = true;
    },
    activate: () => {
      disposed = false;
    },
    send: (action: Action) =>
      command(
        action.type === 'start' ? 'start' : action.type === 'ready' ? 'ready' : 'actions',
        action.type === 'ready' ? { ready: action.ready } : action.type === 'start' ? {} : { action },
      ),
  };
}
