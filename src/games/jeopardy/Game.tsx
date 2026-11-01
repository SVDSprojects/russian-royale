import { useState } from 'react';
import type { GameProps } from '../../../shared/games/jeopardy/types';
import { Frame, Scoreboard, ResultPanel, Reveal, useAction } from './ui';
import { Lobby } from './Lobby';
import { IslandArt } from './Art';
import { Anchor, Check, Flag, Radio, Send, Sparkles } from 'lucide-react';
import './styles.css';
export function Game(props: GameProps) {
  const { view, currentUserId, connection } = props,
    { act, busy, error } = useAction(props.send),
    [text, setText] = useState(''),
    [chat, setChat] = useState(''),
    [tab, setTab] = useState(0);
  if (view.phase === 'lobby') return <Lobby {...props} />;
  const me = view.players.find((p) => p.id === currentUserId)!,
    chooser = view.teams.find((t) => t.id === view.chooserTeamId),
    answerer = view.players.find((p) => p.id === view.answererId),
    disabled = busy || connection !== 'online';
  return (
    <Frame props={props} error={error} busy={busy}>
      {view.phase === 'finished' ? (
        <ResultPanel props={props} />
      ) : (
        <div className="rr-game-layout">
          <main>
            <div className="jd-game-heading">
              <div>
                <p className="rr-kicker">СВОЯ ИГРА · АРХИПЕЛАГ ЗНАНИЙ</p>
                <h1>Курс на открытие.</h1>
              </div>
              <div className="jd-discovered">
                <Flag size={19} aria-hidden="true" />
                <strong>
                  {view.board.filter((q) => q.closed).length}
                  <small> / 25</small>
                </strong>
                <span>островных открытий</span>
              </div>
            </div>
            <div className="rr-teams">
              {view.teams.map((t, index) => (
                <div
                  className={t.id === view.chooserTeamId ? 'rr-current-team' : ''}
                  key={t.id}
                  data-team={index % 4}
                >
                  <span className="jd-team-name">
                    <i aria-hidden="true">
                      <Flag size={15} />
                    </i>
                    {t.name}
                    {t.id === view.chooserTeamId && <em>ХОД</em>}
                  </span>
                  <strong>
                    {t.score}
                    <small> очков</small>
                  </strong>
                  <small className="jd-captain">
                    Капитан: {view.players.find((p) => p.id === t.captainId)?.username}
                  </small>
                </div>
              ))}
            </div>
            {view.phase === 'board' ? (
              <>
                <p className="rr-turn">
                  <span className="jd-turn-icon">
                    <Anchor size={19} aria-hidden="true" />
                  </span>
                  <span>
                    Выбирает <b>{chooser?.name}</b> · капитан{' '}
                    {view.players.find((p) => p.id === chooser?.captainId)?.username}
                  </span>
                  <span className="jd-turn-hint">
                    {chooser?.captainId === currentUserId
                      ? 'Ваш ход — выберите вопрос'
                      : 'Следим за курсом капитана'}
                  </span>
                </p>
                <div className="rr-tabs" role="tablist" aria-label="Категории">
                  {view.categories.map((c, i) => (
                    <button key={c.id} role="tab" aria-selected={tab === i} onClick={() => setTab(i)}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <div className="rr-board">
                  {view.categories.map((c, i) => (
                    <section
                      className={'rr-island ' + (tab === i ? 'rr-active-island' : '')}
                      key={c.id}
                      data-island={i % 5}
                    >
                      <div className="jd-island-heading">
                        <span className="jd-island-number">ОСТРОВ 0{i + 1}</span>
                        <IslandArt index={i} />
                        <h2>{c.label}</h2>
                        <span className="jd-island-progress">
                          {view.board.filter((q) => q.categoryId === c.id && q.closed).length} / 5 открыто
                        </span>
                      </div>
                      <div className="jd-island-questions">
                        {view.board
                          .filter((q) => q.categoryId === c.id)
                          .sort((a, b) => a.cost - b.cost)
                          .map((q) => (
                            <button
                              key={q.id}
                              data-closed={q.closed}
                              data-captured={view.flags.some((f) => f.questionId === q.id)}
                              aria-label={`${c.label}, ${q.cost}${q.closed ? ', закрыто' : ''}`}
                              disabled={disabled || q.closed || chooser?.captainId !== currentUserId}
                              onClick={() => void act({ type: 'select', questionId: q.id })}
                            >
                              <span>
                                {q.closed ? (
                                  view.flags.some((f) => f.questionId === q.id) ? (
                                    <Flag size={21} aria-hidden="true" />
                                  ) : (
                                    <Check size={21} aria-hidden="true" />
                                  )
                                ) : (
                                  q.cost
                                )}
                              </span>
                              <small>{q.closed ? 'Открыто' : 'очков'}</small>
                            </button>
                          ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            ) : (
              <article className="rr-question rr-zoom" data-stage={view.phase}>
                <div className="jd-question-heading">
                  <span className="jd-question-icon">
                    <Sparkles size={24} aria-hidden="true" />
                  </span>
                  <span>ОТКРЫТИЕ {String(view.round).padStart(2, '0')}</span>
                  <strong>
                    +{view.question?.cost}
                    <small>очков за ответ</small>
                  </strong>
                </div>
                <p className="rr-kicker">
                  {view.categories.find((c) => c.id === view.question?.categoryId)?.label}
                </p>
                <h2>{view.question?.prompt}</h2>
                {view.phase === 'reading' && (
                  <p className="jd-reading-note">
                    <span className="jd-reading-dots" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                    Пять секунд на чтение. Сигнал откроется одновременно для всех.
                  </p>
                )}
                {view.phase === 'buzz' && (
                  <>
                    <button
                      className="rr-buzz"
                      disabled={disabled || view.blockedTeams.includes(me.teamId!)}
                      onClick={() => void act({ type: 'buzz' })}
                    >
                      <Radio size={25} aria-hidden="true" /> Я знаю ответ!
                    </button>
                    <p className="jd-answerer-note">
                      <span className="jd-signal-dot" aria-hidden="true" />
                      {view.blockedTeams.includes(me.teamId!)
                        ? 'Ваша команда уже использовала попытку. Ждём соперников.'
                        : 'Первый сигнал, полученный сервером, открывает ответ.'}
                    </p>
                  </>
                )}
                {view.phase === 'answer' && me.teamId === answerer?.teamId && (
                  <button disabled={disabled} onClick={() => void act({ type: 'pass' })}>
                    Пропустить без штрафа
                  </button>
                )}
                {view.phase === 'answer' &&
                  (view.answererId === currentUserId ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (text.trim()) void act({ type: 'answer', text }).then(() => setText(''));
                      }}
                    >
                      <label>
                        Ваш ответ
                        <input
                          autoFocus
                          value={text}
                          maxLength={3000}
                          disabled={disabled}
                          onChange={(e) => setText(e.target.value)}
                        />
                      </label>
                      <button disabled={disabled || !text.trim()}>Отправить ответ</button>
                      <p>Можно обсудить ответ в закрытом чате своей команды.</p>
                    </form>
                  ) : (
                    <p>
                      Отвечает <b>{answerer?.username}</b>. Остальные сигналы заблокированы.
                    </p>
                  ))}
                <Reveal props={props} />
              </article>
            )}
            <section className="rr-chat">
              <h2>
                <Radio size={20} aria-hidden="true" />
                Радиорубка · только ваша команда<span className="jd-private-chat">ЗАКРЫТЫЙ КАНАЛ</span>
              </h2>
              <div className="rr-messages" role="log" aria-live="polite">
                {view.chat.length === 0 ? (
                  <p>Здесь можно обсудить ответ с командой.</p>
                ) : (
                  view.chat.map((m) => (
                    <p key={m.id}>
                      <b>{view.players.find((p) => p.id === m.userId)?.username}:</b> {m.text}
                    </p>
                  ))
                )}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (chat.trim()) void act({ type: 'chat', text: chat }).then(() => setChat(''));
                }}
              >
                <label className="rr-sr-only" htmlFor="rr-jeopardy-chat">
                  Сообщение команде
                </label>
                <input
                  id="rr-jeopardy-chat"
                  value={chat}
                  maxLength={500}
                  onChange={(e) => setChat(e.target.value)}
                  placeholder="Сообщение своей команде"
                />
                <button disabled={disabled || !chat.trim()}>
                  Отправить
                  <Send size={16} aria-hidden="true" />
                </button>
              </form>
            </section>
          </main>
          <Scoreboard props={props} />
        </div>
      )}
    </Frame>
  );
}
