// Экран партии «Alias»: подготовка, объяснение на конвейере, итог хода и финал «Фабрики смыслов».
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LogOut, RotateCcw, Send, SkipForward, Trophy } from "lucide-react";
import { LIMITS, TIMINGS, type HistoryCard, type RevealedCard, type View, type ViewParticipant, type ViewTeam } from "../../../shared/games/alias/types";
import type { GameProps } from "./props";
import {
  ConnectionBanner,
  ConnectionDot,
  Conveyor,
  ErrorNote,
  FactoryBackdrop,
  Gauge,
  PHASE_LABEL,
  SoundToggle,
  TeamBadge,
  useAction,
  useHiddenTab,
  useSound,
} from "./ui";

type Send = GameProps["send"];
type Players = Map<string, ViewParticipant>;

const PHASE_TOTAL: Partial<Record<View["phase"], number>> = {
  prepare: TIMINGS.prepareMs,
  explaining: TIMINGS.explainMs,
  turnResult: TIMINGS.turnResultMs,
};

function nameOf(players: Players, id: string | null | undefined): string {
  if (!id) return "—";
  return players.get(id)?.username ?? "Игрок";
}

function teamOf(view: View, index: number | null): ViewTeam | null {
  return index === null ? null : (view.teams[index] ?? null);
}

function nextStep(view: View, players: Players): string {
  const team = teamOf(view, view.activeTeam);
  const teamName = team ? `«${team.name}»` : "";
  switch (view.phase) {
    case "prepare":
      return `Готовится команда ${teamName}. Объясняет ${nameOf(players, view.explainerId)}.`;
    case "explaining":
      if (view.myRole === "explainer") return "Объясняйте термин, не называя его и запретные слова. Пропуск стоит −1.";
      if (view.myRole === "guesser") return `Угадывайте! Объясняет ${nameOf(players, view.explainerId)}. Ваши ответы видит только ваша команда.`;
      return `Сейчас угадывает команда ${teamName}. Следите за объяснениями — ваш ход впереди.`;
    case "turnResult":
      return "Ход окончен: коробки разъехались по вагонам и боковой ветке.";
    case "finished":
      return "Партия окончена. Ведущий может запустить реванш.";
    default:
      return "";
  }
}

/** Следит за сменой карточки и подсказывает, куда уехала прошлая коробка: в вагон или на боковую ветку. */
function useDeparture(view: View): { seq: number; to: "wagon" | "siding" } | null {
  const previous = useRef<number | null>(view.cardSeq);
  const [departure, setDeparture] = useState<{ seq: number; to: "wagon" | "siding" } | null>(null);
  useEffect(() => {
    const prev = previous.current;
    previous.current = view.cardSeq;
    if (prev === null || prev === view.cardSeq) return;
    const guessed = view.revealed.some((card) => card.seq === prev && card.outcome === "guessed");
    setDeparture({ seq: prev, to: guessed ? "wagon" : "siding" });
    const timer = setTimeout(() => setDeparture(null), 600);
    return () => clearTimeout(timer);
  }, [view.cardSeq, view.revealed]);
  return departure;
}

function Wagons({ view, players }: { view: View; players: Players }) {
  return (
    <ul className="rr-alias-wagons" aria-label="Счёт команд">
      {view.teams.map((team) => {
        const active = team.index === view.activeTeam && view.phase !== "finished";
        const winner = view.outcome?.winnerTeams.includes(team.index) ?? false;
        return (
          <li key={team.index} className={`rr-alias-wagon${active ? " is-active" : ""}${winner ? " is-winner" : ""}`} style={{ borderColor: team.color }}>
            <TeamBadge team={team} />
            <b className="rr-alias-wagon-score" aria-label={`Счёт: ${team.score}`}>
              {team.score}
            </b>
            <span className="rr-alias-muted rr-alias-wagon-members">
              {team.memberIds
                .map((id) => players.get(id))
                .filter((p): p is ViewParticipant => p !== undefined && !p.left)
                .map((p) => p.username)
                .join(", ")}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Clouds({ view }: { view: View }) {
  const log = useRef<HTMLOListElement>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [view.explanations.length]);
  return (
    <section className="rr-alias-card rr-alias-clouds" aria-label="Объяснения">
      <h3>Речевые облака</h3>
      <ol ref={log} role="log" aria-live="polite">
        {view.explanations.map((entry) => (
          <li key={entry.seq} className="rr-alias-cloud">
            {entry.text}
          </li>
        ))}
        {view.explanations.length === 0 ? <li className="rr-alias-muted">Объяснений пока нет.</li> : null}
      </ol>
    </section>
  );
}

function ExplainerPanel({ view, send }: { view: View; send: Send }) {
  const [text, setText] = useState("");
  const action = useAction();
  const card = view.card;
  if (!card) return null;
  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!text.trim()) return;
    void action.run(() => send({ type: "explain", text })).then((ok) => ok && setText(""));
  };
  return (
    <div className="rr-alias-card rr-alias-explainer">
      <div className="rr-alias-window" aria-label="Приватное окошко: видите только вы">
        <p className="rr-alias-kicker">Только для вас · {card.category}</p>
        <p className="rr-alias-term">{card.term}</p>
        <ul className="rr-alias-labels" aria-label="Нельзя говорить">
          {card.forbidden.map((word) => (
            <li key={word}>{word.replace(/\*$/, "…")}</li>
          ))}
        </ul>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="rr-alias-explain">Объяснение</label>
        <textarea
          id="rr-alias-explain"
          rows={3}
          value={text}
          maxLength={LIMITS.explanationChars}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) submit(event);
          }}
        />
        <p className="rr-alias-muted">
          {text.length}/{LIMITS.explanationChars}. Enter — отправить. Запрещённое сервер не пропустит, штрафа нет.
        </p>
        <div className="rr-alias-controls">
          <button type="submit" className="rr-alias-btn rr-alias-btn--accent" disabled={action.busy || !text.trim()}>
            <Send aria-hidden="true" /> Отправить объяснение
          </button>
          <button type="button" className="rr-alias-btn rr-alias-btn--ghost" disabled={action.busy} onClick={() => void action.run(() => send({ type: "skip", cardSeq: card.seq }))}>
            <SkipForward aria-hidden="true" /> Пропустить (−1)
          </button>
        </div>
      </form>
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </div>
  );
}

function GuessPanel({ view, send, players }: { view: View; send: Send; players: Players }) {
  const [text, setText] = useState("");
  const action = useAction();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim() || view.cardSeq === null) return;
    const cardSeq = view.cardSeq;
    void action.run(() => send({ type: "guess", text, cardSeq })).then((ok) => ok && setText(""));
  };
  return (
    <form className="rr-alias-card rr-alias-guess" onSubmit={submit}>
      <label htmlFor="rr-alias-guess">Ваш ответ</label>
      <div className="rr-alias-input-row">
        <input id="rr-alias-guess" value={text} maxLength={LIMITS.guessChars} autoComplete="off" onChange={(event) => setText(event.target.value)} />
        <button type="submit" className="rr-alias-btn rr-alias-btn--accent" disabled={action.busy || !text.trim()}>
          <Send aria-hidden="true" /> Ответить
        </button>
      </div>
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
      <TeamGuesses view={view} players={players} />
    </form>
  );
}

function TeamGuesses({ view, players }: { view: View; players: Players }) {
  if (view.guesses.length === 0) return <p className="rr-alias-muted">Ответов команды пока нет.</p>;
  return (
    <ol className="rr-alias-guesses" aria-label="Ответы вашей команды">
      {view.guesses.slice(-12).map((guess) => (
        <li key={guess.seq} className={guess.correct ? "is-correct" : ""}>
          <b>{nameOf(players, guess.authorId)}:</b> {guess.text}
          {guess.correct ? <span className="rr-alias-tag">верно</span> : null}
        </li>
      ))}
    </ol>
  );
}

function Box({ card, players }: { card: RevealedCard; players: Players }) {
  return (
    <li className={`rr-alias-box rr-alias-box--${card.outcome}`}>
      <span>{card.term}</span>
      {card.guessedBy ? <small>{nameOf(players, card.guessedBy)}</small> : null}
    </li>
  );
}

function Stage({ view, send, players }: { view: View; send: Send; players: Players }) {
  const departure = useDeparture(view);
  const guessed = view.revealed.filter((card) => card.outcome === "guessed");
  return (
    <div className="rr-alias-stage">
      <Conveyor moving={view.phase === "explaining"}>
        {departure ? <span key={departure.seq} className={`rr-alias-crate rr-alias-crate--leaving rr-alias-crate--to-${departure.to}`} aria-hidden="true" /> : null}
        {view.cardSeq !== null ? (
          <span key={view.cardSeq} className="rr-alias-crate" aria-label={view.myRole === "explainer" ? "Ваша карточка" : "Закрытая коробка со словом"}>
            {view.myRole === "explainer" ? "★" : "?"}
          </span>
        ) : null}
      </Conveyor>
      {guessed.length > 0 ? (
        <div className="rr-alias-delivered" aria-live="polite">
          <p className="rr-alias-kicker">Угадано в этом ходу</p>
          <ul className="rr-alias-boxes">
            {guessed.map((card) => (
              <Box key={card.seq} card={card} players={players} />
            ))}
          </ul>
        </div>
      ) : null}
      {view.myRole === "explainer" ? <ExplainerPanel key={view.turnNumber ?? 0} view={view} send={send} /> : null}
      {view.myRole === "guesser" ? <GuessPanel key={view.turnNumber ?? 0} view={view} send={send} players={players} /> : null}
      {view.myRole === "explainer" ? (
        <section className="rr-alias-card" aria-label="Ответы команды">
          <h3>Ответы команды</h3>
          <TeamGuesses view={view} players={players} />
        </section>
      ) : null}
      <Clouds view={view} />
    </div>
  );
}

function TurnResult({ view, players }: { view: View; players: Players }) {
  const turn = view.lastTurn;
  if (!turn) return null;
  const team = teamOf(view, turn.team);
  const lane = (outcome: RevealedCard["outcome"]) => turn.cards.filter((card) => card.outcome === outcome);
  const reason = turn.endedBy === "deck" ? "Колода закончилась." : turn.endedBy === "explainerLeft" ? "Объясняющий покинул партию." : turn.endedBy === "noExplainer" ? "В команде нет активных игроков." : "Время вышло.";
  return (
    <section className="rr-alias-card rr-alias-turn-result" aria-label="Итог хода">
      <h3>
        {team ? <TeamBadge team={team} /> : null} {turn.scoreDelta >= 0 ? `+${turn.scoreDelta}` : turn.scoreDelta}
      </h3>
      <p className="rr-alias-muted">
        Ход {turn.number}, объяснял {nameOf(players, turn.explainerId)}. {reason}
      </p>
      <div className="rr-alias-lanes">
        <div>
          <p className="rr-alias-kicker">В вагон команды</p>
          <ul className="rr-alias-boxes">{lane("guessed").map((card) => <Box key={card.seq} card={card} players={players} />)}</ul>
        </div>
        <div>
          <p className="rr-alias-kicker">Боковая ветка (пропуск, −1)</p>
          <ul className="rr-alias-boxes">{lane("skipped").map((card) => <Box key={card.seq} card={card} players={players} />)}</ul>
        </div>
        <div>
          <p className="rr-alias-kicker">Не успели (без штрафа)</p>
          <ul className="rr-alias-boxes">{lane("expired").map((card) => <Box key={card.seq} card={card} players={players} />)}</ul>
        </div>
      </div>
    </section>
  );
}

function HistoryList({ title, cards }: { title: string; cards: HistoryCard[] }) {
  if (cards.length === 0) return null;
  return (
    <div>
      <p className="rr-alias-kicker">{title}</p>
      <dl className="rr-alias-defs">
        {cards.map((card, index) => (
          <div key={`${card.term}-${index}`}>
            <dt>{card.term}</dt>
            <dd>{card.definition}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Final({ view, players, currentUserId }: { view: View; players: Players; currentUserId: string }) {
  const outcome = view.outcome;
  if (!outcome) return null;
  const winners = outcome.winnerTeams.map((index) => view.teams[index]?.name ?? "").join(", ");
  const iWon = outcome.winnerIds.includes(currentUserId);
  return (
    <div className="rr-alias-final">
      <div className="rr-alias-card rr-alias-verdict" role="status">
        <Trophy aria-hidden="true" />
        <div>
          <h3>{outcome.winnerTeams.length > 1 ? `Совместная победа: ${winners}` : `Победила команда «${winners}»`}</h3>
          <p>{iWon ? "Ваша команда среди победителей!" : "Спасибо за смену на фабрике!"} Каждый участник получает счёт своей команды.</p>
        </div>
      </div>
      {(view.history ?? []).map((entry) => {
        const team = view.teams[entry.team];
        return (
          <section key={entry.team} className="rr-alias-card" aria-label={`Карточки команды ${team?.name ?? ""}`}>
            <h3>{team ? <TeamBadge team={team} /> : null}</h3>
            <HistoryList title="Принятые термины" cards={entry.accepted} />
            <HistoryList title="Пропуски" cards={entry.skipped} />
            <HistoryList title="Не успели" cards={entry.expired} />
            {entry.accepted.length + entry.skipped.length + entry.expired.length === 0 ? <p className="rr-alias-muted">Карточек не было.</p> : null}
          </section>
        );
      })}
      <p className="rr-alias-muted">Участники: {view.participants.map((p) => p.username).join(", ")}.</p>
    </div>
  );
}

function FinalActions({ view, send, currentUserId, onExit }: { view: View; send: Send; currentUserId: string; onExit: () => void }) {
  const action = useAction();
  const isHost = view.hostId === currentUserId;
  return (
    <div className="rr-alias-card rr-alias-controls">
      {isHost ? (
        <button type="button" className="rr-alias-btn rr-alias-btn--accent" disabled={action.busy} onClick={() => void action.run(() => send({ type: "rematch" }))}>
          <RotateCcw aria-hidden="true" /> Реванш теми же командами
        </button>
      ) : (
        <p className="rr-alias-muted">Реванш запускает ведущий — {view.participants.find((p) => p.isHost)?.username ?? "ведущий"}.</p>
      )}
      <button type="button" className="rr-alias-btn rr-alias-btn--ghost" onClick={onExit}>
        <LogOut aria-hidden="true" /> В каталог
      </button>
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </div>
  );
}

function PhaseBody({ view, send, players, currentUserId }: { view: View; send: Send; players: Players; currentUserId: string }) {
  switch (view.phase) {
    case "prepare": {
      const team = teamOf(view, view.activeTeam);
      return (
        <div className="rr-alias-card rr-alias-prepare" aria-live="polite">
          <p className="rr-alias-kicker">Круг {view.round}</p>
          <h3>{team ? <TeamBadge team={team} size={40} /> : null}</h3>
          <p>
            Объясняет <b>{nameOf(players, view.explainerId)}</b>
            {view.explainerId === currentUserId ? " — это вы! Через несколько секунд в окошке появится термин." : "."}
          </p>
        </div>
      );
    }
    case "explaining":
      return <Stage view={view} send={send} players={players} />;
    case "turnResult":
      return (
        <>
          <TurnResult view={view} players={players} />
          <Clouds view={view} />
        </>
      );
    case "finished":
      return <Final view={view} players={players} currentUserId={currentUserId} />;
    case "cancelled":
      return (
        <div className="rr-alias-card rr-alias-warning" role="status">
          <h3>Партия отменена</h3>
          <p>{view.cancelReason ?? "Партия завершилась без победителя."}</p>
        </div>
      );
    default:
      return null;
  }
}

export function Game({ view, currentUserId, send, connection, serverNowMs, onExit }: GameProps) {
  const hidden = useHiddenTab();
  const sound = useSound();
  const players = useMemo<Players>(() => new Map(view.participants.map((p) => [p.id, p])), [view.participants]);
  const { play } = sound;
  const guessedCount = view.revealed.filter((card) => card.outcome === "guessed").length;

  useEffect(() => {
    if (view.phase === "explaining" && view.myRole === "explainer") play("turn");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase, view.turnNumber]);
  useEffect(() => {
    if (guessedCount > 0) play("correct");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guessedCount]);

  const step = nextStep(view, players);
  const turnLabel = view.turnNumber !== null && view.phase !== "finished" ? ` · ход ${view.turnNumber} из ${view.totalTurns}` : "";

  return (
    <section className={`rr-game-alias rr-alias-game rr-alias-phase-${view.phase}${hidden ? " is-paused" : ""}`} aria-labelledby="rr-alias-phase-title">
      <FactoryBackdrop />
      <header className="rr-alias-top">
        <div>
          <p className="rr-alias-kicker">
            Alias{view.round !== null && view.phase !== "finished" ? ` · круг ${view.round} из ${view.settings.rounds}` : ""}
            {turnLabel}
          </p>
          <h2 id="rr-alias-phase-title" aria-live="polite">
            {PHASE_LABEL[view.phase]}
          </h2>
        </div>
        <div className="rr-alias-top-actions">
          <Gauge deadline={view.deadline} serverNowMs={serverNowMs} totalMs={PHASE_TOTAL[view.phase] ?? 0} label={PHASE_LABEL[view.phase]} size={view.phase === "explaining" ? "large" : "small"} />
          <SoundToggle enabled={sound.enabled} toggle={sound.toggle} />
          <ConnectionDot connection={connection} />
          <button type="button" className="rr-alias-icon-btn" onClick={onExit} aria-label="Выйти в каталог">
            <LogOut aria-hidden="true" />
            <span className="rr-alias-icon-label">Выйти</span>
          </button>
        </div>
      </header>
      <ConnectionBanner connection={connection} />
      {step ? (
        <p className={`rr-alias-step${view.myRole === "explainer" || view.myRole === "guesser" ? " is-turn" : ""}`} aria-live="polite">
          {step}
        </p>
      ) : null}
      {!view.isParticipant ? <p className="rr-alias-muted">Вы наблюдаете: термины видны только объясняющему, ответы — только его команде.</p> : null}
      <Wagons view={view} players={players} />
      <div className="rr-alias-stack">
        <PhaseBody view={view} send={send} players={players} currentUserId={currentUserId} />
        {view.phase === "finished" || view.phase === "cancelled" ? <FinalActions view={view} send={send} currentUserId={currentUserId} onExit={onExit} /> : null}
      </div>
    </section>
  );
}
