import { randomUUID } from 'node:crypto';
import { extraHostsFrom } from './allowedHosts';
import type { FeedDeps } from './feeds';
import { fetchFeed } from './fetcher';
import { parseIcs } from './parseIcs';
import { loadCalendarKey } from './secret';
import type { CalendarKeyDeps } from './secret';

// Where the real fetcher, parser and key meet the feed code. Routes and jobs ask for the dependencies here, and a test sets its own.

let keyEnv: NodeJS.ProcessEnv | undefined;
let keyDeps: CalendarKeyDeps = {};
let loadedKey: Promise<Buffer | undefined> | undefined;
let override: FeedDeps | undefined;

// The container names its data folder (where calendar.key lives) and its own environment. The Lambdas need nothing: the key comes from
// the SSM parameter named in the environment.
export function configureCalendar(env: NodeJS.ProcessEnv, deps: CalendarKeyDeps = {}): void {
  keyEnv = env;
  keyDeps = deps;
  loadedKey = undefined;
}

// The key is read the first time something needs it, and kept once found. A missing key is read again next time, so fixing it needs
// no restart.
function key(): Promise<Buffer | undefined> {
  loadedKey ??= loadCalendarKey(keyEnv ?? process.env, keyDeps).then(found => {
    if (!found) loadedKey = undefined;
    return found;
  });
  return loadedKey;
}

export function realFeedDeps(): FeedDeps {
  return {
    readLink: fetchFeed,
    parse: parseIcs,
    loadKey: key,
    extraHosts: extraHostsFrom(keyEnv ?? process.env),
    newId: randomUUID,
  };
}

export const getFeedDeps = (): FeedDeps => override ?? realFeedDeps();

export function setFeedDeps(deps: FeedDeps | undefined): void {
  override = deps;
}
