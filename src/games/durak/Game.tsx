import { PlayerName } from '../../student/Identity';
import { useEffect, useState, useRef } from "react";
import {
  ArrowLeft,
  Check,
  HelpCircle,
  Volume2,
  VolumeX,
  Mail,
  RefreshCw,
} from "lucide-react";
import type { Action, View, Card } from "../../../shared/games/durak/types";
import { CardFace, suits, suitNames, rankName } from "./Card";
import "./styles.css";
export interface GameProps {
  view: View;
  currentUserId: string;
  send: (action: Action) => Promise<void>;
  connection: "online" | "reconnecting" | "offline";
  serverNowMs: number;
  onExit: () => void;
  onRematch?: () => Promise<void>;
}
const key = (c: Card) => `${c.suit}:${c.rank}`;
export function Game({
  view: v,
  currentUserId: id,
  send,
  connection,
  serverNowMs,
  onExit,
  onRematch,
}: GameProps) {
  const [selected, setSelected] = useState<Card | null>(null),
    [pair, setPair] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [help, setHelp] = useState(false),
    [sound, setSound] = useState(false),
    [answers, setAnswers] = useState<number[]>([]),
    [clock, setClock] = useState({ server: serverNowMs, local: Date.now() }),
    [now, setNow] = useState(serverNowMs);
  const previousDiscard = useRef(v.discardCount);
  const [departing, setDeparting] = useState(false);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (v.discardCount > previousDiscard.current) {
      setDeparting(true);
      timer = setTimeout(() => setDeparting(false), 400);
    }
    previousDiscard.current = v.discardCount;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [v.discardCount]);
  const mine = v.turnId === id;
  const acting = v.players.find((p) => p.id === v.turnId);
  const legal = selected && v.legalCards.some((c) => key(c) === key(selected));
  useEffect(() => {
    setClock({ server: serverNowMs, local: Date.now() });
    setNow(serverNowMs);
  }, [serverNowMs]);
  useEffect(() => {
    const t = setInterval(
      () => setNow(clock.server + Date.now() - clock.local),
      200,
    );
    return () => clearInterval(t);
  }, [clock]);
  useEffect(() => {
    setSelected(null);
    setPair(
      Math.max(
        0,
        v.table.findIndex((p) => !p.defense),
      ),
    );
    setAnswers([]);
  }, [v.turnId, v.table.length, v.phase, v.task?.id]);
  useEffect(() => {
    const sync = () =>
      document
        .querySelectorAll(".rr-game-durak")
        .forEach((e) => e.classList.toggle("rr-durak-hidden", document.hidden));
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);
  async function act(a: Action) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await send(a);
      setSelected(null);
      if (sound) {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator(),
          gain = ctx.createGain();
        gain.gain.setValueAtTime(0.025, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.frequency.value = 660;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
        osc.onended = () => {
          void ctx.close();
        };
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  }
  const disabled = busy || connection !== "online";
  const seconds = Math.max(0, Math.ceil(((v.deadline ?? now) - now) / 1000));
  return (
    <div className="rr-game-durak">
      <div className="rr-durak-shell">
        <header className="rr-durak-header">
          <button
            className="rr-durak-icon"
            onClick={onExit}
            aria-label="Выйти из комнаты"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <small>РУССКИЙ ROYALE / ИГРА 03</small>
            <h1>
              Почтовый экспресс<span>Подкидной дурак</span>
            </h1>
          </div>
          <div className="rr-durak-header-actions">
            <button
              className="rr-durak-icon"
              aria-label={sound ? "Выключить звук" : "Включить звук"}
              onClick={() => setSound(!sound)}
            >
              {sound ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button
              className="rr-durak-icon"
              aria-label="Правила игры"
              onClick={() => setHelp(!help)}
            >
              <HelpCircle size={20} />
            </button>
          </div>
        </header>
        {connection !== "online" && (
          <div className="rr-durak-alert" role="status">
            {connection === "offline"
              ? "Нет связи. Действия недоступны."
              : "Восстанавливаем связь…"}{" "}
            Сервер продолжает отсчёт времени.
          </div>
        )}
        {error && (
          <div role="alert" className="rr-durak-alert">
            {error}
            <button onClick={() => setError("")} aria-label="Закрыть ошибку">
              ×
            </button>
          </div>
        )}
        {help && (
          <section className="rr-durak-help">
            <h2>Как отправить карты</h2>
            <p>
              Первая атака — одна карта. Подкидывайте только номинал, уже
              лежащий на столе, включая покрывающие карты. Очередь идёт по
              часовой стрелке, защитник отвечает между подкидываниями.
            </p>
            <p>
              Десятку червей бьёт валет червей или любой козырь, если червы не
              козырные. Козырную десятку бьёт только старший козырь. Например,
              при козыре ♠ шестёрка ♠ бьёт туза ♥.
            </p>
            <p>
              Лимит захода — не больше 6 и не больше размера руки защитника в
              начале захода. После «Беру» разрешён один круг подкидываний. После
              круга пасов покрытые карты идут в отбой.
            </p>
            <p>
              До шести добирает первый атакующий, затем остальные по часовой
              стрелке; защитник последним. Открытая козырная карта забирается
              последней. После отбоя атакует защитник, после взятия — следующий
              активный игрок.
            </p>
            <p>
              На действие 25 секунд: защита по таймауту берёт, подкидывающий
              пасует, первая атака выбирается автоматически. Учебный бонус один
              раз за заход: до 15 секунд паузы, верный ответ добавляет 10
              секунд.
            </p>
            <p>
              Вышедший получает 100 очков, последний с картами — 30. Ничья
              оставшихся — 50; предел — 150 заходов. Очки не изменяют общий XP
              сайта.
            </p>
          </section>
        )}
        <main>
          <section className="rr-durak-opponents" aria-label="Участники">
            {v.players.map((p, i) => (
              <div
                key={p.id}
                className={`rr-durak-player ${p.id === v.turnId ? "rr-durak-active" : ""} ${p.out ? "rr-durak-out" : ""}`}
              >
                <span className="rr-durak-avatar">
                  {p.username.slice(0, 1)}
                </span>
                <div>
                  <strong>
                    <PlayerName id={p.id} name={p.username} />
                    {p.id === id ? " · вы" : ""}
                  </strong>
                  <small>
                    {p.out
                      ? "Доставлено · вышел"
                      : p.id === v.defenderId
                        ? "Защищается"
                        : p.id === v.turnId
                          ? "Ходит"
                          : "Ожидает"}{" "}
                    · место {i + 1}
                  </small>
                </div>
                <div
                  className="rr-durak-mini-cards"
                  aria-label={`${p.count} карт`}
                >
                  {p.id !== id && p.count > 0 && <CardFace back />}
                  <b>{p.count}</b>
                </div>
              </div>
            ))}
          </section>
          <section className="rr-durak-table" aria-label="Игровой стол">
            <div className="rr-durak-route" aria-hidden="true">
              <span>01 / ПЕРРОН</span>
              <span>02 / СОРТИРОВКА</span>
              <span>03 / ДОСТАВКА</span>
            </div>
            <div className="rr-durak-table-top">
              <div className="rr-durak-deck">
                {v.deckCount > 0 && (
                  <span
                    className="rr-durak-envelope-stack"
                    aria-label="Колода конвертов"
                  >
                    <CardFace back />
                  </span>
                )}
                <div className="rr-durak-stamp">
                  {suits[v.trump.suit]} <b>{rankName(v.trump.rank)}</b>
                </div>
                <div>
                  <strong>Козырь · {suits[v.trump.suit]}</strong>
                  <small>
                    В колоде {v.deckCount} · Отбой {v.discardCount}
                  </small>
                </div>
              </div>
              <span className="rr-durak-pill">ЗАХОД {v.round || 1} / 150</span>
            </div>
            <div className="rr-durak-phase" aria-live="polite">
              <small>
                {v.phase === "dealing"
                  ? "ОТПРАВЛЯЕМ БИЛЕТЫ"
                  : v.taking
                    ? "ЗАЩИТНИК БЕРЁТ"
                    : v.phase === "finished"
                      ? "МАРШРУТ ЗАВЕРШЁН"
                      : mine
                        ? "ВАША ОЧЕРЕДЬ"
                        : "ОЖИДАНИЕ ХОДА"}
              </small>
              <h2>
                {v.phase === "dealing"
                  ? "Раздаём карты…"
                  : v.phase === "finished"
                    ? "Письма доставлены"
                    : v.task
                      ? "Учебная остановка"
                      : mine
                        ? v.phase === "defend"
                          ? "Покройте карту или возьмите"
                          : v.table.length
                            ? "Подкиньте карту или пасуйте"
                            : "Выберите первую карту"
                        : `Ходит ${acting?.username ?? ""}`}
              </h2>
              {v.deadline !== null && (
                <span
                  className={`rr-durak-timer ${seconds <= 5 ? "rr-durak-urgent" : ""}`}
                  role="timer"
                  aria-label={`Осталось ${seconds} секунд`}
                >
                  {seconds}
                  <small>сек</small>
                </span>
              )}
            </div>
            <div className="rr-durak-pairs">
              {v.table.length === 0 ? (
                <div className="rr-durak-empty">
                  <Mail size={36} />
                  <p>Следующая остановка — ваш ход</p>
                  <small>Выберите билет в руке и подтвердите отправку</small>
                </div>
              ) : (
                v.table.map((p, i) => (
                  <button
                    key={`${v.round}-${i}`}
                    className={`rr-durak-pair ${pair === i && mine && v.phase === "defend" ? "rr-durak-target" : ""}`}
                    disabled={
                      !mine || v.phase !== "defend" || !!p.defense || disabled
                    }
                    onClick={() => setPair(i)}
                    aria-label={`Атака ${i + 1}: ${rankName(p.attack.rank)} ${suitNames[p.attack.suit]}${p.defense ? ", покрыта" : ", выбрать для покрытия"}`}
                  >
                    <CardFace card={p.attack} />
                    {p.defense && (
                      <span className="rr-durak-cover">
                        <CardFace card={p.defense} />
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
            {departing && (
              <div className="rr-durak-discard-flight" aria-hidden="true">
                <CardFace back />
              </div>
            )}
            <div className="rr-durak-table-bottom">
              <span>
                Лимит отправки: {v.table.length} / {v.limit}
              </span>
              <span>
                <Mail size={14} /> Отбой — в почтовый ящик
              </span>
            </div>
          </section>
          {v.task && (
            <section
              className="rr-durak-task"
              aria-labelledby="rr-durak-task-title"
            >
              <small>УЧЕБНЫЙ БОНУС · ОСНОВНОЙ ТАЙМЕР НА ПАУЗЕ</small>
              <h2 id="rr-durak-task-title">{v.task.prompt}</h2>
              <p>Отметьте все правильные варианты.</p>
              <div className="rr-durak-options">
                {v.task.options.map((o, i) => (
                  <label key={i}>
                    <input
                      type="checkbox"
                      checked={answers.includes(i)}
                      onChange={() =>
                        setAnswers(
                          answers.includes(i)
                            ? answers.filter((n) => n !== i)
                            : [...answers, i],
                        )
                      }
                    />
                    {o}
                  </label>
                ))}
              </div>
              <button
                className="rr-durak-primary"
                disabled={disabled || !answers.length}
                onClick={() => void act({ type: "answer", answers })}
              >
                Ответить
              </button>
            </section>
          )}
          {v.feedback && (
            <div className="rr-durak-feedback" role="status">
              <strong>
                {v.feedback.correct ? "Верно! +10 секунд" : "Бонус не получен"}
              </strong>
              <p>{v.feedback.explanation}</p>
            </div>
          )}
          {v.final ? (
            <section className="rr-durak-result">
              <small>ИТОГОВАЯ КВИТАНЦИЯ</small>
              <h2>
                {v.final.outcome === "cancelled"
                  ? "Партия отменена"
                  : v.final.outcome === "draw"
                    ? "Ничья"
                    : "Маршрут завершён"}
              </h2>
              {v.final.outcome === "cancelled" && (
                <p>
                  Все участники отсутствовали более 10 минут. Победителя нет.
                </p>
              )}
              <div className="rr-durak-score-list">
                {v.final.scores.map((s) => (
                  <div key={s.userId}>
                    <span>
                      {v.players.find((p) => p.id === s.userId)?.username}
                    </span>
                    <strong>{s.score} очков</strong>
                  </div>
                ))}
              </div>
              <details>
                <summary>Учебная статистика</summary>
                {v.players.map((p) => (
                  <p key={p.id}>
                    <PlayerName id={p.id} name={p.username} />: заданий {p.stats.asked}, верно{" "}
                    {p.stats.correct}, неверно {p.stats.wrong}, таймаутов{" "}
                    {p.stats.timedOut}
                  </p>
                ))}
              </details>
              {v.hostId === id && onRematch ? (
                <button
                  className="rr-durak-primary"
                  disabled={disabled}
                  onClick={() => {
                    setBusy(true);
                    void onRematch()
                      .catch((e) =>
                        setError(
                          e instanceof Error ? e.message : "Ошибка реванша",
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  <RefreshCw size={18} /> Сыграть ещё
                </button>
              ) : (
                <p>Ведущий может открыть лобби для реванша.</p>
              )}
            </section>
          ) : (
            <section className="rr-durak-hand-section">
              <div className="rr-durak-hand-title">
                <h2>
                  Ваши билеты <span>{v.hand.length}</span>
                </h2>
                <small>
                  {selected
                    ? "Карта выбрана — подтвердите действие"
                    : "Выберите карту касанием или клавиатурой"}
                </small>
              </div>
              <div className="rr-durak-hand" aria-label="Ваши карты">
                {v.hand.map((c) => (
                  <button
                    className={`rr-durak-card ${selected && key(selected) === key(c) ? "rr-durak-selected" : ""} ${v.legalCards.some((l) => key(l) === key(c)) ? "rr-durak-legal" : ""}`}
                    key={key(c)}
                    onClick={() => setSelected(c)}
                    aria-pressed={!!selected && key(selected) === key(c)}
                  >
                    <CardFace card={c} />
                  </button>
                ))}
              </div>
              <div className="rr-durak-controls">
                <button
                  className="rr-durak-primary"
                  disabled={disabled || !mine || !legal}
                  onClick={() =>
                    selected &&
                    void act(
                      v.phase === "defend"
                        ? { type: "defend", card: selected, pair }
                        : { type: "attack", card: selected },
                    )
                  }
                >
                  <Check size={18} />
                  {v.phase === "defend" ? "Покрыть карту" : "Отправить карту"}
                </button>
                {v.canTake && (
                  <button
                    className="rr-durak-secondary"
                    disabled={disabled}
                    onClick={() => void act({ type: "take" })}
                  >
                    Беру
                  </button>
                )}
                {v.canPass && (
                  <button
                    className="rr-durak-secondary"
                    disabled={disabled}
                    onClick={() => void act({ type: "pass" })}
                  >
                    Пас
                  </button>
                )}
                {v.canBonus && (
                  <button
                    className="rr-durak-secondary"
                    disabled={disabled}
                    onClick={() => void act({ type: "bonus" })}
                  >
                    Задание · +10 сек
                  </button>
                )}
              </div>
            </section>
          )}
        </main>
        <footer className="rr-durak-footer">
          <span>РУССКИЙ ROYALE</span>
          <span>36 билетов · 2–6 пассажиров · честная игра</span>
        </footer>
      </div>
    </div>
  );
}
