import type { GameProps } from '../../../shared/games/jeopardy/types';
import { Frame, Scoreboard, useAction } from './ui';
import { ArchipelagoArt } from './Art';
import { Anchor, Flag, Radio } from 'lucide-react';
import './styles.css';
export function Lobby(props: GameProps) {
  const { view, currentUserId, connection } = props,
    { act, busy, error } = useAction(props.send),
    me = view.players.find((p) => p.id === currentUserId)!;
  const disabled = busy || connection !== 'online';
  return (
    <Frame props={props} error={error} busy={busy}>
      <div className="rr-lobby-layout">
        <main>
          <section className="jd-lobby-hero">
            <div className="jd-lobby-copy">
              <p className="rr-kicker">
                <span /> СВОЯ ИГРА · АРХИПЕЛАГ ЗНАНИЙ
              </p>
              <h1>
                Пять островов.
                <br />
                <em>Море открытий.</em>
              </h1>
              <p className="rr-lead">
                Выбирайте остров, зажигайте маяк и отвечайте раньше соперников. Двадцать пять вопросов — одна
                общая экспедиция.
              </p>
              <div className="jd-expedition-tags">
                <span>2–4 команды</span>
                <span>25 открытий</span>
                <span>Один победитель</span>
              </div>
            </div>
            <ArchipelagoArt />
          </section>
          <div className="jd-expedition-guide" aria-label="Как проходит игра">
            <div>
              <span>
                <Anchor size={20} aria-hidden="true" />
              </span>
              <p>
                <b>Соберите экипаж</b>
                <small>Команда и капитан</small>
              </p>
            </div>
            <div>
              <span>
                <Flag size={20} aria-hidden="true" />
              </span>
              <p>
                <b>Выберите остров</b>
                <small>Чем выше ставка, тем сложнее</small>
              </p>
            </div>
            <div>
              <span>
                <Radio size={20} aria-hidden="true" />
              </span>
              <p>
                <b>Подайте сигнал</b>
                <small>Знаете ответ — действуйте</small>
              </p>
            </div>
          </div>
          <div className="rr-lobby-controls">
            <div className="jd-panel-eyebrow">
              <span>ПОДГОТОВКА К ЭКСПЕДИЦИИ</span>
              <span>
                {view.players.filter((p) => p.ready).length} / {view.players.length} готовы
              </span>
            </div>
            <h2>Ваша команда почти в сборе</h2>
            <p>
              {view.players.length < 2
                ? 'Позовите друга: пусть откроет эту игру и выберет ваш сервер и комнату.'
                : 'Проверьте состав. Чтобы начать, каждый участник должен подтвердить готовность.'}
            </p>
            <div className="rr-fields">
              <label>
                Ваша команда
                <select
                  disabled={disabled}
                  value={me.teamId ?? 't1'}
                  onChange={(e) => void act({ type: 'team', teamId: e.target.value })}
                >
                  {Array.from({ length: view.settings.teamCount }, (_, i) => (
                    <option key={i} value={`t${i + 1}`}>
                      Команда {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Капитан вашей команды
                <select
                  disabled={disabled}
                  value={view.teams.find((t) => t.id === me.teamId)?.captainId ?? currentUserId}
                  onChange={(e) => void act({ type: 'captain', userId: e.target.value })}
                >
                  {view.players
                    .filter((p) => p.teamId === me.teamId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.username}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="rr-ready-list">
              {view.players.map((p) => (
                <span className={p.ready ? 'is-ready' : ''} key={p.id}>
                  {p.ready ? '✓' : '○'} {p.username}
                </span>
              ))}
            </div>
            {view.contentIssues.length > 0 && (
              <div className="rr-error" role="status">
                <b>Нужно добавить учебные материалы</b>
                {view.contentIssues.map((x, i) => (
                  <p key={i}>{x}</p>
                ))}
              </div>
            )}
            <div className="rr-actions">
              <button disabled={disabled} onClick={() => void act({ type: 'ready', ready: !me.ready })}>
                {me.ready ? 'Отменить готовность' : 'Я готов'}
              </button>
              {currentUserId === view.hostId && (
                <button
                  className="rr-accent"
                  disabled={
                    disabled ||
                    view.players.length < 2 ||
                    !view.players.every((p) => p.ready && p.online) ||
                    view.contentIssues.length > 0
                  }
                  onClick={() => void act({ type: 'start' })}
                >
                  Начать игру ↗
                </button>
              )}
            </div>
          </div>
        </main>
        <Scoreboard props={props} />
      </div>
    </Frame>
  );
}
