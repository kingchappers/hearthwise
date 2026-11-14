import type { PushSender } from './sender';

// The one sender the API uses, set at start-up when VAPID keys exist. With none set, nothing is ever pushed.
let active: PushSender | undefined;

export const getSender = (): PushSender | undefined => active;
export function setSender(sender: PushSender | undefined): void {
  active = sender;
}
