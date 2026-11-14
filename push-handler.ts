// Entry point for the reminder scheduler Lambda. The build script compiles this file to
// build/push/index.js, the same way api-handler.ts becomes the API Lambda.
import { initPush } from './src/push/init';
import { getSender } from './src/push/registry';
import { runSchedule } from './src/push/scheduler';
import { initStore } from './src/store';

export const handler = async (): Promise<void> => {
  const store = await initStore();
  await initPush();
  await runSchedule(store, getSender(), new Date());
};
