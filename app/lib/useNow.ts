import { useEffect, useState } from 'react';

// The time now, kept up to date once a minute, so a screen that says what is on now does not go on saying it after it has changed.
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
