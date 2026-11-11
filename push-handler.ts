// Entry point for the reminder scheduler Lambda. The build script compiles this file to
// build/push/index.js, the same way api-handler.ts becomes the API Lambda.
// Step 6 replaces this with the real scheduler.
export const handler = async (): Promise<void> => {
  console.log('push scheduler: not implemented yet');
};
