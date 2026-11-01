import { createContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, LoaderCircle, X } from 'lucide-react';
import { api } from '../api';

export const ConnectionContext = createContext(false);

export const go = (path: string) => {
  window.location.hash = path;
};
export const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
export const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось выполнить действие. Попробуйте ещё раз.';
export function useResource<T>(path: string | null, live = false) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const pathRef = useRef(path);
  pathRef.current = path;
  const requestId = useRef(0);
  const reload = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    try {
      const next = await api<T>(path);
      if (id === requestId.current && pathRef.current === path) {
        setData(next);
        setError('');
      }
    } catch (e) {
      if (id === requestId.current && pathRef.current === path) setError(message(e));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path]);
  useEffect(() => {
    setData(null);
    setLoading(true);
    void reload();
    return () => {
      requestId.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (!live) return;
    const handler = () => {
      void reload();
    };
    window.addEventListener('rr-live', handler);
    return () => window.removeEventListener('rr-live', handler);
  }, [live, reload]);
  return { data, error, loading, reload, setData };
}
export function Avatar({ name, url, size = 'normal' }: { name: string; url?: string; size?: string }) {
  return (
    <span className={`rr-avatar ${size}`} aria-hidden="true">
      {url && url.startsWith('/') ? <img src={url} alt="" /> : name.trim().slice(0, 2).toUpperCase()}
    </span>
  );
}
export function ErrorNotice({ text }: { text?: string }) {
  return text ? (
    <div className="rr-notice error" role="alert">
      {text}
    </div>
  ) : null;
}
export function Notice({ children }: { children: ReactNode }) {
  return <div className="rr-notice">{children}</div>;
}
export function Loading() {
  return (
    <div className="rr-loading" role="status">
      <LoaderCircle size={22} className="rr-spin" /> Загружаем…
    </div>
  );
}
export function Empty({
  icon,
  heading,
  children,
  action,
}: {
  icon?: ReactNode;
  heading: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rr-empty">
      {icon && <span className="rr-empty-icon">{icon}</span>}
      <h3>{heading}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  back?: string;
}) {
  return (
    <header className="rr-page-header">
      {back && (
        <button className="rr-text-button rr-back" onClick={() => go(back)}>
          <ArrowLeft size={16} /> Назад
        </button>
      )}
      <div>
        {eyebrow && <p className="rr-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="rr-description">{description}</p>}
      </div>
      {action && <div className="rr-header-action">{action}</div>}
    </header>
  );
}
export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const root = ref.current;
    root?.querySelector<HTMLElement>('input,button,select,textarea')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const list = root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,textarea,select,a[href]',
        );
        if (!list?.length) return;
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="rr-modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="rr-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="rr-modal-heading">
          <h2>{title}</h2>
          <button className="rr-icon-button" aria-label="Закрыть" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function CopyButton({ value, label = 'Копировать ссылку' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false),
    [error, setError] = useState('');
  return (
    <>
      <button
        className="rr-button secondary small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(new URL(value, window.location.origin).href);
            setDone(true);
            setTimeout(() => setDone(false), 2200);
          } catch {
            setError('Скопируйте ссылку из поля рядом.');
          }
        }}
      >
        {done ? <Check size={15} /> : <Copy size={15} />} {done ? 'Скопировано' : label}
      </button>
      {error && <small>{error}</small>}
    </>
  );
}
export function ArrowLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <button className="rr-text-button" onClick={() => go(to)}>
      {children}
      <ArrowRight size={16} />
    </button>
  );
}
export function DateText({ value }: { value: unknown }) {
  const date = new Date(String(value ?? ''));
  return (
    <>
      {Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('ru-RU', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })}
    </>
  );
}
export function SpyArt({ small = false }: { small?: boolean }) {
  return (
    <div className={`rr-spy-art ${small ? 'small' : ''}`} aria-hidden="true">
      <div className="rr-orbit one" />
      <div className="rr-orbit two" />
      <span className="rr-star s1">✦</span>
      <span className="rr-star s2">✦</span>
      <div className="rr-spy-card back" />
      <div className="rr-spy-card front">
        <svg viewBox="0 0 160 150" fill="none">
          <path d="M31 69 47 27c2-5 9-7 14-3l19 12 20-12c5-4 12-2 14 3l16 42H31Z" fill="#252140" />
          <path d="m40 53 82 0 6 16H33l7-16Z" fill="#a391f3" />
          <path d="M19 72c25-14 98-14 123 0 5 3 3 9-3 10-29 8-92 8-121 0-6-1-5-7 1-10Z" fill="#252140" />
          <path
            d="M43 88c10-4 27-2 37 3 13-5 28-7 39-3l-7 25c-14 9-24 4-32-4-9 8-20 13-32 4l-5-25Z"
            fill="#252140"
          />
          <path d="m51 96 23 4-4 6-15-2-4-8Zm36 4 23-4-4 8-15 2-4-6Z" fill="#dcd4ff" />
          <path d="m63 121 17 11 17-11" stroke="#252140" strokeWidth="7" strokeLinecap="round" />
        </svg>
        <span>?</span>
      </div>
      <div className="rr-art-tag">
        <span /> Секретная роль
      </div>
    </div>
  );
}
