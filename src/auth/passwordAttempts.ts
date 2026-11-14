// Single-process deployment on SQLite: every password attempt (login, invited sign-up) runs one at a time on this one
// chain. That makes the throttle's read-modify-write safe, queued attempts see the delay and are refused without
// hashing, and only one costly password hash runs at a time. A rejected task does not block the ones after it.
let queue: Promise<unknown> = Promise.resolve();

export function serialisedPasswordAttempt<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task);
  queue = result.catch(() => undefined);
  return result;
}
