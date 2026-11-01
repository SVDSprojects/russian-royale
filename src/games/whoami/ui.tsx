// Общие элементы интерфейса «Кто я» — «Музей живых слов»: таймер, связь, звук, рамки, штампы, буквы.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LoaderCircle, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import type { Answer, Phase, ViewCard, ViewParticipant } from "../../../shared/games/whoami/types";
import type { Connection } from "./client";

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: "Лобби",
  assign: "Таблички развешаны",
  asking: "Вопрос",
  peerVote: "Ответы зала",
  guessing: "Догадка",
  nextTurn: "Смена хода",
  finished: "Итоги экспозиции",
  cancelled: "Партия отменена",
};

export const ANSWER_LABEL: Record<Answer, string> = { yes: "Да", no: "Нет", ambiguous: "Неоднозначно" };

/** Смещение серверных часов: интерфейс показывает время сервера, а не управляет им. */
export function useServerClock(serverNowMs: number): () => number {
  const offset = useRef(serverNowMs - Date.now());
  useEffect(() => {
    offset.current = serverNowMs - Date.now();
  }, [serverNowMs]);
  return () => Date.now() + offset.current;
}

export function useRemaining(deadline: number | null, serverNowMs: number): number | null {
  const now = useServerClock(serverNowMs);
  const [remaining, setRemaining] = useState<number | null>(deadline === null ? null : Math.max(0, deadline - now()));
  useEffect(() => {
    if (deadline === null) {
      setRemaining(null);
      return;
    }
    const update = () => setRemaining(Math.max(0, deadline - now()));
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
    // now() читает ref: перезапуск нужен только при смене дедлайна или серверного времени.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadline, serverNowMs]);
  return remaining;
}

export function Countdown({ deadline, serverNowMs, totalMs, label }: { deadline: number | null; serverNowMs: number; totalMs: number; label: string }) {
  const remaining = useRemaining(deadline, serverNowMs);
  if (remaining === null) return null;
  const seconds = Math.ceil(remaining / 1000);
  const fraction = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0;
  return (
    <div className="rr-whoami-timer" role="timer" aria-label={`${label}: осталось ${seconds} с`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="21" className="rr-whoami-timer-face" />
        <line x1="24" y1="24" x2={24 + 15 * Math.sin(2 * Math.PI * (1 - fraction))} y2={24 - 15 * Math.cos(2 * Math.PI * (1 - fraction))} className="rr-whoami-timer-hand" />
        <circle cx="24" cy="24" r="2.5" className="rr-whoami-timer-pin" />
      </svg>
      <span>{seconds}</span>
    </div>
  );
}

const CONNECTION_TEXT: Record<Connection, string> = { online: "В сети", reconnecting: "Переподключаемся…", offline: "Нет связи" };

/** Баннер связи: потеря, переподключение и короткое сообщение о восстановлении. */
export function ConnectionBanner({ connection }: { connection: Connection }) {
  const previous = useRef<Connection>(connection);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (previous.current !== "online" && connection === "online") {
      setRestored(true);
      const timer = setTimeout(() => setRestored(false), 3000);
      previous.current = connection;
      return () => clearTimeout(timer);
    }
    previous.current = connection;
    return undefined;
  }, [connection]);
  if (connection === "online" && !restored) return null;
  const tone = connection === "online" ? "ok" : connection === "offline" ? "bad" : "warn";
  return (
    <div className={`rr-whoami-banner rr-whoami-banner--${tone}`} role="status">
      {connection === "online" ? <Wifi aria-hidden="true" /> : connection === "offline" ? <WifiOff aria-hidden="true" /> : <LoaderCircle className="rr-whoami-spin" aria-hidden="true" />}
      <span>
        {connection === "online"
          ? "Связь восстановлена — экран актуален"
          : connection === "offline"
            ? "Нет связи. Ваше место и табличка сохранены — вернитесь, когда сеть появится"
            : "Связь прервалась, переподключаемся. Таймер идёт на сервере"}
      </span>
    </div>
  );
}

export function ConnectionDot({ connection }: { connection: Connection }) {
  return (
    <span className={`rr-whoami-dot rr-whoami-dot--${connection}`} title={CONNECTION_TEXT[connection]}>
      <span className="rr-whoami-sr">{CONNECTION_TEXT[connection]}</span>
    </span>
  );
}

// ---------- звук: выключен по умолчанию ----------

export function useSound(): { enabled: boolean; toggle: () => void; play: (kind: "turn" | "stamp" | "solved") => void } {
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const play = (kind: "turn" | "stamp" | "solved") => {
    if (!enabled || typeof window === "undefined" || !("AudioContext" in window)) return;
    context.current ??= new AudioContext();
    const ctx = context.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === "stamp" ? "square" : "sine";
    osc.frequency.value = kind === "turn" ? 620 : kind === "stamp" ? 180 : 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === "solved" ? 0.5 : 0.15));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  };
  return { enabled, toggle: () => setEnabled((value) => !value), play };
}

export function SoundToggle({ enabled, toggle }: { enabled: boolean; toggle: () => void }) {
  return (
    <button type="button" className="rr-whoami-icon-btn" onClick={toggle} aria-pressed={enabled} aria-label={enabled ? "Выключить звук" : "Включить звук"}>
      {enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      <span className="rr-whoami-icon-label">{enabled ? "Звук" : "Без звука"}</span>
    </button>
  );
}

/** Пауза декоративных циклов в скрытой вкладке. */
export function useHiddenTab(): boolean {
  const [hidden, setHidden] = useState(typeof document !== "undefined" && document.visibilityState === "hidden");
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return hidden;
}

/** Фон зала: арки и мягкие пятна света. Только декор, без вспышек. */
export function MuseumHall() {
  return (
    <svg className="rr-whoami-hall" viewBox="0 0 400 120" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} transform={`translate(${i * 84 + 4} 0)`}>
          <path d="M8 120 V52 A34 34 0 0 1 76 52 V120" className="rr-whoami-arch" />
          <circle cx="42" cy="22" r="10" className="rr-whoami-lamp" style={{ animationDelay: `${i * 1.7}s` }} />
        </g>
      ))}
    </svg>
  );
}

export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("");
  return letters.slice(0, 2).toUpperCase() || "?";
}

export function PlayerChip({ player, active, me, children }: { player: ViewParticipant; active: boolean; me: boolean; children?: ReactNode }) {
  const status = player.left ? "вышел" : player.online ? "" : "не в сети";
  return (
    <li className={`rr-whoami-player${active ? " is-active" : ""}`}>
      <span className={`rr-whoami-avatar${me ? " is-me" : ""}${player.online ? "" : " is-offline"}`} aria-hidden="true">
        {initials(player.username)}
      </span>
      <span className="rr-whoami-player-name">
        {player.username}
        {me ? " (вы)" : ""}
        {player.isHost ? <span className="rr-whoami-tag">ведущий</span> : null}
        {status ? <span className="rr-whoami-tag rr-whoami-tag--muted">{status}</span> : null}
      </span>
      {children}
    </li>
  );
}

/** Угаданный термин собирается из летающих букв за 650 мс. */
export function LetterAssemble({ text }: { text: string }) {
  const letters = [...text];
  return (
    <span className="rr-whoami-letters" aria-label={text} role="img">
      {letters.map((letter, index) => (
        <span
          key={index}
          aria-hidden="true"
          className="rr-whoami-letter"
          style={{ "--rr-whoami-dx": `${((index * 37) % 9) - 4}em`, "--rr-whoami-dy": `${((index * 23) % 7) - 3}em`, animationDelay: `${Math.min(index * 20, 250)}ms` } as CSSProperties}
        >
          {letter === " " ? " " : letter}
        </span>
      ))}
    </span>
  );
}

/** Табличка в рамке. Своя неугаданная повернута обратной стороной с большим «?». */
export function Plaque({ card, owner, me, active, compact }: { card: ViewCard; owner: string; me: boolean; active: boolean; compact?: boolean }) {
  return (
    <figure className={`rr-whoami-frame${active ? " is-active" : ""}${card.solved ? " is-solved" : ""}${compact ? " is-compact" : ""}`}>
      <div className={`rr-whoami-plaque${card.hidden ? " is-back" : ""}`}>
        {card.hidden ? (
          <span className="rr-whoami-plaque-back">
            <span aria-hidden="true">?</span>
            <span className="rr-whoami-sr">{me ? "Ваш термин скрыт" : "Термин скрыт"}</span>
          </span>
        ) : (
          <span className="rr-whoami-plaque-front">
            <span className="rr-whoami-plaque-cat">{card.category}</span>
            {card.solved && card.term ? <LetterAssemble text={card.term} /> : <span lang="ru" className={`rr-whoami-plaque-term${(card.term ?? "").length > 12 ? " is-long" : ""}`}>{card.term}</span>}
          </span>
        )}
      </div>
      <figcaption>
        {owner}
        {me ? " (вы)" : ""}
        <span className="rr-whoami-muted">
          {" "}
          · {card.solved ? `угадал${card.score !== null ? `, ${card.score} очк.` : ""}` : `ходов: ${card.turnsTaken}`}
        </span>
      </figcaption>
    </figure>
  );
}

/** Механический штамп. Разная форма для каждого ответа: круг, квадрат, ромб. */
export function Stamp({ answer, count, pressed }: { answer: Answer; count?: number; pressed?: boolean }) {
  return (
    <span className={`rr-whoami-stamp rr-whoami-stamp--${answer}${pressed ? " is-pressed" : ""}`}>
      <svg viewBox="0 0 64 64" aria-hidden="true">
        {answer === "yes" ? <circle cx="32" cy="32" r="27" /> : null}
        {answer === "no" ? <rect x="7" y="7" width="50" height="50" rx="4" /> : null}
        {answer === "ambiguous" ? <path d="M32 4 L60 32 L32 60 L4 32 Z" /> : null}
      </svg>
      <span className="rr-whoami-stamp-text">
        {/* Мягкий перенос: длинное слово помещается внутри ромба в две строки. */}
        {answer === "ambiguous" ? "Неодно­значно" : ANSWER_LABEL[answer]}
        {count !== undefined ? <b> {count}</b> : null}
      </span>
    </span>
  );
}

export function ErrorNote({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="rr-whoami-error" role="alert">
      <span>{message}</span>
      <button type="button" className="rr-whoami-icon-btn" onClick={onClose} aria-label="Скрыть сообщение об ошибке">
        ×
      </button>
    </div>
  );
}

/** Выполняет действие и хранит текст ошибки для показа рядом с кнопкой. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (operation: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось выполнить действие");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
