import { useCallback, useEffect, useRef } from "react";
/** Подстройте сигнатуру существующего useLive в одном месте интеграции.
 * useHostLive должен вызывать callback на сигнале /api/updates.
 * Никакие State или ответы через обновления не передаются.
 */
export function createDurakUseLive(
  useHostLive: (callback: () => void) => void,
) {
  return function useDurakLive(reload: () => Promise<void>) {
    const latest = useRef(reload);
    latest.current = reload;
    const refresh = useCallback(() => {
      void latest.current().catch(() => {
        /* Ошибка связи показывается оболочкой, reload должен обновлять connection. */
      });
    }, []);
    useHostLive(refresh);
    // Heartbeat поддерживает серверное присутствие даже если событий нет.
    // Production-уведомления по-прежнему обслуживает useLive сайта.
    useEffect(() => {
      const t = setInterval(refresh, 10000);
      return () => clearInterval(t);
    }, [refresh]);
  };
}
