import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Mail, Copy, Users } from "lucide-react";
import type { RoomView } from "./client";
import type { GameProps } from "./Game";
import "./styles.css";
type LobbyProps = Omit<GameProps, "view"> & {
  view: GameProps["view"] | RoomView;
  onReady?: (ready: boolean) => Promise<void>;
  onStart?: () => Promise<void>;
};
export function Lobby({
  view,
  currentUserId: id,
  connection,
  onExit,
  onReady,
  onStart,
}: LobbyProps) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false);
  const members =
    "members" in view
      ? view.members
      : view.players.map((p) => ({ ...p, ready: true, online: true }));
  const me = members.find((m) => m.id === id);
  const ready = members.length >= 2 && members.every((m) => m.ready);
  const offline = connection !== "online";
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось выполнить действие",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rr-game-durak">
      <div className="rr-durak-shell">
        <header className="rr-durak-header">
          <button
            className="rr-durak-icon"
            aria-label="Выйти из комнаты"
            onClick={onExit}
          >
            <ArrowLeft />
          </button>
          <div>
            <small>РУССКИЙ ROYALE / ПЕРРОН ОТПРАВЛЕНИЯ</small>
            <h1>
              Почтовый экспресс<span>Лобби · Дурак</span>
            </h1>
          </div>
          <span className="rr-durak-pill">
            <Users size={16} />
            {members.length} / {view.settings.maxPlayers}
          </span>
        </header>
        {offline && (
          <div className="rr-durak-alert" role="status">
            {connection === "offline" ? "Нет связи" : "Восстанавливаем связь…"}
          </div>
        )}
        {error && (
          <div className="rr-durak-alert" role="alert">
            {error}
          </div>
        )}
        <main className="rr-durak-lobby-grid">
          <section className="rr-durak-lobby-art">
            <div className="rr-durak-postmark">
              ЭКСПРЕСС
              <br />
              <b>36</b>
              <br />
              БИЛЕТОВ
            </div>
            <Mail size={88} strokeWidth={1} />
            <small>НОЧНОЙ МАРШРУТ №03</small>
            <h2>
              Хорошая партия
              <br />
              начинается с письма.
            </h2>
            <p>
              Пригласите друзей, заберите билеты и отправляйтесь в путь. Козыри
              решают, но последнее слово — за вами.
            </p>
            <div className="rr-durak-lobby-tags">
              <span>2–6 игроков</span>
              <span>25 сек на ход</span>
              <span>Без перевода</span>
            </div>
          </section>
          <section className="rr-durak-panel">
            <small>ЗАЛ ОЖИДАНИЯ</small>
            <h2>{"name" in view ? view.name : "Ваша компания"}</h2>
            <p>Каждый пассажир отмечает готовность. Ведущий запускает поезд.</p>
            <div className="rr-durak-lobby-members">
              {members.map((m) => (
                <div key={m.id}>
                  <span className="rr-durak-avatar">
                    {m.username.slice(0, 1)}
                  </span>
                  <div>
                    <strong>
                      {m.username}
                      {m.id === id ? " · вы" : ""}
                    </strong>
                    <small>
                      {m.id === view.hostId
                        ? "Ведущий"
                        : m.online
                          ? "На перроне"
                          : "Нет связи"}
                    </small>
                  </div>
                  <span className={m.ready ? "rr-durak-ready" : ""}>
                    {m.ready ? (
                      <>
                        <Check size={16} /> Готов
                      </>
                    ) : (
                      "Ожидаем"
                    )}
                  </span>
                </div>
              ))}
              {members.length < 2 && (
                <div className="rr-durak-wait-seat">
                  <Users />
                  <span>Ждём второго игрока</span>
                </div>
              )}
            </div>
            <div className="rr-durak-lobby-settings">
              <span>Учебный бонус</span>
              <b>{view.settings.educational ? "Включён" : "Выключен"}</b>
            </div>
            <button
              className="rr-durak-secondary rr-durak-wide"
              onClick={() => {
                void navigator.clipboard
                  .writeText(location.href)
                  .then(() => setCopied(true))
                  .catch(() =>
                    setError("Скопируйте адрес из строки браузера."),
                  );
              }}
            >
              <Copy size={17} />
              {copied ? "Ссылка скопирована" : "Пригласить по ссылке"}
            </button>
            <div className="rr-durak-controls">
              <button
                className="rr-durak-secondary"
                disabled={offline || busy || !onReady}
                onClick={() => onReady && void run(() => onReady(!me?.ready))}
              >
                {me?.ready ? "Снять готовность" : "Я готов"}
              </button>
              {view.hostId === id && (
                <button
                  className="rr-durak-primary"
                  disabled={offline || busy || !ready || !onStart}
                  onClick={() => onStart && void run(onStart)}
                >
                  Начать партию <ArrowRight size={18} />
                </button>
              )}
            </div>
            <p aria-live="polite">
              {ready
                ? "Все готовы к отправлению."
                : `Готовы ${members.filter((m) => m.ready).length} из ${members.length}. Нужно минимум два игрока.`}
            </p>
          </section>
        </main>
        <footer className="rr-durak-footer">
          <span>РУССКИЙ ROYALE</span>
          <span>Карты хранятся на сервере. Чужие билеты — тайна.</span>
        </footer>
      </div>
    </div>
  );
}
