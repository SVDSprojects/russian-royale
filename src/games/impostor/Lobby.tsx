// Лобби «Самозванца»: состав, готовность, настройки ведущего, причины, мешающие старту.
import { useState } from "react";
import { Check, Crown, LogOut, MessageCircle, Play, Users } from "lucide-react";
import { TIMINGS } from "../../../shared/games/impostor/types";
import type { GameProps } from "./props";
import { ConnectionBanner, ConnectionDot, ErrorNote, PlayerChip, Planets, Starfield, useAction, useHiddenTab } from "./ui";

function Rules() {
  return (
    <details className="rr-impostor-card rr-impostor-rules">
      <summary>Как играть</summary>
      <ol>
        <li>Большинство получает одну тему, ровно один случайный игрок — похожую, но другую. Названий ролей нет: каждый видит только свою тему.</li>
        <li>По очереди отправляйте по одному примеру (до 100 символов, {TIMINGS.exampleMs / 1000} с). Слова из названия своей темы запрещены.</li>
        <li>Обсуждение {TIMINGS.discussionMs / 1000} с, второй круг примеров, затем голосование {TIMINGS.votingMs / 1000} с.</li>
        <li>Обвинение принимается, если за игрока голосует строго больше половины всех участников. Иначе выигрывает отличившийся.</li>
        <li>Победители получают 100 очков, остальные — 30.</li>
      </ol>
    </details>
  );
}

export function Lobby({ view, currentUserId, send, connection, onExit }: GameProps) {
  const hidden = useHiddenTab();
  const action = useAction();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const me = view.participants.find((p) => p.id === currentUserId);
  const isHost = view.hostId === currentUserId;
  const active = view.participants.filter((p) => !p.left);
  const emptySlots = Math.max(0, view.minPlayers - active.length);
  const canStart = isHost && view.startBlockers.length === 0;
  const readyCount = active.filter((p) => p.ready).length;

  return (
    <section className={`rr-game-impostor rr-impostor-lobby${hidden ? " is-paused" : ""}`} aria-labelledby="rr-impostor-lobby-title">
      <Starfield />
      <header className="rr-impostor-top">
        <div>
          <p className="rr-impostor-kicker">Две орбиты одной темы</p>
          <h2 id="rr-impostor-lobby-title">Самозванец · лобби</h2>
        </div>
        <div className="rr-impostor-top-actions">
          <ConnectionDot connection={connection} />
          <button type="button" className="rr-impostor-icon-btn" onClick={onExit} aria-label="Вернуться в каталог">
            <LogOut aria-hidden="true" />
            <span className="rr-impostor-icon-label">Назад</span>
          </button>
        </div>
      </header>
      <ConnectionBanner connection={connection} />
      <p className="rr-impostor-sr" aria-live="polite">
        Лобби: {active.length} из {view.maxPlayers}, готовы {readyCount}.
      </p>

      <div className="rr-impostor-layout">
        <div className="rr-impostor-card rr-impostor-roster">
          <h3>
            <Users aria-hidden="true" /> Игроки {active.length}/{view.maxPlayers}
          </h3>
          <ul className="rr-impostor-players">
            {active.map((player) => (
              <PlayerChip key={player.id} player={player} active={false} me={player.id === currentUserId}>
                <span className={`rr-impostor-ready${player.ready ? " is-ready" : ""}`}>{player.ready ? "готов" : "ждём"}</span>
              </PlayerChip>
            ))}
            {Array.from({ length: emptySlots }, (_, index) => (
              <li key={`empty-${index}`} className="rr-impostor-player rr-impostor-player--empty">
                <span className="rr-impostor-sat-empty" aria-hidden="true" />
                <span>Свободная орбита</span>
              </li>
            ))}
          </ul>
          {active.length <= 1 ? <p className="rr-impostor-muted">Пока здесь только вы. Позовите друзей: нужно минимум {view.minPlayers} игрока.</p> : null}
        </div>

        <div className="rr-impostor-stack">
          <Planets diverged={false} />
          {view.contentCount === 0 ? (
            <div className="rr-impostor-card rr-impostor-warning" role="status">
              <h3>Не хватает контента</h3>
              <p>Нет ни одной опубликованной пары тем. Редактор может добавить и опубликовать пары в панели администратора.</p>
            </div>
          ) : null}

          {me && !me.left ? (
            <div className="rr-impostor-card rr-impostor-controls">
              <button
                type="button"
                className={`rr-impostor-btn${me.ready ? " rr-impostor-btn--ghost" : ""}`}
                aria-pressed={me.ready}
                aria-disabled={action.busy}
                onClick={() => {
                  // Без disabled: кнопка сохраняет фокус клавиатуры во время запроса.
                  if (!action.busy) void action.run(() => send({ type: "ready", ready: !me.ready }));
                }}
              >
                <Check aria-hidden="true" /> {me.ready ? "Я не готов" : "Я готов"}
              </button>

              {isHost ? (
                <>
                  <label className="rr-impostor-switch">
                    <input
                      type="checkbox"
                      checked={view.settings.chat}
                      aria-disabled={action.busy}
                      onChange={(event) => {
                        if (!action.busy) void action.run(() => send({ type: "settings", settings: { chat: event.target.checked } }));
                      }}
                    />
                    <MessageCircle aria-hidden="true" /> Чат во время обсуждения
                  </label>
                  <button
                    type="button"
                    className="rr-impostor-btn rr-impostor-btn--accent"
                    disabled={!canStart || action.busy}
                    onClick={() => void action.run(() => send({ type: "start" }))}
                  >
                    <Play aria-hidden="true" /> Начать партию
                  </button>
                  {view.startBlockers.length > 0 ? (
                    <ul className="rr-impostor-blockers" aria-label="Что мешает старту">
                      {view.startBlockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rr-impostor-muted">Все готовы — можно начинать.</p>
                  )}
                </>
              ) : (
                <p className="rr-impostor-muted">
                  <Crown aria-hidden="true" /> Партию начнёт ведущий, когда все будут готовы.
                </p>
              )}

              <ErrorNote message={action.error} onClose={() => action.setError(null)} />

              {confirmLeave ? (
                <div className="rr-impostor-confirm">
                  <span>Покинуть комнату?</span>
                  <button type="button" className="rr-impostor-btn rr-impostor-btn--ghost" onClick={() => setConfirmLeave(false)}>
                    Остаться
                  </button>
                  <button
                    type="button"
                    className="rr-impostor-btn rr-impostor-btn--danger"
                    onClick={() => void action.run(() => send({ type: "leave" })).then((ok) => ok && onExit())}
                  >
                    Покинуть
                  </button>
                </div>
              ) : (
                <button type="button" className="rr-impostor-link" onClick={() => setConfirmLeave(true)}>
                  Покинуть комнату
                </button>
              )}
            </div>
          ) : null}
          <Rules />
        </div>
      </div>
    </section>
  );
}
