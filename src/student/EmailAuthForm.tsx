import { useEffect, useState, type FormEvent } from 'react';
import { api, useAuth } from '../api';
import { useResource, ErrorNotice, message } from './common';
export function EmailAuthForm({ onSuccess }: { onSuccess?: () => void }) {
  const auth = useAuth(),
    status = useResource<{ emailCodesEnabled: boolean; emailCodesRequired: boolean; smsEnabled: boolean }>(
      '/auth/status',
    ),
    [mode, setMode] = useState<'login' | 'register' | 'reset'>('register'),
    [email, setEmail] = useState(''),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [visible, setVisible] = useState(false),
    [until, setUntil] = useState(0),
    [now, setNow] = useState(Date.now());
  const enabled = !!status.data?.emailCodesEnabled;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  function change(next: typeof mode) {
    setMode(next);
    setCode('');
    setError('');
    setNotice('');
    setPassword('');
  }
  async function sendCode() {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ message: string }>('/auth/email-code', {
        method: 'POST',
        body: JSON.stringify({ email, purpose: mode === 'reset' ? 'reset' : 'register' }),
      });
      setNotice(r.message);
      setUntil(Date.now() + 60000);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') await auth.login(email, password);
      else if (mode === 'reset') {
        await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({ email, password, code }),
        });
        change('login');
        setNotice('Пароль обновлён. Войдите с новым паролем. Старые сеансы завершены.');
        return;
      } else {
        await api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, username, password, ...(enabled ? { code } : {}) }),
        });
        await auth.refresh();
      }
      onSuccess?.();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="rr-auth-form" onSubmit={submit}>
      <div className="rr-auth-tabs">
        <button
          type="button"
          className={mode === 'register' ? 'active' : ''}
          onClick={() => change('register')}
        >
          Регистрация
        </button>
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => change('login')}>
          Вход
        </button>
      </div>
      <h2>
        {mode === 'register'
          ? 'Твоя история начинается здесь'
          : mode === 'reset'
            ? 'Восстановить доступ'
            : 'Рады снова видеть тебя'}
      </h2>
      <p>
        {mode === 'reset'
          ? 'Код придёт на почту, указанную при регистрации.'
          : 'Вход по электронной почте. Номер телефона не требуется.'}
      </p>
      {mode === 'register' && (
        <label>
          Имя игрока
          <input
            name="username"
            autoComplete="nickname"
            required
            minLength={2}
            maxLength={40}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
      )}
      <label>
        Электронная почта
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setCode('');
            setNotice('');
          }}
        />
      </label>
      <label>
        {mode === 'reset' ? 'Новый пароль' : 'Пароль'}
        <div className="rr-password-field">
          <input
            type={visible ? 'text' : 'password'}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'login' ? 1 : 10}
            maxLength={128}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
            onClick={() => setVisible(!visible)}
          >
            {visible ? 'Скрыть' : 'Показать'}
          </button>
        </div>
      </label>
      {mode !== 'login' && enabled && (
        <>
          <label>
            Код из письма
            <input
              aria-label="Код из письма"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          </label>
          <button
            className="rr-button secondary"
            type="button"
            disabled={busy || until > now || !email.includes('@')}
            onClick={() => void sendCode()}
          >
            {until > now
              ? 'Повторная отправка через ' + Math.ceil((until - now) / 1000) + ' с'
              : 'Получить код на почту'}
          </button>
          <small>Код действует 10 минут. Проверьте также папку «Спам».</small>
        </>
      )}
      {mode === 'reset' && !enabled && (
        <p role="status">
          Отправка кодов ещё не подключена администратором. Существующий вход по паролю продолжает работать.
        </p>
      )}
      <ErrorNotice text={error || status.error} />
      {notice && <p role="status">{notice}</p>}
      <button
        className="rr-button primary full"
        disabled={
          busy ||
          status.loading ||
          ((mode === 'reset' || (mode === 'register' && !!status.data?.emailCodesRequired)) && !enabled)
        }
      >
        {busy
          ? 'Подождите…'
          : mode === 'register'
            ? 'Создать аккаунт'
            : mode === 'reset'
              ? 'Обновить пароль'
              : 'Войти'}
      </button>
      {mode === 'login' && (
        <button className="rr-button secondary" type="button" onClick={() => change('reset')}>
          Забыли пароль?
        </button>
      )}
      {mode === 'reset' && (
        <button type="button" className="rr-button secondary" onClick={() => change('login')}>
          Вернуться ко входу
        </button>
      )}
      <small className="rr-auth-note">
        {enabled
          ? 'Регистрация подтверждается одноразовым кодом из письма.'
          : 'Регистрация по почте и паролю. Подтверждение кодом появится после подключения почтового сервиса.'}
      </small>
    </form>
  );
}
