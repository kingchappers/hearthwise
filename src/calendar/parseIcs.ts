import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { MAX_INPUT_CHARS, type ParseResult, type ParseWindow } from './parseCore';

// Reads a calendar file in a worker thread that is stopped if it runs past its time, so a hostile file can never hold the process.
// Never throws and never rejects: every failure is a result.

export const PARSE_TIMEOUT_MS = 5000;
const OLD_SPACE_MB = 128;

export interface WorkerLike {
  on(event: 'message' | 'error' | 'exit', listener: (...args: unknown[]) => void): unknown;
  terminate(): Promise<number>;
}

export interface WorkerInput {
  text: string;
  range: ParseWindow;
}

export interface ParseDeps {
  createWorker?: (input: WorkerInput) => WorkerLike;
  timeoutMs?: number;
}

// Starts the worker file with the limits every parse gets: no environment, no inherited flags, and a memory ceiling.
export function startWorker(file: string, input: WorkerInput): WorkerLike {
  return new Worker(file, {
    workerData: input,
    env: {},
    execArgv: [],
    resourceLimits: { maxOldGenerationSizeMb: OLD_SPACE_MB, maxYoungGenerationSizeMb: 16, stackSizeMb: 2 },
  });
}

// The compiled worker sits beside this file in every build.
const realWorker = (input: WorkerInput): WorkerLike => startWorker(path.join(__dirname, 'parseWorker.js'), input);

function isResult(value: unknown): value is ParseResult {
  return typeof value === 'object' && value !== null && typeof (value as { ok?: unknown }).ok === 'boolean';
}

const FAILED: ParseResult = { ok: false, internal: 'parse' };

// At most this many workers at once; the rest wait their turn. Each has a 128 MB ceiling.
export const MAX_WORKERS = 2;
let running = 0;
const waiting: Array<() => void> = [];

// The place goes straight to the next in line.
function release(): void {
  const next = waiting.shift();
  if (next) next();
  else running -= 1;
}

export function parseIcs(text: string, range: ParseWindow, deps: ParseDeps = {}): Promise<ParseResult> {
  if (typeof text !== 'string') return Promise.resolve(FAILED);
  if (text.length > MAX_INPUT_CHARS) return Promise.resolve({ ok: false, internal: 'too_big' });
  return new Promise<ParseResult>(resolve => {
    const start = (): void => {
      runWorker(text, range, deps).then(result => {
        release();
        resolve(result);
      });
    };
    if (running < MAX_WORKERS) {
      running += 1;
      start();
    } else waiting.push(start);
  });
}

function runWorker(text: string, range: ParseWindow, deps: ParseDeps): Promise<ParseResult> {
  return new Promise<ParseResult>(resolve => {
    let worker: WorkerLike;
    try {
      worker = (deps.createWorker ?? realWorker)({ text, range });
    } catch {
      resolve(FAILED);
      return;
    }
    let done = false;
    const finish = (result: ParseResult): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // A stopped worker's promise may reject; there is nothing to do about it.
      worker.terminate().catch(() => undefined);
      resolve(result);
    };
    const timer = setTimeout(() => finish(FAILED), deps.timeoutMs ?? PARSE_TIMEOUT_MS);
    worker.on('message', message => finish(isResult(message) ? message : FAILED));
    worker.on('error', () => finish(FAILED));
    worker.on('exit', () => finish(FAILED));
  });
}
