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
  const lock = useRef(false),
    command = useRef(crypto.randomUUID()),
    root = useRef<HTMLElement>(null);
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
    <div className="adm-overlay">
      <section
        ref={root}
        className="adm-modal"
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
        <form onSubmit={(e) => void save(e)}>
          <label className="adm-field">
            <span>Количество дней подряд</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="36500"
              step="1"
              required
              disabled={busy}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                command.current = crypto.randomUUID();
              }}
            />
          </label>
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
            Установится указанное число дней на сегодня. 0 сбрасывает серию. Дальше она продолжается при
            ежедневной активности; пропуск дня прерывает её. Общая серия с другом считается отдельно.
          </p>
          {error && (
            <p className="adm-error" role="alert">
              {error}
            </p>
          )}
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
