// Entry point for the reminder scheduler Lambda. The build script compiles this file to
// build/push/index.js, the same way api-handler.ts becomes the API Lambda.
import type { Context } from 'aws-lambda';
import { runReminders } from './src/calendar/reminders';
import { runCalendarRefresh } from './src/calendar/refresh';
import { initPush } from './src/push/init';
import { getSender } from './src/push/registry';
import { runSchedule } from './src/push/scheduler';
import { initStore } from './src/store';

const errorName = (error: unknown): string => (error instanceof Error ? error.name : 'Error');

// The hourly rule sends the default scheduled event, which has no `job`; the five-minute rule sends { job: 'reminders' }.
// A run of one kind never does the other's work, so digests and nudges are never sent twice. The hourly run is the schedule, then
// the calendar feed refresh, which uses the time the function has left and starts no new feed in its last 30 seconds. Neither stops
// the other, and a failure is logged by its name only.
export const handler = async (input?: Record<string, unknown>, context?: Pick<Context, 'getRemainingTimeInMillis'>): Promise<void> => {
  const job = input?.job;
  if (job !== undefined && job !== 'reminders') {
    console.error('The scheduler was started with a job it does not know');
    return;
  }
  const store = await initStore();
  await initPush();
  if (job === 'reminders') {
    await runReminders(store, getSender(), new Date());
    return;
  }
  const deadline = context ? Date.now() + context.getRemainingTimeInMillis() : Number.POSITIVE_INFINITY;
  try {
    await runSchedule(store, getSender(), new Date());
  } catch (error) {
    console.error(`The schedule failed: ${errorName(error)}`);
  }
  try {
    await runCalendarRefresh(store, new Date(), deadline);
  } catch (error) {
    console.error(`The calendar refresh failed: ${errorName(error)}`);
  }
};
