import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '../api';
export function StreakEditor({
  user,
  onClose,
  onSaved,
}: {
  user: { id: string; username: string; publicId?: string; streak: number };
  onClose: () => void;
  onSaved: (count: number) => void;
}) {
  const [value, setValue] = useState(String(user.streak)),
    [reason, setReason] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    height: window.visualViewport?.height ?? window.innerHeight,
    top: window.visualViewport?.offsetTop ?? 0,
  }));
  const lock = useRef(false),
    command = useRef(crypto.randomUUID()),
    root = useRef<HTMLElement>(null);
  useEffect(() => {
    const update = () =>
      setViewport({
        height: window.visualViewport?.height ?? window.innerHeight,
        top: window.visualViewport?.offsetTop ?? 0,
      });
    const visual = window.visualViewport;
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  useEffect(() => {
    if (error) root.current?.querySelector('[role="alert"]')?.scrollIntoView({ block: 'nearest' });
  }, [error]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement,
      overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    root.current?.querySelector('input')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !lock.current) onClose();
      if (e.key === 'Tab') {
        const fields = Array.from(
          root.current?.querySelectorAll<HTMLElement>('input,button,textarea') || [],
        ).filter((el) => !(el as HTMLButtonElement).disabled);
        const first = fields[0],
          last = fields[fields.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [onClose]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    const count = Number(value);
    if (!value.trim() || !Number.isInteger(count) || count < 0 || count > 36500) {
      setError('Введите целое число дней от 0 до 36 500.');
      return;
    }
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<{ after: number }>(`/admin/users/${user.id}/streak`, {
        method: 'POST',
        body: JSON.stringify({ count, reason, commandId: command.current }),
      });
      window.dispatchEvent(new Event('rr-live'));
      onSaved(result.after);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить серию.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="adm-overlay adm-streak-overlay"
      style={{ top: viewport.top, height: viewport.height, bottom: 'auto' }}
    >
      <section
        ref={root}
        className="adm-modal adm-streak-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adm-streak-title"
      >
        <h2 id="adm-streak-title">Изменение серии</h2>
        <p>
          <strong>{user.username}</strong> · ID {user.publicId ?? '—'}
        </p>
        <p>
          Сейчас: <strong>{user.streak} дн. подряд</strong>
        </p>
        <form noValidate onSubmit={(e) => void save(e)}>
          <div className="adm-streak-fields">
            {error && (
              <p className="adm-error" role="alert">
                {error}
              </p>
            )}
            <label className="adm-field">
              <span>Количество дней подряд</span>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                max="36500"
                step="1"
                required
                aria-describedby="adm-streak-range"
                disabled={busy}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  command.current = crypto.randomUUID();
                }}
              />
            </label>
            <small id="adm-streak-range">От 0 до 36 500 дней. 0 — сброс серии.</small>
            <label className="adm-field">
              <span>Причина изменения</span>
              <input
                maxLength={300}
                placeholder="Необязательно"
                disabled={busy}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  command.current = crypto.randomUUID();
                }}
              />
            </label>
            <p>
              Введи новое число и нажми «Сохранить серию». После сохранения появится сообщение с результатом.
            </p>
          </div>
          <div className="adm-actions">
            <button type="button" className="adm-btn" disabled={busy} onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="adm-btn primary" disabled={busy}>
              {busy ? 'Сохраняем…' : 'Сохранить серию'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
