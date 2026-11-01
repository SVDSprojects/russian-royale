// Экран партии «Самозванца»: раздача, два круга примеров, обсуждение, голосование, раскрытие и итоги.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { LogOut, RotateCcw, Send, Trophy, Vote } from "lucide-react";
import { LIMITS, TIMINGS, type ExampleEntry, type View, type ViewParticipant } from "../../../shared/games/impostor/types";
import type { GameProps } from "./props";
import {
  ConnectionBanner,
  ConnectionDot,
  Countdown,
  ErrorNote,
  Lens,
  PHASE_LABEL,
  Planets,
  PlayerChip,
  Satellite,
  SoundToggle,
  Starfield,
  useAction,
  useHiddenTab,
  useSound,
} from "./ui";

type Send = GameProps["send"];

const PHASE_TOTAL: Partial<Record<View["phase"], number>> = {
  deal: TIMINGS.dealMs,
  examples: TIMINGS.exampleMs,
  discussion: TIMINGS.discussionMs,
  voting: TIMINGS.votingMs,
  reveal: TIMINGS.revealMs,
};

function nameOf(players: Map<string, ViewParticipant>, id: string | null | undefined): string {
  if (!id) return "—";
  return players.get(id)?.username ?? "Игрок";
}

function nextStep(view: View, currentUserId: string, players: Map<string, ViewParticipant>): string {
  switch (view.phase) {
    case "deal":
      return "Посмотрите в линзу и запомните свою тему. Похожа ли она на темы других — узнаете по примерам.";
    case "examples":
      return view.currentTurnId === currentUserId
        ? "Ваш ход: отправьте один пример к своей теме, не называя её."
        : `Ходит ${nameOf(players, view.currentTurnId)}. Следите за примерами и ищите несовпадения.`;
    case "discussion":
      return "Обсудите примеры: чьи из них не ложатся на общую тему? Затем будет второй круг.";
    case "voting":
      return view.myVote ? "Голос принят. Ждём остальных." : "Выберите игрока, чья тема, по-вашему, отличается. Голос нельзя изменить.";
    case "reveal":
      return "Орбиты расходятся: смотрите, чем отличались темы.";
    case "finished":
      return view.hostId === currentUserId ? "Можно начать реванш с новыми темами." : "Ведущий может запустить реванш.";
    default:
      return "";
  }
}

function ExampleBelt({ examples, players, compact }: { examples: ExampleEntry[]; players: Map<string, ViewParticipant>; compact?: boolean }) {
  const rounds = [1, 2].map((round) => ({ round, items: examples.filter((e) => e.round === round) })).filter((r) => r.items.length > 0);
  if (rounds.length === 0) return <p className="rr-impostor-muted rr-impostor-belt-empty">Примеров пока нет — первый вот-вот появится на орбите.</p>;
  return (
    <div className={`rr-impostor-belt${compact ? " is-compact" : ""}`}>
      {rounds.map(({ round, items }) => (
        <section key={round} aria-label={`Круг ${round}`}>
          <h4 className="rr-impostor-kicker">Круг {round}</h4>
          <ol className="rr-impostor-cards">
            {items.map((entry) => (
              <li key={entry.seq} className={`rr-impostor-paper-card${entry.skipped ? " is-skipped" : ""}`}>
                <span className="rr-impostor-paper-author">{nameOf(players, entry.authorId)}</span>
                <span className="rr-impostor-paper-text">{entry.text}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function ExampleForm({ send }: { send: Send }) {
  const [text, setText] = useState("");
  const action = useAction();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    void action.run(() => send({ type: "example", text })).then((ok) => ok && setText(""));
  };
  return (
    <form className="rr-impostor-card rr-impostor-form is-turn" onSubmit={submit}>
      <label htmlFor="rr-impostor-example">Ваш пример</label>
      <div className="rr-impostor-input-row">
        <input
          id="rr-impostor-example"
          ref={input}
          value={text}
          maxLength={LIMITS.exampleChars}
          autoComplete="off"
          onChange={(event) => setText(event.target.value)}
          aria-describedby="rr-impostor-example-hint"
        />
        <button type="submit" className="rr-impostor-btn rr-impostor-btn--accent" disabled={action.busy || !text.trim()}>
          <Send aria-hidden="true" /> Отправить
        </button>
      </div>
      <p id="rr-impostor-example-hint" className="rr-impostor-muted">
        {text.length}/{LIMITS.exampleChars}. Слова из названия своей темы отклоняются — ход при этом не теряется.
      </p>
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </form>
  );
}

function Chat({ view, send, players, currentUserId }: { view: View; send: Send; players: Map<string, ViewParticipant>; currentUserId: string }) {
  const [text, setText] = useState("");
  const action = useAction();
  const log = useRef<HTMLOListElement>(null);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight });
  }, [view.chat.length]);
  if (!view.settings.chat) return <p className="rr-impostor-muted">Чат отключён ведущим — обсуждайте голосом.</p>;
  const canWrite = view.isParticipant && (view.phase === "discussion" || view.phase === "voting");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    void action.run(() => send({ type: "chat", text })).then((ok) => ok && setText(""));
  };
  return (
    <section className="rr-impostor-card rr-impostor-chat" aria-label="Чат обсуждения">
      <ol ref={log} role="log" aria-live="polite">
        {view.chat.map((message) => (
          <li key={message.seq} className={message.authorId === currentUserId ? "is-me" : ""}>
            <b>{nameOf(players, message.authorId)}:</b> {message.text}
          </li>
        ))}
        {view.chat.length === 0 ? <li className="rr-impostor-muted">Сообщений пока нет.</li> : null}
      </ol>
      {canWrite ? (
        <form onSubmit={submit} className="rr-impostor-input-row">
          <label htmlFor="rr-impostor-chat" className="rr-impostor-sr">
            Сообщение
          </label>
          <input id="rr-impostor-chat" value={text} maxLength={LIMITS.chatChars} autoComplete="off" onChange={(event) => setText(event.target.value)} placeholder="Ваше мнение…" />
          <button type="submit" className="rr-impostor-btn" disabled={action.busy || !text.trim()}>
            <Send aria-hidden="true" /> <span className="rr-impostor-icon-label">Написать</span>
          </button>
        </form>
      ) : null}
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </section>
  );
}

function VotePanel({ view, send, players, currentUserId }: { view: View; send: Send; players: Map<string, ViewParticipant>; currentUserId: string }) {
  const [choice, setChoice] = useState<string | null>(null);
  const action = useAction();
  const candidates = view.participants.filter((p) => p.id !== currentUserId);
  const active = view.participants.filter((p) => !p.left).length;
  return (
    <section className="rr-impostor-card rr-impostor-vote" aria-labelledby="rr-impostor-vote-title">
      <h3 id="rr-impostor-vote-title">
        <Vote aria-hidden="true" /> Чья тема отличается?
      </h3>
      <p className="rr-impostor-muted">
        Проголосовали {view.votedIds.length} из {active}. Для обвинения нужно не меньше {view.majorityNeeded} голосов из {view.participants.length}.
      </p>
      {view.myVote ? (
        <p className="rr-impostor-voted">
          Ваш голос: <b>{nameOf(players, view.myVote)}</b>. Голос не меняется.
        </p>
      ) : view.isParticipant ? (
        <>
          <ul className="rr-impostor-vote-grid">
            {candidates.map((player) => (
              <li key={player.id}>
                <button type="button" className={`rr-impostor-vote-btn${choice === player.id ? " is-chosen" : ""}`} aria-pressed={choice === player.id} onClick={() => setChoice(player.id)}>
                  <Satellite player={player} active={choice === player.id} me={false} size={40} />
                  <span>{player.username}</span>
                  {view.votedIds.includes(player.id) ? <span className="rr-impostor-tag">проголосовал</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="rr-impostor-btn rr-impostor-btn--accent"
            disabled={!choice || action.busy}
            onClick={() => choice && void action.run(() => send({ type: "vote", targetId: choice }))}
          >
            {choice ? `Подтвердить голос: ${nameOf(players, choice)}` : "Сначала выберите игрока"}
          </button>
        </>
      ) : null}
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </section>
  );
}

function RevealPanel({ view, players, currentUserId }: { view: View; players: Map<string, ViewParticipant>; currentUserId: string }) {
  const reveal = view.reveal;
  if (!reveal) return null;
  const caught = reveal.winner === "majority";
  const myScore = reveal.scores.find((s) => s.userId === currentUserId)?.score;
  const maxVotes = Math.max(1, ...reveal.tally.map((t) => t.count));
  return (
    <div className="rr-impostor-reveal">
      <Planets diverged labelA={reveal.majorityTopic.title} labelB={reveal.impostorTopic.title} />
      <div className={`rr-impostor-card rr-impostor-verdict${caught ? " is-caught" : " is-escaped"}`} role="status">
        <Trophy aria-hidden="true" />
        <div>
          <h3>{caught ? "Большинство нашло отличие!" : "Отличившийся остался незамеченным"}</h3>
          <p>
            Другая тема была у игрока <b>{nameOf(players, reveal.impostorId)}</b>.{" "}
            {reveal.accusedId ? `Большинство указало на игрока ${nameOf(players, reveal.accusedId)}.` : "Большинства голосов не набралось."}
            {myScore !== undefined ? ` Ваши очки: ${myScore}.` : ""}
          </p>
        </div>
      </div>
      <div className="rr-impostor-card rr-impostor-difference">
        <p className="rr-impostor-kicker">{reveal.pairTitle}</p>
        <h3>В чём разница</h3>
        <p>{reveal.difference}</p>
      </div>
      <div className="rr-impostor-topics">
        {[
          { label: "Тема большинства", topic: reveal.majorityTopic, tone: "a" },
          { label: "Отличающаяся тема", topic: reveal.impostorTopic, tone: "b" },
        ].map(({ label, topic, tone }) => (
          <article key={tone} className={`rr-impostor-card rr-impostor-topic rr-impostor-topic--${tone}`}>
            <p className="rr-impostor-kicker">{label}</p>
            <h4>{topic.title}</h4>
            <p>{topic.description}</p>
            <p className="rr-impostor-muted">Примеры из каталога:</p>
            <ul className="rr-impostor-chips">
              {topic.examples.map((example) => (
                <li key={example}>{example}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <div className="rr-impostor-card">
        <h3>Голосование</h3>
        <ul className="rr-impostor-tally">
          {reveal.tally.map((entry) => (
            <li key={entry.targetId}>
              <span>{nameOf(players, entry.targetId)}</span>
              <span className="rr-impostor-bar" style={{ width: `${(entry.count / maxVotes) * 100}%` }} aria-hidden="true" />
              <b>{entry.count}</b>
            </li>
          ))}
          {reveal.tally.length === 0 ? <li className="rr-impostor-muted">Никто не проголосовал.</li> : null}
        </ul>
        <ul className="rr-impostor-votes">
          {Object.entries(reveal.votes).map(([voter, target]) => (
            <li key={voter}>
              {nameOf(players, voter)} → {nameOf(players, target)}
            </li>
          ))}
        </ul>
      </div>
      <div className="rr-impostor-card">
        <h3>Очки</h3>
        <ol className="rr-impostor-scores">
          {[...reveal.scores]
            .sort((x, y) => y.score - x.score)
            .map((score) => (
              <li key={score.userId}>
                <span>{nameOf(players, score.userId)}</span>
                <b>{score.score}</b>
              </li>
            ))}
        </ol>
      </div>
    </div>
  );
}

function FinalActions({ view, send, currentUserId, onExit }: { view: View; send: Send; currentUserId: string; onExit: () => void }) {
  const action = useAction();
  const isHost = view.hostId === currentUserId;
  return (
    <div className="rr-impostor-card rr-impostor-final-actions">
      {isHost ? (
        <button type="button" className="rr-impostor-btn rr-impostor-btn--accent" disabled={action.busy} onClick={() => void action.run(() => send({ type: "rematch" }))}>
          <RotateCcw aria-hidden="true" /> Реванш с новыми темами
        </button>
      ) : (
        <p className="rr-impostor-muted">Реванш запускает ведущий — {view.participants.find((p) => p.isHost)?.username ?? "ведущий"}.</p>
      )}
      <button type="button" className="rr-impostor-btn rr-impostor-btn--ghost" onClick={onExit}>
        <LogOut aria-hidden="true" /> В каталог
      </button>
      <ErrorNote message={action.error} onClose={() => action.setError(null)} />
    </div>
  );
}

function PhaseBody({ view, send, players, currentUserId }: { view: View; send: Send; players: Map<string, ViewParticipant>; currentUserId: string }) {
  switch (view.phase) {
    case "deal":
      return <Planets diverged={false} />;
    case "examples": {
      const myTurn = view.currentTurnId === currentUserId;
      const current = view.currentTurnId ? players.get(view.currentTurnId) : undefined;
      return (
        <>
          <div className="rr-impostor-turn" aria-live="polite">
            {current ? <Satellite player={current} active me={myTurn} size={56} /> : null}
            <div>
              <p className="rr-impostor-kicker">Круг {view.round}</p>
              <h3>{myTurn ? "Ваш ход" : `Ходит ${current?.username ?? "…"}`}</h3>
            </div>
          </div>
          {myTurn ? <ExampleForm key={`${view.round}-${view.examples.length}`} send={send} /> : null}
          <ExampleBelt key="belt" examples={view.examples} players={players} />
        </>
      );
    }
    case "discussion":
      return (
        <>
          <ExampleBelt key="belt" examples={view.examples} players={players} />
          <Chat key="chat" view={view} send={send} players={players} currentUserId={currentUserId} />
        </>
      );
    case "voting":
      return (
        <>
          <VotePanel view={view} send={send} players={players} currentUserId={currentUserId} />
          <ExampleBelt key="belt" examples={view.examples} players={players} compact />
          <Chat key="chat" view={view} send={send} players={players} currentUserId={currentUserId} />
        </>
      );
    case "reveal":
    case "finished":
      return (
        <>
          <RevealPanel view={view} players={players} currentUserId={currentUserId} />
          <ExampleBelt key="belt" examples={view.examples} players={players} compact />
        </>
      );
    case "cancelled":
      return (
        <div className="rr-impostor-card rr-impostor-warning" role="status">
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
  const [lensOpen, setLensOpen] = useState(true);
  const players = useMemo(() => new Map(view.participants.map((p) => [p.id, p])), [view.participants]);
  const myTurn = view.phase === "examples" && view.currentTurnId === currentUserId;
  const { play } = sound;

  useEffect(() => {
    if (myTurn) play("turn");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn, view.round]);
  useEffect(() => {
    if (view.phase === "reveal") play("reveal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase]);

  const roundLabel = view.phase === "examples" && view.round ? ` ${view.round} из 2` : "";
  const total = PHASE_TOTAL[view.phase] ?? 0;
  const step = nextStep(view, currentUserId, players);

  return (
    <section className={`rr-game-impostor rr-impostor-game rr-impostor-phase-${view.phase}${hidden ? " is-paused" : ""}`} aria-labelledby="rr-impostor-phase-title">
      <Starfield />
      <header className="rr-impostor-top">
        <div>
          <p className="rr-impostor-kicker">Самозванец</p>
          <h2 id="rr-impostor-phase-title" aria-live="polite">
            {PHASE_LABEL[view.phase]}
            {roundLabel}
          </h2>
        </div>
        <div className="rr-impostor-top-actions">
          <Countdown deadline={view.deadline} serverNowMs={serverNowMs} totalMs={total} label={PHASE_LABEL[view.phase]} />
          <SoundToggle enabled={sound.enabled} toggle={sound.toggle} />
          <ConnectionDot connection={connection} />
          <button type="button" className="rr-impostor-icon-btn" onClick={onExit} aria-label="Выйти в каталог">
            <LogOut aria-hidden="true" />
            <span className="rr-impostor-icon-label">Выйти</span>
          </button>
        </div>
      </header>
      <ConnectionBanner connection={connection} />
      {step ? (
        <p className={`rr-impostor-step${myTurn ? " is-turn" : ""}`} aria-live="polite">
          {step}
        </p>
      ) : null}
      {!view.isParticipant ? <p className="rr-impostor-muted">Вы наблюдаете за партией: темы и голоса видны только участникам.</p> : null}

      <div className="rr-impostor-layout">
        <aside className="rr-impostor-side">
          {view.myTopic ? <Lens title={view.myTopic.title} description={view.myTopic.description} open={lensOpen} onToggle={() => setLensOpen((v) => !v)} /> : null}
          <div className="rr-impostor-card">
            <h3>Спутники</h3>
            <ul className="rr-impostor-players">
              {view.participants.map((player) => (
                <PlayerChip key={player.id} player={player} active={view.currentTurnId === player.id} me={player.id === currentUserId}>
                  {view.phase === "voting" && view.votedIds.includes(player.id) ? <span className="rr-impostor-ready is-ready">голос</span> : null}
                </PlayerChip>
              ))}
            </ul>
          </div>
        </aside>
        <div className="rr-impostor-stack">
          <PhaseBody view={view} send={send} players={players} currentUserId={currentUserId} />
          {view.phase === "finished" || view.phase === "cancelled" ? <FinalActions view={view} send={send} currentUserId={currentUserId} onExit={onExit} /> : null}
        </div>
      </div>
    </section>
  );
}
