// Экран партии «Кто я»: таблички, вопрос, ответы зала штампами, догадка, смена хода и итоги.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, LogOut, RotateCcw, Send, SkipForward, Trophy } from "lucide-react";
import { LIMITS, TIMINGS, type Answer, type View, type ViewParticipant, type ViewTurn } from "../../../shared/games/whoami/types";
import type { GameProps } from "./props";
import {
  ANSWER_LABEL,
  ConnectionBanner,
  ConnectionDot,
  Countdown,
  ErrorNote,
  LetterAssemble,
  MuseumHall,
  PHASE_LABEL,
  Plaque,
  PlayerChip,
  SoundToggle,
  Stamp,
  useAction,
  useHiddenTab,
  useRemaining,
  useSound,
} from "./ui";

type Send = GameProps["send"];
type Players = Map<string, ViewParticipant>;

const PHASE_TOTAL: Partial<Record<View["phase"], number>> = {
  assign: TIMINGS.assignMs,
  asking: TIMINGS.askMs,
  peerVote: TIMINGS.voteMs,
  guessing: TIMINGS.guessMs,
  nextTurn: TIMINGS.nextTurnMs,
};

/** Понятные примеры вопросов: ответ на них — «да», «нет» или «неоднозначно». */
export const SAMPLE_QUESTIONS = [
  "Я часть речи?",
  "Я изменяюсь по падежам?",
  "Я связан с пунктуацией?",
  "Я служебное слово?",
  "Меня изучают в разделе «Лексика»?",
  "Я обозначаю часть слова?",
];

const nameOf = (players: Players, id: string | null | undefined) => (id ? players.get(id)?.username ?? "Игрок" : "—");

function nextStep(view: View, me: string, players: Players): string {
  const turn = view.turn;
  const asker = nameOf(players, turn?.askerId);
  const mine = turn?.askerId === me;
  switch (view.phase) {
    case "assign":
      return "Таблички развешаны. Свою вы не видите — её читают все остальные. Задавайте вопросы и угадайте, кто вы.";
    case "asking":
      return mine ? "Ваш ход: задайте вопрос о своём термине, на который можно ответить «да» или «нет»." : `Спрашивает ${asker}. Подумайте, как ответить честно.`;
    case "peerVote":
      if (mine) return "Зал отвечает на ваш вопрос. Итог появится, когда все проголосуют или выйдет время.";
      return turn?.myAnswer ? "Ответ принят. Ждём остальных." : `Ответьте на вопрос игрока ${asker}: поставьте штамп.`;
    case "guessing":
      return mine ? "Назовите свой термин или пропустите догадку. Неверный ответ завершит ход, термин останется тайной." : `${asker} думает над догадкой.`;
    case "nextTurn":
      return "Смена хода.";
    case "finished":
      return view.hostId === me ? "Можно начать реванш с новыми табличками." : "Ведущий может запустить реванш.";
    default:
      return "";
  }
}

function Gallery({ view, players, currentUserId }: { view: View; players: Players; currentUserId: string }) {
  const track = useRef<HTMLUListElement>(null);
  const scroll = (direction: number) => track.current?.scrollBy({ left: direction * track.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <section className="rr-whoami-gallery" aria-label="Галерея табличек">
      <div className="rr-whoami-gallery-nav">
        <button type="button" className="rr-whoami-icon-btn" onClick={() => scroll(-1)} aria-label="Предыдущие таблички">
          <ChevronLeft aria-hidden="true" />
        </button>
        <button type="button" className="rr-whoami-icon-btn" onClick={() => scroll(1)} aria-label="Следующие таблички">
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <ul ref={track} className="rr-whoami-frames">
        {view.cards.map((card) => (
          <li key={card.playerId}>
            <Plaque card={card} owner={nameOf(players, card.playerId)} me={card.playerId === currentUserId} active={view.turn?.askerId === card.playerId} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function QuestionForm({ send }: { send: Send }) {
  const [text, setText] = useState("");
  const action = useAction();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim()) void action.run(() => send({ type: "ask", text })).then((ok) => ok && setText(""));
  };
  return (
    <form className="rr-whoami-card rr-whoami-form is-turn" onSubmit={submit}>
      <label htmlFor="rr-whoami-question">Ваш вопрос</label>
      <div className="rr-whoami-input-row">
        <input id="rr-whoami-question" ref={input} value={text} maxLength={LIMITS.questionChars} autoComplete="off" onChange={(e) => setText(e.target.value)} aria-describedby="rr-whoami-question-hint" />
        <button type="submit" className="rr-whoami-btn rr-whoami-btn--accent" disabled={action.busy || !text.trim()}>
          <Send aria-hidden="true" /> Спросить
        </button>
      </div>
      <p id="rr-whoami-question-hint" className="rr-whoami-muted">
        {text.length}/{LIMITS.questionChars}. Спрашивайте так, чтобы можно было ответить «да» или «нет».
      </p>
      <ul className="rr-whoami-samples" aria-label="Примеры вопросов">
        {SAMPLE_QUESTIONS.map((sample) => (
          <li key={sample}>
            <button type="button" className="rr-whoami-chip-btn" onClick={() => setText(sample)}>
              {sample}
            </button>
          </li>
        ))}
      </ul>
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </form>
  );
}

function VotePanel({ view, send, players, currentUserId }: { view: View; send: Send; players: Players; currentUserId: string }) {
  const action = useAction();
  const turn = view.turn;
  if (!turn) return null;
  const voters = view.participants.filter((p) => !p.left && p.id !== turn.askerId).length;
  const canVote = view.isParticipant && turn.askerId !== currentUserId && !turn.myAnswer;
  return (
    <section className="rr-whoami-card rr-whoami-vote" aria-labelledby="rr-whoami-vote-title">
      <p className="rr-whoami-kicker">Спрашивает {nameOf(players, turn.askerId)}</p>
      <h3 id="rr-whoami-vote-title" className="rr-whoami-question">«{turn.question}»</h3>
      <p className="rr-whoami-muted">
        Ответили {turn.votedIds.length} из {voters}. Итог покажем после голосования.
      </p>
      {canVote ? (
        <div className="rr-whoami-stamps" role="group" aria-label="Ваш ответ">
          {(["yes", "no", "ambiguous"] as Answer[]).map((answer) => (
            <button key={answer} type="button" className="rr-whoami-stamp-btn" aria-disabled={action.busy} onClick={() => !action.busy && void action.run(() => send({ type: "answer", answer }))}>
              <Stamp answer={answer} />
            </button>
          ))}
        </div>
      ) : turn.myAnswer ? (
        <p className="rr-whoami-voted">
          Ваш штамп: <Stamp answer={turn.myAnswer} pressed />
        </p>
      ) : null}
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </section>
  );
}

function TallyRow({ turn }: { turn: ViewTurn }) {
  if (!turn.tally || !turn.answer) return null;
  return (
    <div className="rr-whoami-tally">
      {(["yes", "no", "ambiguous"] as Answer[]).map((answer) => (
        <Stamp key={answer} answer={answer} count={turn.tally?.[answer] ?? 0} pressed={turn.answer === answer} />
      ))}
      <p>
        Итог зала: <b>{ANSWER_LABEL[turn.answer]}</b>
      </p>
    </div>
  );
}

function GuessPanel({ view, send, players, currentUserId }: { view: View; send: Send; players: Players; currentUserId: string }) {
  const [text, setText] = useState("");
  const action = useAction();
  const turn = view.turn;
  if (!turn) return null;
  const mine = turn.askerId === currentUserId;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim()) void action.run(() => send({ type: "guess", text }));
  };
  return (
    <section className="rr-whoami-card rr-whoami-guess" aria-labelledby="rr-whoami-guess-title">
      <p className="rr-whoami-kicker">Вопрос игрока {nameOf(players, turn.askerId)}</p>
      <h3 id="rr-whoami-guess-title" className="rr-whoami-question">«{turn.question}»</h3>
      <TallyRow turn={turn} />
      {mine ? (
        <form onSubmit={submit} className="rr-whoami-form">
          <label htmlFor="rr-whoami-guess">Кто я? Ваша догадка</label>
          <div className="rr-whoami-input-row">
            <input id="rr-whoami-guess" value={text} maxLength={LIMITS.guessChars} autoComplete="off" onChange={(e) => setText(e.target.value)} />
            <button type="submit" className="rr-whoami-btn rr-whoami-btn--accent" disabled={action.busy || !text.trim()}>
              Назвать
            </button>
            <button type="button" className="rr-whoami-btn rr-whoami-btn--ghost" disabled={action.busy} onClick={() => void action.run(() => send({ type: "skipGuess" }))}>
              <SkipForward aria-hidden="true" /> Пропустить
            </button>
          </div>
        </form>
      ) : null}
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </section>
  );
}

function TurnOutcome({ view, players }: { view: View; players: Players }) {
  const last = view.history[view.history.length - 1];
  if (!last) return null;
  const card = view.cards.find((c) => c.playerId === last.askerId);
  const who = nameOf(players, last.askerId);
  let text = `${who} пропускает догадку.`;
  if (last.timedOut === "ask") text = `${who} не успел задать вопрос — ход переходит дальше.`;
  else if (last.timedOut === "guess") text = `${who} не успел назвать термин.`;
  else if (last.guess && !last.guess.correct) text = `«${last.guess.text}» — неверно. Термин остаётся тайной.`;
  return (
    <section className="rr-whoami-card rr-whoami-outcome" role="status">
      {last.guess?.correct && card?.term ? (
        <>
          <p className="rr-whoami-kicker">{who} угадал!</p>
          <h3>
            <LetterAssemble text={card.term} />
          </h3>
          {card.definition ? <p>{card.definition}</p> : null}
        </>
      ) : (
        <p>{text}</p>
      )}
    </section>
  );
}

function History({ view, players }: { view: View; players: Players }) {
  if (view.history.length === 0) return null;
  return (
    <section className="rr-whoami-card" aria-label="История вопросов">
      <h3>История вопросов</h3>
      <ol className="rr-whoami-history">
        {[...view.history].reverse().map((turn) => (
          <li key={turn.seq}>
            <span className="rr-whoami-muted">
              {nameOf(players, turn.askerId)}, ход {turn.turnNumber}:
            </span>{" "}
            {turn.question ? `«${turn.question}»` : <i>без вопроса</i>}
            {turn.answer ? <span className={`rr-whoami-answer rr-whoami-answer--${turn.answer}`}>{ANSWER_LABEL[turn.answer]}</span> : null}
            {turn.tally ? (
              <span className="rr-whoami-muted">
                {" "}
                ({turn.tally.yes}/{turn.tally.no}/{turn.tally.ambiguous})
              </span>
            ) : null}
            {turn.guess ? <span>{turn.guess.correct ? ` → угадал: ${turn.guess.text}` : ` → «${turn.guess.text}» — неверно`}</span> : null}
            {turn.skipped ? <span className="rr-whoami-muted"> → пропуск</span> : null}
            {turn.timedOut === "limit" ? <span className="rr-whoami-muted"> → время партии вышло</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function Results({ view, players, currentUserId }: { view: View; players: Players; currentUserId: string }) {
  const outcome = view.outcome;
  if (!outcome) return null;
  const mine = outcome.scores.find((s) => s.userId === currentUserId)?.score;
  return (
    <div className="rr-whoami-results">
      <div className={`rr-whoami-card rr-whoami-verdict${outcome.draw ? " is-draw" : ""}`} role="status">
        <Trophy aria-hidden="true" />
        <div>
          <h3>{outcome.draw ? "Ничья: никто не угадал свой термин" : `Победа: ${outcome.winnerIds.map((id) => nameOf(players, id)).join(", ")}`}</h3>
          {mine !== undefined ? <p>Ваши очки: {mine}.</p> : null}
        </div>
      </div>
      <div className="rr-whoami-card">
        <h3>Экспонаты</h3>
        <ul className="rr-whoami-exhibits">
          {view.cards.map((card) => (
            <li key={card.playerId}>
              <b>{card.term}</b> <span className="rr-whoami-muted">— {nameOf(players, card.playerId)}, {card.solved ? `${card.score ?? 0} очк.` : "не угадан"}</span>
              <p>{card.definition}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MyQuestion({ view, currentUserId }: { view: View; currentUserId: string }) {
  const current = view.turn?.askerId === currentUserId ? view.turn : null;
  const last = [...view.history].reverse().find((t) => t.askerId === currentUserId && t.question);
  const shown = current?.question ? current : last;
  if (!view.isParticipant || !shown?.question) return null;
  return (
    <aside className="rr-whoami-pinned" aria-label="Мой последний вопрос и ответ зала">
      <span className="rr-whoami-kicker">Ваш вопрос</span>
      <span>«{shown.question}»</span>
      {shown.answer ? <span className={`rr-whoami-answer rr-whoami-answer--${shown.answer}`}>{ANSWER_LABEL[shown.answer]}</span> : null}
    </aside>
  );
}

function FinalActions({ view, send, currentUserId, onExit }: { view: View; send: Send; currentUserId: string; onExit: () => void }) {
  const action = useAction();
  return (
    <div className="rr-whoami-card rr-whoami-final-actions">
      {view.hostId === currentUserId ? (
        <button type="button" className="rr-whoami-btn rr-whoami-btn--accent" disabled={action.busy} onClick={() => void action.run(() => send({ type: "rematch" }))}>
          <RotateCcw aria-hidden="true" /> Реванш с новыми табличками
        </button>
      ) : (
        <p className="rr-whoami-muted">Реванш запускает ведущий — {view.participants.find((p) => p.isHost)?.username ?? "ведущий"}.</p>
      )}
      <button type="button" className="rr-whoami-btn rr-whoami-btn--ghost" onClick={onExit}>
        <LogOut aria-hidden="true" /> В каталог
      </button>
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </div>
  );
}

function PhaseBody({ view, send, players, currentUserId }: { view: View; send: Send; players: Players; currentUserId: string }) {
  const turn = view.turn;
  switch (view.phase) {
    case "asking":
      return turn?.askerId === currentUserId ? (
        <QuestionForm key={turn.seq} send={send} />
      ) : (
        <div className="rr-whoami-card rr-whoami-waiting" aria-live="polite">
          <p className="rr-whoami-kicker">Ход {turn?.turnNumber} из {view.maxTurns}</p>
          <h3>{nameOf(players, turn?.askerId)} формулирует вопрос…</h3>
        </div>
      );
    case "peerVote":
      return <VotePanel view={view} send={send} players={players} currentUserId={currentUserId} />;
    case "guessing":
      return <GuessPanel key={turn?.seq} view={view} send={send} players={players} currentUserId={currentUserId} />;
    case "nextTurn":
      return <TurnOutcome view={view} players={players} />;
    case "finished":
      return <Results view={view} players={players} currentUserId={currentUserId} />;
    case "cancelled":
      return (
        <div className="rr-whoami-card rr-whoami-warning" role="status">
          <h3>Партия отменена</h3>
          <p>{view.cancelReason ?? "Партия завершилась без победителя."}</p>
        </div>
      );
    default:
      return null;
  }
}

function MatchClock({ view, serverNowMs }: { view: View; serverNowMs: number }) {
  const left = useRemaining(view.phase === "finished" || view.phase === "cancelled" ? null : view.matchEndsAt, serverNowMs);
  if (left === null) return null;
  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);
  return (
    <span className="rr-whoami-match-clock" aria-label={`До конца партии ${minutes} мин ${seconds} с`}>
      до закрытия зала {minutes}:{String(seconds).padStart(2, "0")}
    </span>
  );
}

export function Game({ view, currentUserId, send, connection, serverNowMs, onExit }: GameProps) {
  const hidden = useHiddenTab();
  const sound = useSound();
  const players = useMemo(() => new Map(view.participants.map((p) => [p.id, p])), [view.participants]);
  const myTurn = view.turn?.askerId === currentUserId && (view.phase === "asking" || view.phase === "guessing");
  const solvedCount = view.cards.filter((c) => c.solved).length;
  const { play } = sound;

  useEffect(() => {
    if (myTurn) play("turn");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, view.phase]);
  useEffect(() => {
    if (solvedCount > 0) play("solved");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solvedCount]);

  const step = nextStep(view, currentUserId, players);
  return (
    <section className={`rr-game-whoami rr-whoami-game rr-whoami-phase-${view.phase}${hidden ? " is-paused" : ""}`} aria-labelledby="rr-whoami-phase-title">
      <MuseumHall />
      <header className="rr-whoami-top">
        <div>
          <p className="rr-whoami-kicker">Кто я · музей живых слов</p>
          <h2 id="rr-whoami-phase-title" aria-live="polite">
            {PHASE_LABEL[view.phase]}
          </h2>
          <MatchClock view={view} serverNowMs={serverNowMs} />
        </div>
        <div className="rr-whoami-top-actions">
          <Countdown deadline={view.deadline} serverNowMs={serverNowMs} totalMs={PHASE_TOTAL[view.phase] ?? 0} label={PHASE_LABEL[view.phase]} />
          <SoundToggle enabled={sound.enabled} toggle={sound.toggle} />
          <ConnectionDot connection={connection} />
          <button type="button" className="rr-whoami-icon-btn" onClick={onExit} aria-label="Выйти в каталог">
            <LogOut aria-hidden="true" />
            <span className="rr-whoami-icon-label">Выйти</span>
          </button>
        </div>
      </header>
      <ConnectionBanner connection={connection} />
      {step ? (
        <p className={`rr-whoami-step${myTurn ? " is-turn" : ""}`} aria-live="polite">
          {step}
        </p>
      ) : null}
      {!view.isParticipant ? <p className="rr-whoami-muted">Вы смотрите со стороны: неугаданные термины скрыты.</p> : null}
      <MyQuestion view={view} currentUserId={currentUserId} />
      <Gallery view={view} players={players} currentUserId={currentUserId} />
      <div className="rr-whoami-layout">
        <div className="rr-whoami-stack">
          <PhaseBody view={view} send={send} players={players} currentUserId={currentUserId} />
          {view.phase === "finished" || view.phase === "cancelled" ? <FinalActions view={view} send={send} currentUserId={currentUserId} onExit={onExit} /> : null}
          <History view={view} players={players} />
        </div>
        <aside className="rr-whoami-side">
          <div className="rr-whoami-card">
            <h3>Посетители</h3>
            <ul className="rr-whoami-players">
              {view.participants.map((player) => (
                <PlayerChip key={player.id} player={player} active={view.turn?.askerId === player.id} me={player.id === currentUserId}>
                  {view.phase === "peerVote" && view.turn?.votedIds.includes(player.id) ? <span className="rr-whoami-ready is-ready">ответил</span> : null}
                </PlayerChip>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </section>
  );
}
