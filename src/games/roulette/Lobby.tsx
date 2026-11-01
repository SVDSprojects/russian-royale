import type { GameProps } from '../../../shared/games/roulette/types';
import { Frame, Scoreboard, useAction } from './ui';
import { RouletteLobbyArt } from './StudioArt';
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
          <div className="rr-studio-lobby-hero">
            <div className="rr-studio-lobby-copy">
              <p className="rr-kicker">
                <span className="rr-studio-live-dot" /> КАРУСЕЛЬ УДАЧИ · 2–16 ИГРОКОВ
              </p>
              <h1>
                Вращайте колесо.
                <br />
                <em>Находите слова.</em>
              </h1>
              <p className="rr-lead">
                Один вопрос для всех, один шанс ответить. Собирайте очки, берегите билеты и открывайте русский
                язык вместе.
              </p>
              <div className="rr-studio-lobby-facts">
                <span>
                  <b>01</b> Колесо выбирает тему
                </span>
                <span>
                  <b>02</b> Все отвечают
                </span>
                <span>
                  <b>03</b> Знания приносят очки
                </span>
              </div>
            </div>
            <RouletteLobbyArt />
          </div>
          <div className="rr-lobby-controls">
            <div className="rr-studio-ready-heading">
              <span className="rr-studio-ready-icon" aria-hidden="true">
                ↗
              </span>
              <div>
                <h2>Ваша команда почти в сборе</h2>
                <span>
                  {view.players.filter((p) => p.ready && p.online).length} из {view.players.length} готовы к
                  игре
                </span>
              </div>
            </div>
            <p>
              {view.players.length < 2
                ? 'Позовите друга: пусть откроет эту игру и выберет ваш сервер и комнату.'
                : 'Проверьте состав. Чтобы начать, каждый участник должен подтвердить готовность.'}
            </p>
            <div className="rr-ready-list">
              {view.players.map((p) => (
                <span className={p.ready && p.online ? 'is-ready' : ''} key={p.id}>
                  <i aria-hidden="true">{p.ready && p.online ? '✓' : p.username.slice(0, 1)}</i> {p.username}
                  <small>{!p.online ? 'Нет связи' : p.ready ? 'Готов' : 'Ожидаем'}</small>
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
