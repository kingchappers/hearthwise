import { useEffect } from 'react';

// Asks the browser to keep the screen awake while the cooking view is open. Browsers release the lock when a page is hidden, so it is
// asked for again when the page becomes visible. Where wake locks are unsupported, or refused, nothing happens.
export function useWakeLock(): void {
  useEffect(() => {
    const wakeLock = navigator.wakeLock;
    if (!wakeLock) return undefined;
    let sentinel: WakeLockSentinel | undefined;
    let left = false;

    async function acquire(): Promise<void> {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return;
      try {
        const lock = await wakeLock.request('screen');
        if (left) {
          await lock.release();
          return;
        }
        sentinel = lock;
      } catch (error) {
        console.error('wakeLock: the screen could not be kept awake', error);
      }
    }

    void acquire();
    const onVisible = (): void => { void acquire(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      left = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch((error: unknown) => console.error('wakeLock: could not release the lock', error));
    };
  }, []);
}
