import { useEffect, useState } from 'react';
import type { GameProps } from '../../../shared/games/roulette/types';
import { Frame, Scoreboard, ResultPanel, Reveal, useAction } from './ui';
import { Lobby } from './Lobby';
import { RouletteWheel } from './StudioArt';
import './styles.css';

export function Game(props: GameProps) {
  const { view, currentUserId, connection } = props,
    { act, busy, error } = useAction(props.send),
    [text, setText] = useState(''),
    [choice, setChoice] = useState('');
  useEffect(() => {
    setText('');
    setChoice('');
  }, [view.round]);
  if (view.phase === 'lobby') return <Lobby {...props} />;
  const me = view.players.find((p) => p.id === currentUserId)!,
    answered = view.answeredUserIds.includes(currentUserId),
    spectating = me.lives === 0 && view.settings.mode === 'elimination',
    can = view.phase === 'question' && !answered && !spectating && connection === 'online' && !busy;
  return (
    <Frame props={props} error={error} busy={busy}>
      {view.phase === 'finished' ? (
        <ResultPanel props={props} />
      ) : (
        <div className="rr-game-layout">
          <main>
            <div className="rr-heading">
              <div>
                <p className="rr-kicker">КАРУСЕЛЬ УДАЧИ</p>
                <h1>
                  Слово за вами<span>.</span>
                </h1>
              </div>
              <span className="rr-mode">
                {{ points: 'На очки', speed: 'На скорость', elimination: 'На выбывание' }[view.settings.mode]}
              </span>
            </div>
            <div className="rr-play-area">
              <div className="rr-question" data-phase={view.phase} data-answered={answered}>
                <div className="rr-studio-question-meta">
                  <p className="rr-kicker">РАУНД {String(view.round).padStart(2, '0')}</p>
                  {view.question ? (
                    <span className="rr-studio-difficulty">
                      <i aria-hidden="true">
                        {Array.from({ length: 3 }, (_, i) => (
                          <b key={i} className={i < view.question!.difficulty ? 'is-lit' : ''} />
                        ))}
                      </i>
                      {['', 'Легко', 'Средне', 'Сложно'][view.question.difficulty]}
                    </span>
                  ) : (
                    <span className="rr-studio-difficulty">Вращаем колесо</span>
                  )}
                </div>
                {view.phase === 'spin' && (
                  <div className="rr-studio-spin-mark" aria-hidden="true">
                    <span>?</span>
                    <i>А</i>
                    <i>Я</i>
                  </div>
                )}
                <h2>{view.question?.prompt ?? 'Следующая остановка — новая тема'}</h2>
                {view.phase === 'spin' && (
                  <p className="rr-studio-spin-message">
                    Сейчас колесо остановится. Приготовьтесь: у каждого будет одна попытка.
                  </p>
                )}
                {view.question && view.phase === 'question' && (
                  <>
                    {view.question.options.length > 0 ? (
                      <div className="rr-options">
                        {view.question.options.map((option, i) => (
                          <button
                            disabled={!can}
                            key={option}
                            className={choice === option ? 'is-selected' : ''}
                            aria-pressed={choice === option}
                            onClick={() => {
                              setChoice(option);
                              void act({ type: 'answer', text: option });
                            }}
                          >
                            <span className="rr-studio-option-letter">{String.fromCharCode(1040 + i)}</span>
                            <b>{option}</b>
                            {choice === option && (
                              <i className="rr-studio-choice-mark" aria-hidden="true">
                                {answered ? '✓' : '•'}
                              </i>
                            )}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <form
                        className="rr-studio-answer-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (can && text) void act({ type: 'answer', text });
                        }}
                      >
                        <label>
                          Ваш ответ
                          <input
                            value={text}
                            maxLength={3000}
                            disabled={!can}
                            onChange={(e) => setText(e.target.value)}
                            autoComplete="off"
                            placeholder="Введите слово или фразу…"
                          />
                        </label>
                        <button disabled={!can || !text}>Отправить</button>
                      </form>
                    )}
                    <div className={`rr-studio-answer-status${answered ? ' is-sent' : ''}`} role="status">
                      <span aria-hidden="true">{answered ? '✓' : spectating ? '◉' : busy ? '↗' : '!'}</span>
                      <p>
                        {answered
                          ? 'Ответ принят. Ждём остальных — результат пока скрыт.'
                          : spectating
                            ? 'Билеты закончились. Наблюдайте за игрой.'
                            : busy
                              ? 'Отправляем ваш ответ…'
                              : 'У каждого одна попытка. Выбирайте внимательно.'}
                      </p>
                    </div>
                    <div className="rr-studio-answer-progress">
                      <span className="rr-studio-answer-dots" aria-hidden="true">
                        {view.players
                          .filter((p) => view.settings.mode !== 'elimination' || p.lives > 0)
                          .map((p) => (
                            <i key={p.id} className={view.answeredUserIds.includes(p.id) ? 'is-done' : ''} />
                          ))}
                      </span>
                      <span>
                        <b>{view.answeredUserIds.length}</b> ответили
                      </span>
                    </div>
                  </>
                )}
                <Reveal props={props} />
                {view.phase === 'roundResult' && (
                  <p className="rr-studio-next-round">
                    <span aria-hidden="true">↻</span> Раунд завершён. Следующее вращение начнётся
                    автоматически.
                  </p>
                )}
              </div>
              <RouletteWheel props={props} />
            </div>
            {view.settings.mode === 'speed' && (
              <p className="rr-note">
                Бонус скорости считает сервер в момент получения ответа. Сетевое время входит в результат.
              </p>
            )}
          </main>
          <Scoreboard props={props} />
        </div>
      )}
    </Frame>
  );
}
