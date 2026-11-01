import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, useAuth } from '../api';
export type Preferences = { theme: 'light' | 'dark' | 'system'; notifications: boolean };
const defaults: Preferences = { theme: 'system', notifications: true };
function local(): Preferences {
  try {
    const v = JSON.parse(localStorage.getItem('rr-preferences') || 'null');
    return v && ['light', 'dark', 'system'].includes(v.theme) && typeof v.notifications === 'boolean'
      ? v
      : defaults;
  } catch {
    return defaults;
  }
}
export function initializeTheme(p = local()) {
  const dark =
    p.theme === 'dark' || (p.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
const Context = createContext<{ prefs: Preferences; save: (p: Preferences) => Promise<void> }>({
  prefs: defaults,
  save: async () => {},
});
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth(),
    [prefs, setPrefs] = useState(local);
  function apply(p: Preferences) {
    setPrefs(p);
    initializeTheme(p);
    try {
      localStorage.setItem('rr-preferences', JSON.stringify(p));
    } catch {}
  }
  useEffect(() => {
    let active = true;
    if (user)
      void api<Preferences>('/preferences')
        .then((p) => {
          if (active) apply(p);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);
  useEffect(() => {
    initializeTheme(prefs);
    const media = matchMedia('(prefers-color-scheme: dark)'),
      change = () => initializeTheme(prefs);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, [prefs]);
  useEffect(() => {
    const changed = (e: StorageEvent) => {
      if (e.key === 'rr-preferences') apply(local());
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, []);
  async function save(p: Preferences) {
    if (user) await api('/preferences', { method: 'PATCH', body: JSON.stringify(p) });
    apply(p);
  }
  return <Context.Provider value={{ prefs, save }}>{children}</Context.Provider>;
}
export const usePreferences = () => useContext(Context);
export function PreferenceSettings() {
  const { prefs, save } = usePreferences(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function update(p: Preferences) {
    setBusy(true);
    setError('');
    try {
      await save(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rr-panel rr-settings-panel">
      <div className="rr-setting-row">
        <div>
          <h3>Тема оформления</h3>
          <p>Настройка сохраняется в аккаунте и применяется на других устройствах после входа.</p>
        </div>
        <select
          aria-label="Тема оформления"
          value={prefs.theme}
          disabled={busy}
          onChange={(e) => void update({ ...prefs, theme: e.target.value as Preferences['theme'] })}
        >
          <option value="light">Светлая</option>
          <option value="dark">Тёмная</option>
          <option value="system">Как на устройстве</option>
        </select>
      </div>
      <div className="rr-setting-row">
        <div>
          <h3>Уведомления</h3>
          <p>Заявки в друзья, приглашения и начало партии. История доступна по значку колокольчика.</p>
        </div>
        <button
          role="switch"
          aria-label="Уведомления"
          aria-checked={prefs.notifications}
          disabled={busy}
          onClick={() => void update({ ...prefs, notifications: !prefs.notifications })}
        >
          {prefs.notifications ? 'Включены' : 'Выключены'}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
