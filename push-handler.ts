// Entry point for the reminder scheduler Lambda. The build script compiles this file to
// build/push/index.js, the same way api-handler.ts becomes the API Lambda.
import { runReminders } from './src/calendar/reminders';
import { initPush } from './src/push/init';
import { getSender } from './src/push/registry';
import { runSchedule } from './src/push/scheduler';
import { initStore } from './src/store';

// The hourly rule sends the default scheduled event, which has no `job`; the five-minute rule sends { job: 'reminders' }.
// A run of one kind never does the other's work, so digests and nudges are never sent twice.
export const handler = async (input?: { job?: unknown }): Promise<void> => {
  const job = input?.job;
  if (job !== undefined && job !== 'reminders') {
    console.error('The scheduler was started with a job it does not know');
    return;
  }
  const store = await initStore();
  await initPush();
  if (job === 'reminders') await runReminders(store, getSender(), new Date());
  else await runSchedule(store, getSender(), new Date());
};
