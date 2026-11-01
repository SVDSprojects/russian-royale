import { useEffect, useRef, useState } from 'react';
import { Brain, RotateCcw, Trophy } from 'lucide-react';
import { api } from '../api';
import { ErrorNotice, message, PageHeader } from './common';
import type { Rule } from './models';
type Card = { id: string; pair: string; text: string; kind: string };
function shuffled<T>(items: T[]) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
export function MemoryGame() {
  const [cards, setCards] = useState<Card[]>([]),
    [open, setOpen] = useState<string[]>([]),
    [matched, setMatched] = useState<string[]>([]),
    [turns, setTurns] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [feedback, setFeedback] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    locked = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function start() {
    clearTimeout(timer.current);
    locked.current = true;
    setBusy(true);
    setError('');
    try {
      const rules = shuffled((await api<Rule[]>('/rules')).filter((r) => r.examples.length)).slice(0, 6);
      if (!rules.length) throw Error('Для игры нужны опубликованные правила с примерами.');
      setCards(
        shuffled(
          rules.flatMap((r) => [
            { id: r.id + '-rule', pair: r.id, text: r.title, kind: 'ПРАВИЛО' },
            { id: r.id + '-example', pair: r.id, text: r.examples[0], kind: 'ПРИМЕР' },
          ]),
        ),
      );
      setOpen([]);
      setMatched([]);
      setTurns(0);
      setFeedback('Открой две карточки: найди правило и его пример.');
    } catch (e) {
      setError(message(e));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  function flip(card: Card) {
    if (locked.current || matched.includes(card.pair) || open.includes(card.id)) return;
    const next = [...open, card.id];
    setOpen(next);
    if (next.length === 2) {
      locked.current = true;
      setTurns((v) => v + 1);
      const first = cards.find((c) => c.id === next[0])!;
      if (first.pair === card.pair) {
        setMatched((m) => [...m, card.pair]);
        setFeedback('Пара найдена! ' + cards.find((c) => c.pair === card.pair && c.kind === 'ПРАВИЛО')!.text);
        setOpen([]);
        locked.current = false;
      } else {
        setFeedback('Эти карточки из разных пар. Запоминай расположение.');
        timer.current = setTimeout(() => {
          setOpen([]);
          locked.current = false;
        }, 1200);
      }
    }
  }
  const done = cards.length > 0 && matched.length === cards.length / 2;
  return (
    <>
      <PageHeader
        eyebrow="МЕМОРИ • НАЙДИ СВЯЗЬ"
        title="Пары правил"
        description="На одной карточке — правило, на другой — его пример. Запоминай поле и собери все пары."
      />
      <ErrorNotice text={error} />
      <section className="memory-stage">
        <div className="arcade-hud">
          <span>
            <Brain /> {matched.length} / {cards.length / 2 || 6} пар
          </span>
          <span>{turns} ходов</span>
          <button className="rr-button secondary" onClick={start} disabled={busy}>
            <RotateCcw size={17} />
            {cards.length ? 'Новое поле' : 'Раздать карточки'}
          </button>
        </div>
        {!cards.length && (
          <div className="memory-intro">
            <Brain size={80} />
            <h2>Не только знать. Узнавать.</h2>
            <p>Открывай по две карты. Сначала запомни примеры, затем найди соответствующие правила.</p>
          </div>
        )}
        <p role="status" className="memory-status">
          {done ? 'Все пары собраны!' : feedback}
        </p>
        <div className="memory-grid">
          {cards.map((c, i) => {
            const visible = open.includes(c.id) || matched.includes(c.pair);
            return (
              <button
                key={c.id}
                className={`memory-card ${visible ? 'revealed' : ''} ${matched.includes(c.pair) ? 'matched' : ''}`}
                aria-label={visible ? `${c.kind}: ${c.text}` : `Закрытая карточка ${i + 1}`}
                aria-pressed={visible}
                disabled={matched.includes(c.pair)}
                onClick={() => flip(c)}
              >
                {visible ? (
                  <>
                    <small>{c.kind}</small>
                    <strong>{c.text}</strong>
                  </>
                ) : (
                  <>
                    <span>?</span>
                    <small>РУССКИЙ ROYALE</small>
                  </>
                )}
              </button>
            );
          })}
        </div>
        {done && (
          <div className="arcade-feedback yes">
            <Trophy size={38} />
            <h2>Поле раскрыто за {turns} ходов</h2>
            <p>Новый раунд перемешает пары и выберет другие темы.</p>
          </div>
        )}
        <p className="memory-note">
          Тренировка памяти. Результат этого поля не начисляет XP и не меняет рейтинг.
        </p>
      </section>
    </>
  );
}
