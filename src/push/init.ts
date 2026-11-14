import { setSender } from './registry';
import { loadVapid, type Vapid, type VapidDeps } from './vapid';
import { createWebPushSender } from './webPushSender';

let loaded: Promise<Vapid | undefined> | undefined;

// Loads the keys once and sets the sender for this process. Safe to call from every entry point: the first call does the work.
export function initPush(env: NodeJS.ProcessEnv = process.env, deps: VapidDeps = {}): Promise<Vapid | undefined> {
  loaded ??= loadVapid(env, deps).then(vapid => {
    setSender(vapid ? createWebPushSender(vapid) : undefined);
    return vapid;
  });
  return loaded;
}

// A new server (or a test) starts from nothing: no sender, and the keys are read again.
export function resetPush(): void {
  loaded = undefined;
  setSender(undefined);
}
