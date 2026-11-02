import { useEffect, useRef, useState } from 'react';
export function useServerTime(serverNow: number) {
  const clock = useRef({ server: serverNow, local: performance.now() });
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    clock.current = { server: serverNow, local: performance.now() };
    setNow(serverNow);
  }, [serverNow]);
  useEffect(() => {
    const timer = setInterval(
      () => setNow(clock.current.server + performance.now() - clock.current.local),
      250,
    );
    return () => clearInterval(timer);
  }, []);
  return now;
}
