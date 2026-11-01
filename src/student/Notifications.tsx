import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api, useAuth } from '../api';
import { go, useResource } from './common';
import { usePreferences } from './preferences';
type Notice = { id: string; title: string; body: string; link: string; readAt: number | null };
export function Notifications() {
  const { user } = useAuth(),
    { prefs } = usePreferences(),
    feed = useResource<{ notifications: Notice[] }>(user ? '/notifications' : null, true),
    [open, setOpen] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!user || !prefs.notifications) return;
    const refresh = () => {
      if (!document.hidden) void feed.reload();
    };
    const t = setInterval(refresh, 15000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [user?.id, prefs.notifications, feed.reload]);
  if (!user) return null;
  const unread = feed.data?.notifications.filter((n) => !n.readAt).length || 0;
  async function read(id?: string, link?: string) {
    try {
      await api('/notifications/read', { method: 'POST', body: JSON.stringify(id ? { id } : {}) });
      await feed.reload();
      if (link) {
        setOpen(false);
        go(link);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="rr-notifications">
      <button
        className="rr-icon-button"
        aria-label={`Уведомления${unread ? ', непрочитанных: ' + unread : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Bell size={21} />
        {prefs.notifications && unread > 0 && <span className="rr-notification-count">{unread}</span>}
      </button>
      {open && (
        <section className="rr-notification-tray" aria-label="Центр уведомлений">
          <div className="rr-section-heading">
            <h2>Уведомления</h2>
            <button onClick={() => setOpen(false)} aria-label="Закрыть уведомления">
              ×
            </button>
          </div>
          <button onClick={() => void read()}>Прочитать все</button>
          {(error || feed.error) && <p role="alert">{error || feed.error}</p>}
          {!feed.data?.notifications.length && <p>Пока нет уведомлений.</p>}
          {feed.data?.notifications.map((n) => (
            <button
              className={'rr-notification-item' + (!n.readAt ? ' is-unread' : '')}
              key={n.id}
              onClick={() => void read(n.id, n.link)}
            >
              <strong>{n.title}</strong>
              <span>{n.body}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
