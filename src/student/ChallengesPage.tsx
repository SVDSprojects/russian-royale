import { useEffect, useRef, useState } from 'react';
import { Check, ArrowRight, RotateCcw, Volume2, VolumeX, Flame, Scale, PenLine, Music2 } from 'lucide-react';
import { api, useAuth } from '../api';
import { ErrorNotice, Loading, PageHeader, go, json, message, useResource } from './common';
export const challenges = [
  {
    id: 'editor',
    title: 'Редактор катастроф',
    tag: 'ИСТОРИИ С ХАРАКТЕРОМ',
    description: 'Спаси вывески кафе, космопочту и музей от языковых катастроф.',
    icon: PenLine,
  },
  {
    id: 'stress',
    title: 'Ударный ритм',
    tag: 'ПОПАДИ В УДАРЕНИЕ',
    description: 'Выбирай ударный слог, собирай комбо и включай свой ритм.',
    icon: Music2,
  },
  {
    id: 'punctuation',
    title: 'Суд над запятой',
    tag: 'ДОКАЖИ СВОЙ ВЕРДИКТ',
    description: 'Реши судьбу запятой и объясни, почему она нужна или не нужна.',
    icon: Scale,
  },
];
type Question = { id: string; scene: string; text: string; options: string[]; reasons?: string[] };
type Result = { correct: boolean; answer: number; reason?: number; explanation: string; xpAwarded: number };
export function ChallengeCards() {
  return (
    <div className="sdvs-challenge-grid">
      {challenges.map((c) => (
        <a href={'#challenge/' + c.id} className={'sdvs-challenge-card challenge-' + c.id} key={c.id}>
          <div className="sdvs-challenge-symbol">
            <c.icon size={47} strokeWidth={1.4} />
            <span>✦</span>
          </div>
          <small>{c.tag}</small>
          <h3>{c.title}</h3>
          <p>{c.description}</p>
          <strong>
            Играть <ArrowRight size={16} />
          </strong>
        </a>
      ))}
    </div>
  );
}
export function ChallengesPage({ mode }: { mode: string }) {
  const config = challenges.find((c) => c.id === mode),
    auth = useAuth();
  const resource = useResource<{ questions: Question[]; solved: string[] }>(
    '/challenges/' + encodeURIComponent(mode),
  );
  const [index, setIndex] = useState(0),
    [choice, setChoice] = useState<number | null>(null),
    [result, setResult] = useState<Result | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [score, setScore] = useState(0),
    [combo, setCombo] = useState(0),
    [best, setBest] = useState(0),
    [xp, setXp] = useState(0),
    [sound, setSound] = useState(false);
  const lock = useRef(false),
    audio = useRef<AudioContext | null>(null),
    announced = useRef<HTMLDivElement>(null);
  const questions = resource.data?.questions || [],
    q = questions[index];
  useEffect(
    () => () => {
      void audio.current?.close();
    },
    [],
  );
  useEffect(() => {
    if (result) announced.current?.focus();
  }, [result]);
  function tone(correct: boolean) {
    if (!sound) return;
    try {
      const ac = (audio.current ||= new AudioContext());
      void ac.resume();
      [0, 0.12, 0.24].slice(0, correct ? 3 : 1).forEach((delay, i) => {
        const o = ac.createOscillator(),
          g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = correct ? [330, 440, 660][i] : 160;
        g.gain.setValueAtTime(0.055, ac.currentTime + delay);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + 0.15);
        o.connect(g);
        g.connect(ac.destination);
        o.start(ac.currentTime + delay);
        o.stop(ac.currentTime + delay + 0.16);
      });
    } catch {}
  }
  async function answer(option: number, reason?: number) {
    if (lock.current || result) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const r = await api<Result>(
        '/challenges/' + mode + '/' + q.id + '/answer',
        json('POST', { answer: option, ...(reason === undefined ? {} : { reason }) }),
      );
      setResult(r);
      setChoice(option);
      tone(r.correct);
      setScore((s) => s + Number(r.correct));
      const next = r.correct ? combo + 1 : 0;
      setCombo(next);
      setBest((b) => Math.max(b, next));
      setXp((x) => x + r.xpAwarded);
      await auth.refresh();
    } catch (e) {
      setError(message(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (!config) return <ErrorNotice text="Игра не найдена." />;
  if (resource.loading) return <Loading />;
  return (
    <div className={'sdvs-challenge-page challenge-' + mode}>
      <PageHeader
        eyebrow={config.tag}
        title={config.title}
        description={config.description}
        back="games"
        action={
          mode === 'stress' ? (
            <button
              className="rr-button secondary"
              aria-pressed={sound}
              onClick={() => {
                setSound(!sound);
                if (!sound) {
                  try {
                    audio.current ||= new AudioContext();
                    void audio.current.resume();
                  } catch {}
                }
              }}
            >
              {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}Звук {sound ? 'вкл.' : 'выкл.'}
            </button>
          ) : undefined
        }
      />
      <ErrorNotice text={error || resource.error} />
      {index < questions.length && q ? (
        <>
          <div className="sdvs-challenge-status">
            <span>
              {index + 1} / {questions.length}
            </span>
            <span>
              <Flame size={17} /> Комбо {combo}
            </span>
            <span>+{xp} XP</span>
          </div>
          <progress className="sdvs-challenge-progress" max={questions.length} value={index} />
          <section className="sdvs-challenge-stage">
            <div className="sdvs-stage-decoration" aria-hidden="true">
              <config.icon size={70} />
              <span>✦</span>
              <span>✧</span>
            </div>
            <p className="sdvs-eyebrow">{q.scene}</p>
            <h2>{q.text}</h2>
            {mode === 'stress' && (
              <p>Нажми на ударный слог. Деление на кнопки служит только для выбора гласной.</p>
            )}
            <div className={mode === 'stress' ? 'sdvs-syllables' : 'sdvs-answer-options'}>
              {q.options.map((text, i) => (
                <button
                  key={i}
                  className={`${result?.answer === i ? 'correct' : ''} ${choice === i ? (result && !result.correct ? 'wrong' : 'selected') : ''}`}
                  disabled={busy || !!result}
                  aria-pressed={choice === i}
                  onClick={() => (q.reasons ? setChoice(i) : void answer(i))}
                >
                  <span>{mode === 'stress' ? '' : String.fromCharCode(65 + i)}</span>
                  {text}
                  {result?.answer === i && <Check size={19} />}
                </button>
              ))}
            </div>
            {q.reasons && choice !== null && !result && (
              <div className="sdvs-reason-choice">
                <h3>Чем обоснуешь вердикт?</h3>
                {q.reasons.map((r, i) => (
                  <button key={r} disabled={busy} onClick={() => void answer(choice, i)}>
                    {r}
                  </button>
                ))}
              </div>
            )}
            {resource.data?.solved.includes(q.id) && !result && (
              <p className="sdvs-fineprint">
                Ты уже решал это задание. Повторение укрепляет знания; XP начисляется только за первое верное
                решение.
              </p>
            )}
            {result && (
              <div
                ref={announced}
                tabIndex={-1}
                className={'sdvs-challenge-result ' + (result.correct ? 'correct' : 'wrong')}
                role="status"
              >
                <h3>{result.correct ? 'Точно!' : 'Разберёмся вместе'}</h3>
                <p>{result.explanation}</p>
                {q.reasons && (
                  <p>
                    <strong>Обоснование:</strong> {q.reasons[result.reason!]}
                  </p>
                )}
                <p>{result.xpAwarded ? `+${result.xpAwarded} XP` : 'Повторение без дополнительного XP'}</p>
                <button
                  className="rr-button primary"
                  onClick={() => {
                    setIndex(index + 1);
                    setChoice(null);
                    setResult(null);
                  }}
                >
                  {index + 1 === questions.length ? 'К результату' : 'Следующая сцена'}
                  <ArrowRight size={17} />
                </button>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="sdvs-challenge-finish">
          <config.icon size={65} />
          <p className="sdvs-eyebrow">МИССИЯ ЗАВЕРШЕНА</p>
          <h2>{questions.length ? `${score} из ${questions.length}` : 'Пока нет заданий'}</h2>
          <p>
            Лучшая серия: {best} · Заработано: {xp} XP
          </p>
          <p>Ошибки — подсказка, что стоит повторить. Вернись в справочник за подробным разбором.</p>
          <div>
            <button
              className="rr-button primary"
              onClick={() => {
                setIndex(0);
                setChoice(null);
                setResult(null);
                setScore(0);
                setCombo(0);
                setBest(0);
                setXp(0);
                void resource.reload();
              }}
            >
              <RotateCcw size={17} />
              Ещё раз
            </button>
            <a href="#rules" className="rr-button secondary">
              К правилам
            </a>
          </div>
        </section>
      )}
    </div>
  );
}
