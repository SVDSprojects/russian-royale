// Общие элементы интерфейса «Самозванца»: таймер, связь, звук, звёзды, спутники, линза.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Volume2, VolumeX, Wifi, WifiOff, LoaderCircle } from "lucide-react";
import type { Phase, ViewParticipant } from "../../../shared/games/impostor/types";
import type { Connection } from "./client";

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: "Лобби",
  deal: "Раздача тем",
  examples: "Круг примеров",
  discussion: "Обсуждение",
  voting: "Голосование",
  reveal: "Раскрытие орбит",
  finished: "Итоги партии",
  cancelled: "Партия отменена",
};

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
  const circumference = 2 * Math.PI * 20;
  return (
    <div className="rr-impostor-timer" role="timer" aria-label={`${label}: осталось ${seconds} с`}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" className="rr-impostor-timer-track" />
        <circle
          cx="24"
          cy="24"
          r="20"
          className="rr-impostor-timer-arc"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
        />
      </svg>
      <span>{seconds}</span>
    </div>
  );
}

const CONNECTION_TEXT: Record<Connection, string> = {
  online: "В сети",
  reconnecting: "Переподключаемся…",
  offline: "Нет связи",
};

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
    <div className={`rr-impostor-banner rr-impostor-banner--${tone}`} role="status">
      {connection === "online" ? <Wifi aria-hidden="true" /> : connection === "offline" ? <WifiOff aria-hidden="true" /> : <LoaderCircle className="rr-impostor-spin" aria-hidden="true" />}
      <span>
        {connection === "online"
          ? "Связь восстановлена — экран актуален"
          : connection === "offline"
            ? "Нет связи. Ваше место и тема сохранены — вернитесь, когда сеть появится"
            : "Связь прервалась, переподключаемся. Таймер идёт на сервере"}
      </span>
    </div>
  );
}

export function ConnectionDot({ connection }: { connection: Connection }) {
  return (
    <span className={`rr-impostor-dot rr-impostor-dot--${connection}`} title={CONNECTION_TEXT[connection]}>
      <span className="rr-impostor-sr">{CONNECTION_TEXT[connection]}</span>
    </span>
  );
}

// ---------- звук: выключен по умолчанию ----------

export function useSound(): { enabled: boolean; toggle: () => void; play: (kind: "turn" | "reveal" | "tick") => void } {
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const play = (kind: "turn" | "reveal" | "tick") => {
    if (!enabled || typeof window === "undefined" || !("AudioContext" in window)) return;
    context.current ??= new AudioContext();
    const ctx = context.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = kind === "turn" ? 660 : kind === "reveal" ? 440 : 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === "reveal" ? 0.6 : 0.18));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.7);
  };
  return { enabled, toggle: () => setEnabled((value) => !value), play };
}

export function SoundToggle({ enabled, toggle }: { enabled: boolean; toggle: () => void }) {
  return (
    <button type="button" className="rr-impostor-icon-btn" onClick={toggle} aria-pressed={enabled} aria-label={enabled ? "Выключить звук" : "Включить звук"}>
      {enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      <span className="rr-impostor-icon-label">{enabled ? "Звук" : "Без звука"}</span>
    </button>
  );
}

// ---------- декор ----------

/** Редкие звёзды. Мерцание медленное, без вспышек; останавливается в фоновой вкладке и при reduced-motion. */
export function Starfield() {
  const stars = useMemo(
    () =>
      Array.from({ length: 22 }, (_, index) => ({
        x: (index * 47) % 100,
        y: (index * 29 + 13) % 100,
        r: index % 5 === 0 ? 1.6 : 1,
        delay: (index % 7) * 1.3,
      })),
    [],
  );
  return (
    <svg className="rr-impostor-stars" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {stars.map((star, index) => (
        <circle key={index} cx={star.x} cy={star.y} r={star.r * 0.18} style={{ animationDelay: `${star.delay}s` }} />
      ))}
    </svg>
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

export function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? "")
    .join("");
  return letters.slice(0, 2).toUpperCase() || "?";
}

/** Спутник игрока. Все спутники одинаковы по форме и цвету — без намёка на роль. */
export function Satellite({ player, active, me, size = 48 }: { player: ViewParticipant; active: boolean; me: boolean; size?: number }) {
  return (
    <span
      className={["rr-impostor-sat", active ? "is-active" : "", me ? "is-me" : "", player.online ? "" : "is-offline", player.left ? "is-left" : ""].join(" ")}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 48 48">
        <ellipse cx="24" cy="24" rx="22" ry="7" className="rr-impostor-sat-ring" />
        <circle cx="24" cy="24" r="14" className="rr-impostor-sat-body" />
      </svg>
      <span className="rr-impostor-sat-initials">{initials(player.username)}</span>
    </span>
  );
}

export function PlayerChip({ player, active, me, children }: { player: ViewParticipant; active: boolean; me: boolean; children?: ReactNode }) {
  const status = player.left ? "вышел" : player.online ? "" : "не в сети";
  return (
    <li className={`rr-impostor-player${active ? " is-active" : ""}`}>
      <Satellite player={player} active={active} me={me} />
      <span className="rr-impostor-player-name">
        {player.username}
        {me ? " (вы)" : ""}
        {player.isHost ? <span className="rr-impostor-tag">ведущий</span> : null}
        {status ? <span className="rr-impostor-tag rr-impostor-tag--muted">{status}</span> : null}
      </span>
      {children}
    </li>
  );
}

/** Две перекрывающиеся бумажные планеты. diverged — финал: орбиты расходятся. */
export function Planets({ diverged, labelA, labelB }: { diverged: boolean; labelA?: string; labelB?: string }) {
  return (
    <div className={`rr-impostor-planets${diverged ? " is-diverged" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 320 200">
        <defs>
          <pattern id="rr-impostor-paper" width="8" height="8" patternUnits="userSpaceOnUse">
            <path d="M0 8 L8 0" className="rr-impostor-paper-line" />
          </pattern>
        </defs>
        <ellipse cx="160" cy="100" rx="150" ry="62" className="rr-impostor-orbit" />
        <ellipse cx="160" cy="100" rx="118" ry="44" className="rr-impostor-orbit rr-impostor-orbit--inner" />
        <g className="rr-impostor-planet rr-impostor-planet--a">
          <circle cx="132" cy="100" r="52" />
          <circle cx="132" cy="100" r="52" fill="url(#rr-impostor-paper)" />
        </g>
        <g className="rr-impostor-planet rr-impostor-planet--b">
          <circle cx="188" cy="100" r="52" />
          <circle cx="188" cy="100" r="52" fill="url(#rr-impostor-paper)" />
        </g>
      </svg>
      {labelA && labelB ? (
        <div className="rr-impostor-planet-labels">
          <span className="rr-impostor-planet-label rr-impostor-planet-label--a">{labelA}</span>
          <span className="rr-impostor-planet-label rr-impostor-planet-label--b">{labelB}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Линза: секретная тема раскрывается за 450 мс; кнопка скрывает её от посторонних глаз. */
export function Lens({ title, description, open, onToggle }: { title: string; description: string; open: boolean; onToggle: () => void }) {
  return (
    <section className={`rr-impostor-lens${open ? " is-open" : ""}`} aria-label="Ваша тема">
      <div className="rr-impostor-lens-glass">
        <div className="rr-impostor-lens-content" aria-hidden={!open}>
          <p className="rr-impostor-kicker">Ваша тема</p>
          <h3>{open ? title : "Тема скрыта"}</h3>
        </div>
      </div>
      {open ? <p className="rr-impostor-lens-desc">{description}</p> : null}
      <button type="button" className="rr-impostor-btn rr-impostor-btn--ghost" onClick={onToggle} aria-expanded={open}>
        {open ? "Прикрыть линзу" : "Открыть линзу"}
      </button>
    </section>
  );
}

export function ErrorNote({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="rr-impostor-error" role="alert">
      <span>{message}</span>
      <button type="button" className="rr-impostor-icon-btn" onClick={onClose} aria-label="Скрыть сообщение об ошибке">
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
