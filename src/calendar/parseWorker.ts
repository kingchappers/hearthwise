import { parentPort, workerData } from 'node:worker_threads';
import { parseCore, type ParseWindow } from './parseCore';

// The thread that reads a calendar file. It is given the text and the window and nothing else (its environment is empty), and
// posts back plain data. The logic is in parseCore.
if (parentPort) {
  const { text, range } = workerData as { text: string; range: ParseWindow };
  parentPort.postMessage(parseCore(text, range));
}
