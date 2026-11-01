import { useCallback, useEffect, useMemo, useState } from "react";
import type { Envelope, GameProps } from "../../../shared/games/jeopardy/types";
import { roomClient } from "./client";
/** Pass a tiny wrapper around the existing src/api.tsx useLive hook. */
export type HostLiveHook = (onChange: () => void) => void;
export function useRoom(roomId: string, useHostLive: HostLiveHook) {
  const [data, setData] = useState<Envelope | null>(null),
    [connection, setConnection] =
      useState<GameProps["connection"]>("reconnecting"),
    [error, setError] = useState("");
  const client = useMemo(() => roomClient(roomId, setData), [roomId]);
  const refresh = useCallback(() => {
    if (!navigator.onLine) {
      setConnection("offline");
      return;
    }
    void client
      .refresh()
      .then(() => {
        setConnection("online");
        setError("");
      })
      .catch((e) => {
        setConnection("reconnecting");
        setError(
          e instanceof Error ? e.message : "Не удалось обновить комнату",
        );
      });
  }, [client]);
  useHostLive(refresh);
  useEffect(() => {
    setData(null);
    refresh();
    const heartbeat = setInterval(refresh, 10000);
    const offline = () => setConnection("offline");
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
    };
  }, [refresh]);
  return { data, connection, error, client, refresh };
}
