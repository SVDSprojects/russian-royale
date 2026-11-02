import { PlayerName } from '../../student/Identity';
// Общие элементы интерфейса «Alias»: манометр, связь, звук, декор фабрики, значки команд, конвейер.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Volume2, VolumeX, Wifi, WifiOff } from "lucide-react";
import type { Phase, TeamShape, ViewParticipant, ViewTeam } from "../../../shared/games/alias/types";
import type { Connection } from "./client";

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: "Лобби",
  prepare: "Подготовка",
  explaining: "Объяснение",
  turnResult: "Итог хода",
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

/** Таймер-манометр: стрелка плавно идёт от полного давления к нулю, без мигания. */
export function Gauge({ deadline, serverNowMs, totalMs, label, size = "large" }: { deadline: number | null; serverNowMs: number; totalMs: number; label: string; size?: "large" | "small" }) {
  const remaining = useRemaining(deadline, serverNowMs);
  if (remaining === null) return null;
  const seconds = Math.ceil(remaining / 1000);
  const fraction = totalMs > 0 ? Math.min(1, remaining / totalMs) : 0;
  const angle = -120 + 240 * fraction;
  const ticks = Array.from({ length: 9 }, (_, i) => -120 + i * 30);
  return (
    <div className={`rr-alias-gauge rr-alias-gauge--${size}`} role="timer" aria-label={`${label}: осталось ${seconds} с`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="54" className="rr-alias-gauge-rim" />
        <circle cx="60" cy="60" r="46" className="rr-alias-gauge-face" />
        {ticks.map((tick) => (
          <line key={tick} x1="60" y1="18" x2="60" y2="26" className="rr-alias-gauge-tick" transform={`rotate(${tick} 60 60)`} />
        ))}
        <path d="M24 90 A46 46 0 0 1 32 30" className="rr-alias-gauge-zone" />
        <line x1="60" y1="60" x2="60" y2="22" className="rr-alias-gauge-needle" style={{ transform: `rotate(${angle}deg)` }} />
        <circle cx="60" cy="60" r="6" className="rr-alias-gauge-hub" />
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
    <div className={`rr-alias-banner rr-alias-banner--${tone}`} role="status">
      {connection === "online" ? <Wifi aria-hidden="true" /> : connection === "offline" ? <WifiOff aria-hidden="true" /> : <LoaderCircle className="rr-alias-spin" aria-hidden="true" />}
      <span>
        {connection === "online"
          ? "Связь восстановлена — экран актуален"
          : connection === "offline"
            ? "Нет связи. Ваше место в команде сохранено — вернитесь, когда сеть появится"
            : "Связь прервалась, переподключаемся. Таймер хода идёт на сервере"}
      </span>
    </div>
  );
}

export function ConnectionDot({ connection }: { connection: Connection }) {
  return (
    <span className={`rr-alias-dot rr-alias-dot--${connection}`} title={CONNECTION_TEXT[connection]}>
      <span className="rr-alias-sr">{CONNECTION_TEXT[connection]}</span>
    </span>
  );
}

// ---------- звук: выключен по умолчанию ----------

export type SoundKind = "turn" | "correct" | "skip";

export function useSound(): { enabled: boolean; toggle: () => void; play: (kind: SoundKind) => void } {
  const [enabled, setEnabled] = useState(false);
  const context = useRef<AudioContext | null>(null);
  const play = (kind: SoundKind) => {
    if (!enabled || typeof window === "undefined" || !("AudioContext" in window)) return;
    context.current ??= new AudioContext();
    const ctx = context.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = kind === "skip" ? "triangle" : "sine";
    osc.frequency.value = kind === "correct" ? 784 : kind === "turn" ? 523 : 330;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  };
  return { enabled, toggle: () => setEnabled((value) => !value), play };
}

export function SoundToggle({ enabled, toggle }: { enabled: boolean; toggle: () => void }) {
  return (
    <button type="button" className="rr-alias-icon-btn" onClick={toggle} aria-pressed={enabled} aria-label={enabled ? "Выключить звук" : "Включить звук"}>
      {enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
      <span className="rr-alias-icon-label">{enabled ? "Звук" : "Без звука"}</span>
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

/** Декор фабрики: две медленные шестерни и трубы. Только SVG и CSS, без частиц и вспышек. */
export function FactoryBackdrop() {
  const teeth = Array.from({ length: 10 }, (_, i) => i * 36);
  const gear = (cx: number, cy: number, r: number, className: string) => (
    <g className={className} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      {teeth.map((angle) => (
        <rect key={angle} x={cx - 4} y={cy - r - 7} width="8" height="12" rx="2" transform={`rotate(${angle} ${cx} ${cy})`} />
      ))}
      <circle cx={cx} cy={cy} r={r} />
      <circle cx={cx} cy={cy} r={r * 0.35} className="rr-alias-gear-hole" />
    </g>
  );
  return (
    <svg className="rr-alias-backdrop" viewBox="0 0 1000 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path d="M0 520 H1000" className="rr-alias-pipe" />
      <path d="M80 0 V160 H260" className="rr-alias-pipe" />
      <path d="M940 0 V90 H780" className="rr-alias-pipe" />
      {gear(900, 470, 46, "rr-alias-gear")}
      {gear(820, 520, 28, "rr-alias-gear rr-alias-gear--reverse")}
      {gear(70, 300, 34, "rr-alias-gear")}
    </svg>
  );
}

const SHAPES: Record<TeamShape, ReactNode> = {
  gear: <circle cx="12" cy="12" r="8" />,
  triangle: <path d="M12 3 L21 20 H3 Z" />,
  square: <rect x="4" y="4" width="16" height="16" rx="2" />,
  hexagon: <path d="M7 3 H17 L22 12 L17 21 H7 L2 12 Z" />,
};

/** Значок команды: своя форма и цвет. Цвет не единственный признак — форма различима и без него. */
export function TeamBadge({ team, size = 24, label = true }: { team: Pick<ViewTeam, "shape" | "color" | "name">; size?: number; label?: boolean }) {
  return (
    <span className="rr-alias-badge">
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={`rr-alias-badge-shape rr-alias-badge-shape--${team.shape}`}>
        <g fill={team.color} stroke="#322741" strokeWidth="1.6">
          {SHAPES[team.shape]}
        </g>
      </svg>
      {label ? <span>{team.name}</span> : <span className="rr-alias-sr">{team.name}</span>}
    </span>
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

export function PlayerChip({ player, me, children, highlight }: { player: ViewParticipant; me: boolean; children?: ReactNode; highlight?: boolean }) {
  const status = player.left ? "вышел" : player.online ? "" : "не в сети";
  return (
    <li className={`rr-alias-player${highlight ? " is-active" : ""}${player.online ? "" : " is-offline"}`}>
      <span className="rr-alias-avatar" aria-hidden="true">
        {initials(player.username)}
      </span>
      <span className="rr-alias-player-name">
        <PlayerName id={player.id} name={player.username} />
        {me ? " (вы)" : ""}
        {player.isHost ? <span className="rr-alias-tag">ведущий</span> : null}
        {status ? <span className="rr-alias-tag rr-alias-tag--muted">{status}</span> : null}
      </span>
      {children}
    </li>
  );
}

/** Конвейер: лента с роликами и коробкой текущей карточки. На телефоне — одна карточка. */
export function Conveyor({ children, moving }: { children: ReactNode; moving: boolean }) {
  return (
    <div className={`rr-alias-conveyor${moving ? " is-moving" : ""}`}>
      <div className="rr-alias-conveyor-slot">{children}</div>
      <svg className="rr-alias-belt" viewBox="0 0 600 40" preserveAspectRatio="none" aria-hidden="true">
        <rect x="0" y="6" width="600" height="20" rx="10" className="rr-alias-belt-body" />
        <path d="M10 16 H590" className="rr-alias-belt-stripes" />
        {Array.from({ length: 7 }, (_, i) => (
          <circle key={i} cx={40 + i * 87} cy="16" r="7" className="rr-alias-belt-roller" />
        ))}
      </svg>
    </div>
  );
}

export function ErrorNote({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null;
  return (
    <div className="rr-alias-error" role="alert">
      <span>{message}</span>
      <button type="button" className="rr-alias-icon-btn" onClick={onClose} aria-label="Скрыть сообщение об ошибке">
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
