import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
export type User = {
  id: string;
  email?: string;
  username: string;
  role: 'admin' | 'editor' | 'moderator' | 'player';
  xp: number;
  avatar: string;
  createdAt?: string;
  verified?: boolean;
};
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const value = await response
    .json()
    .catch(() => ({ error: 'Сервер вернул неожиданный ответ. Обновите страницу.' }));
  if (!response.ok) throw new Error(value.error || `Ошибка запроса (${response.status})`);
  return value as T;
}
type Auth = {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};
const AuthContext = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true);
  const refresh = async () => {
    try {
      setUser((await api<{ user: User | null }>('/auth/me')).user);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    refresh().catch(() => setLoading(false));
  }, []);
  const login = async (email: string, password: string) => {
    setUser(
      (
        await api<{ user: User }>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        })
      ).user,
    );
  };
  const register = async (email: string, password: string, username: string) => {
    setUser(
      (
        await api<{ user: User }>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, username }),
        })
      ).user,
    );
  };
  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('AuthProvider required');
  return ctx;
}
export function useLive(callback: () => void) {
  const { user } = useAuth();
  const ref = useRef(callback);
  ref.current = callback;
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!user) return;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const call = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => ref.current(), 75);
    };
    const polling =
      location.hostname.endsWith('.workers.dev') ||
      location.hostname.endsWith('.trycloudflare.com') ||
      new URLSearchParams(location.search).get('transport') === 'poll';
    const controller = new AbortController();
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    if (polling) {
      let version = '';
      const poll = async () => {
        if (controller.signal.aborted) return;
        try {
          const next = await api<{ version: string }>(`/updates?after=${encodeURIComponent(version)}`, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          setConnected(true);
          if (next.version !== version) call();
          version = next.version;
          retry = setTimeout(poll, 100);
        } catch {
          if (controller.signal.aborted) return;
          setConnected(false);
          retry = setTimeout(poll, 2000);
        }
      };
      void poll();
    } else {
      source = new EventSource('/api/events');
      source.onopen = () => {
        setConnected(true);
        call();
      };
      source.addEventListener('update', call);
      source.onerror = () => setConnected(false);
    }
    const interval = setInterval(call, 12000);
    window.addEventListener('online', call);
    return () => {
      source?.close();
      controller.abort();
      clearTimeout(retry);
      clearTimeout(timeout);
      clearInterval(interval);
      window.removeEventListener('online', call);
      setConnected(false);
    };
  }, [user?.id]);
  return { connected };
}
