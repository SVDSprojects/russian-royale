// Лобби «Alias»: команды, авторазбиение и ручное назначение, число кругов, готовность, причины, мешающие старту.
import { useState } from "react";
import { ArrowRightLeft, Check, Crown, LogOut, Play, Shuffle, Users } from "lucide-react";
import { MAX_ROUNDS, MAX_TEAMS, MIN_ROUNDS, MIN_TEAMS, TIMINGS } from "../../../shared/games/alias/types";
import type { GameProps } from "./props";
import { ConnectionBanner, ConnectionDot, ErrorNote, FactoryBackdrop, PlayerChip, TeamBadge, useAction, useHiddenTab } from "./ui";

function Rules() {
  return (
    <details className="rr-alias-card rr-alias-rules">
      <summary>Как играть</summary>
      <ol>
        <li>Команды по очереди получают ход на {TIMINGS.explainMs / 1000} секунд. Объясняющий внутри команды меняется каждый ход.</li>
        <li>Объясняющий видит термин и запретные слова и пишет объяснение до 300 символов. Термин, его формы и запреты сервер не пропустит.</li>
        <li>Остальные игроки команды пишут ответы — их видит только своя команда. Другие команды наблюдают.</li>
        <li>Верный ответ — +1 и следующая карточка. Пропуск — −1. Карточка, на которой кончилось время, не штрафуется.</li>
        <li>Все команды получают одинаковое число ходов. Побеждает команда с наибольшим счётом, при равенстве — совместная победа.</li>
      </ol>
    </details>
  );
}

function Stepper({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled: boolean; onChange: (value: number) => void }) {
  return (
    <fieldset className="rr-alias-stepper">
      <legend>{label}</legend>
      <div role="group" aria-label={label}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((option) => (
          <button key={option} type="button" className={`rr-alias-chip-btn${option === value ? " is-on" : ""}`} aria-pressed={option === value} disabled={disabled} onClick={() => onChange(option)}>
            {option}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function Lobby({ view, currentUserId, send, connection, onExit }: GameProps) {
  const hidden = useHiddenTab();
  const action = useAction();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const me = view.participants.find((p) => p.id === currentUserId);
  const isHost = view.hostId === currentUserId;
  const active = view.participants.filter((p) => !p.left);
  const canStart = isHost && view.startBlockers.length === 0;
  const readyCount = active.filter((p) => p.ready).length;
  const run = (operation: () => Promise<void>) => {
    if (!action.busy) void action.run(operation);
  };

  return (
    <section className={`rr-game-alias rr-alias-lobby${hidden ? " is-paused" : ""}`} aria-labelledby="rr-alias-lobby-title">
      <FactoryBackdrop />
      <header className="rr-alias-top">
        <div>
          <p className="rr-alias-kicker">Фабрика смыслов</p>
          <h2 id="rr-alias-lobby-title">Alias · лобби</h2>
        </div>
        <div className="rr-alias-top-actions">
          <ConnectionDot connection={connection} />
          <button type="button" className="rr-alias-icon-btn" onClick={onExit} aria-label="Вернуться в каталог">
            <LogOut aria-hidden="true" />
            <span className="rr-alias-icon-label">Назад</span>
          </button>
        </div>
      </header>
      <ConnectionBanner connection={connection} />
      <p className="rr-alias-sr" aria-live="polite">
        Лобби: {active.length} из {view.maxPlayers}, готовы {readyCount}.
      </p>

      {view.contentCount < view.minCards ? (
        <div className="rr-alias-card rr-alias-warning" role="status">
          <h3>Не хватает карточек</h3>
          <p>
            Для старта нужно минимум {view.minCards} опубликованных карточек, сейчас {view.contentCount}. Редактор может добавить их в панели администратора.
          </p>
        </div>
      ) : null}

      <div className="rr-alias-teams">
        {view.teams.map((team) => {
          const members = active.filter((p) => p.team === team.index);
          return (
            <section key={team.index} className="rr-alias-card rr-alias-team" style={{ borderTopColor: team.color }} aria-label={`Команда ${team.name}`}>
              <h3>
                <TeamBadge team={team} /> <span className="rr-alias-muted">{members.length} игр.</span>
              </h3>
              <ul className="rr-alias-players">
                {members.map((player) => (
                  <PlayerChip key={player.id} player={player} me={player.id === currentUserId}>
                    <span className={`rr-alias-ready${player.ready ? " is-ready" : ""}`}>{player.ready ? "готов" : "ждём"}</span>
                    {isHost && view.teams.length > 1 ? (
                      <span className="rr-alias-move">
                        {view.teams
                          .filter((t) => t.index !== team.index)
                          .map((target) => (
                            <button
                              key={target.index}
                              type="button"
                              className="rr-alias-icon-btn"
                              aria-label={`Перевести ${player.username} в команду ${target.name}`}
                              onClick={() => run(() => send({ type: "assignTeam", userId: player.id, team: target.index }))}
                            >
                              <ArrowRightLeft aria-hidden="true" />
                              <TeamBadge team={target} size={18} label={false} />
                            </button>
                          ))}
                      </span>
                    ) : null}
                  </PlayerChip>
                ))}
                {members.length < 2 ? <li className="rr-alias-player rr-alias-player--empty">Нужен ещё игрок</li> : null}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="rr-alias-layout">
        {me && !me.left ? (
          <div className="rr-alias-card rr-alias-controls">
            <button
              type="button"
              className={`rr-alias-btn${me.ready ? " rr-alias-btn--ghost" : ""}`}
              aria-pressed={me.ready}
              aria-disabled={action.busy}
              onClick={() => run(() => send({ type: "ready", ready: !me.ready }))}
            >
              <Check aria-hidden="true" /> {me.ready ? "Я не готов" : "Я готов"}
            </button>
            {isHost ? (
              <>
                <Stepper
                  label="Команды"
                  value={view.settings.teamCount}
                  min={MIN_TEAMS}
                  max={MAX_TEAMS}
                  disabled={action.busy}
                  onChange={(teamCount) => run(() => send({ type: "settings", settings: { ...view.settings, teamCount } }))}
                />
                <Stepper
                  label="Круги"
                  value={view.settings.rounds}
                  min={MIN_ROUNDS}
                  max={MAX_ROUNDS}
                  disabled={action.busy}
                  onChange={(rounds) => run(() => send({ type: "settings", settings: { ...view.settings, rounds } }))}
                />
                <button type="button" className="rr-alias-btn rr-alias-btn--ghost" onClick={() => run(() => send({ type: "autoTeams" }))}>
                  <Shuffle aria-hidden="true" /> Разбить поровну
                </button>
                <button type="button" className="rr-alias-btn rr-alias-btn--accent" disabled={!canStart || action.busy} onClick={() => run(() => send({ type: "start" }))}>
                  <Play aria-hidden="true" /> Запустить конвейер
                </button>
                {view.startBlockers.length > 0 ? (
                  <ul className="rr-alias-blockers" aria-label="Что мешает старту">
                    {view.startBlockers.map((blocker) => (
                      <li key={blocker}>{blocker}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="rr-alias-muted">Все готовы — можно запускать.</p>
                )}
              </>
            ) : (
              <p className="rr-alias-muted">
                <Crown aria-hidden="true" /> Команды и число кругов ({view.settings.rounds}) настраивает ведущий. Он же запускает партию.
              </p>
            )}
            <ErrorNote message={action.error} onClose={() => action.setError(null)} />
            {confirmLeave ? (
              <div className="rr-alias-confirm">
                <span>Покинуть комнату?</span>
                <button type="button" className="rr-alias-btn rr-alias-btn--ghost" onClick={() => setConfirmLeave(false)}>
                  Остаться
                </button>
                <button type="button" className="rr-alias-btn rr-alias-btn--danger" onClick={() => void action.run(() => send({ type: "leave" })).then((ok) => ok && onExit())}>
                  Покинуть
                </button>
              </div>
            ) : (
              <button type="button" className="rr-alias-link" onClick={() => setConfirmLeave(true)}>
                Покинуть комнату
              </button>
            )}
          </div>
        ) : null}
        <div className="rr-alias-stack">
          <p className="rr-alias-muted">
            <Users aria-hidden="true" /> {active.length}/{view.maxPlayers} игроков · {view.settings.teamCount} команды · {view.settings.rounds} круга · ходов у каждой команды:{" "}
            {view.settings.rounds}
          </p>
          <Rules />
        </div>
      </div>
    </section>
  );
}
