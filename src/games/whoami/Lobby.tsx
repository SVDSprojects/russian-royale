// Лобби «Кто я»: состав, готовность, сложность терминов, причины, мешающие старту.
import { useState } from "react";
import { Check, Crown, LogOut, Play, Users } from "lucide-react";
import { LIMITS, TIMINGS, type DifficultySetting } from "../../../shared/games/whoami/types";
import type { GameProps } from "./props";
import { ConnectionBanner, ConnectionDot, ErrorNote, MuseumHall, PlayerChip, useAction, useHiddenTab } from "./ui";

const DIFFICULTY_LABEL: Record<DifficultySetting, string> = { any: "Любые", easy: "Простые", medium: "Средние", hard: "Сложные" };

function Rules() {
  return (
    <details className="rr-whoami-card rr-whoami-rules">
      <summary>Как играть</summary>
      <ol>
        <li>Каждому достаётся табличка с термином. Свою вы не видите, чужие — читаете.</li>
        <li>В свой ход задайте вопрос до {LIMITS.questionChars} символов ({TIMINGS.askMs / 1000} с). Остальные ставят штамп «Да», «Нет» или «Неоднозначно» ({TIMINGS.voteMs / 1000} с).</li>
        <li>После ответа зала назовите термин или пропустите ({TIMINGS.guessMs / 1000} с). Неверная догадка завершает ход.</li>
        <li>Очки: 100 за угадывание с первого хода, минус 10 за каждый прошлый ход, но не меньше 20. Не угадали — 0.</li>
        <li>Не больше {LIMITS.maxPersonalTurns} личных ходов, вся партия — до {TIMINGS.matchMs / 60_000} минут. Угадавший продолжает отвечать другим.</li>
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
    <section className={`rr-game-whoami rr-whoami-lobby${hidden ? " is-paused" : ""}`} aria-labelledby="rr-whoami-lobby-title">
      <MuseumHall />
      <header className="rr-whoami-top">
        <div>
          <p className="rr-whoami-kicker">Музей живых слов</p>
          <h2 id="rr-whoami-lobby-title">Кто я · лобби</h2>
        </div>
        <div className="rr-whoami-top-actions">
          <ConnectionDot connection={connection} />
          <button type="button" className="rr-whoami-icon-btn" onClick={onExit} aria-label="Вернуться в каталог">
            <LogOut aria-hidden="true" />
            <span className="rr-whoami-icon-label">Назад</span>
          </button>
        </div>
      </header>
      <ConnectionBanner connection={connection} />
      <p className="rr-whoami-sr" aria-live="polite">
        Лобби: {active.length} из {view.maxPlayers}, готовы {readyCount}.
      </p>

      <div className="rr-whoami-layout">
        <div className="rr-whoami-stack">
          {view.contentCount < Math.max(active.length, view.minPlayers) ? (
            <div className="rr-whoami-card rr-whoami-warning" role="status">
              <h3>Не хватает контента</h3>
              <p>
                Подходящих опубликованных терминов: {view.contentCount}. Каждому игроку нужна своя табличка без повторов. Выберите другую сложность или попросите
                редактора опубликовать термины.
              </p>
            </div>
          ) : null}
          {me && !me.left ? (
            <div className="rr-whoami-card rr-whoami-controls">
              <button
                type="button"
                className={`rr-whoami-btn${me.ready ? " rr-whoami-btn--ghost" : ""}`}
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
                  <label className="rr-whoami-select">
                    Термины
                    <select
                      value={view.settings.difficulty}
                      aria-disabled={action.busy}
                      onChange={(event) => {
                        if (!action.busy) void action.run(() => send({ type: "settings", settings: { difficulty: event.target.value as DifficultySetting } }));
                      }}
                    >
                      {(Object.keys(DIFFICULTY_LABEL) as DifficultySetting[]).map((key) => (
                        <option key={key} value={key}>
                          {DIFFICULTY_LABEL[key]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="button" className="rr-whoami-btn rr-whoami-btn--accent" disabled={!canStart || action.busy} onClick={() => void action.run(() => send({ type: "start" }))}>
                    <Play aria-hidden="true" /> Открыть экспозицию
                  </button>
                  {view.startBlockers.length > 0 ? (
                    <ul className="rr-whoami-blockers" aria-label="Что мешает старту">
                      {view.startBlockers.map((blocker) => (
                        <li key={blocker}>{blocker}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rr-whoami-muted">Все готовы — можно начинать.</p>
                  )}
                </>
              ) : (
                <p className="rr-whoami-muted">
                  <Crown aria-hidden="true" /> Партию начнёт ведущий, когда все будут готовы. Термины: {DIFFICULTY_LABEL[view.settings.difficulty].toLowerCase()}.
                </p>
              )}
              <ErrorNote message={action.error} onClose={() => action.setError(null)} />
              {confirmLeave ? (
                <div className="rr-whoami-confirm">
                  <span>Покинуть комнату?</span>
                  <button type="button" className="rr-whoami-btn rr-whoami-btn--ghost" onClick={() => setConfirmLeave(false)}>
                    Остаться
                  </button>
                  <button type="button" className="rr-whoami-btn rr-whoami-btn--danger" onClick={() => void action.run(() => send({ type: "leave" })).then((ok) => ok && onExit())}>
                    Покинуть
                  </button>
                </div>
              ) : (
                <button type="button" className="rr-whoami-link" onClick={() => setConfirmLeave(true)}>
                  Покинуть комнату
                </button>
              )}
            </div>
          ) : null}
          <Rules />
        </div>
        <div className="rr-whoami-card rr-whoami-roster">
          <h3>
            <Users aria-hidden="true" /> Посетители {active.length}/{view.maxPlayers}
          </h3>
          <ul className="rr-whoami-players">
            {active.map((player) => (
              <PlayerChip key={player.id} player={player} active={false} me={player.id === currentUserId}>
                <span className={`rr-whoami-ready${player.ready ? " is-ready" : ""}`}>{player.ready ? "готов" : "ждём"}</span>
              </PlayerChip>
            ))}
            {Array.from({ length: emptySlots }, (_, index) => (
              <li key={`empty-${index}`} className="rr-whoami-player rr-whoami-player--empty">
                <span className="rr-whoami-avatar-empty" aria-hidden="true" />
                <span>Пустая рама</span>
              </li>
            ))}
          </ul>
          {active.length <= 1 ? <p className="rr-whoami-muted">Пока здесь только вы. Позовите друзей: нужно минимум {view.minPlayers} игрока.</p> : null}
        </div>
      </div>
    </section>
  );
}
