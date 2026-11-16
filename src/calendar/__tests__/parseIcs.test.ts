import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { parseIcs, type WorkerLike } from '../parseIcs';
import type { ParseResult, ParseWindow } from '../parseCore';

const WINDOW: ParseWindow = { from: 0, to: 1000, now: 500, zone: 'Europe/London' };
const GOOD: ParseResult = { ok: true, occurrences: [], counts: { events: 0, skipped: 0, approx: 0, truncated: false } };

class FakeWorker extends EventEmitter implements WorkerLike {
  terminated = 0;
  terminate(): Promise<number> {
    this.terminated += 1;
    return Promise.resolve(1);
  }
}

describe('parseIcs', () => {
  it('gives the worker only the text and the window, and returns what it posts', async () => {
    const worker = new FakeWorker();
    const createWorker = vi.fn(() => worker);
    const pending = parseIcs('BEGIN:VCALENDAR', WINDOW, { createWorker });
    worker.emit('message', GOOD);
    await expect(pending).resolves.toEqual(GOOD);
    expect(createWorker).toHaveBeenCalledWith({ text: 'BEGIN:VCALENDAR', range: WINDOW });
    expect(worker.terminated).toBe(1);
  });

  it('gives too_big for a text over 2 MB without starting a worker', async () => {
    const createWorker = vi.fn(() => new FakeWorker());
    await expect(parseIcs('a'.repeat(2 * 1024 * 1024 + 1), WINDOW, { createWorker })).resolves.toEqual({ ok: false, internal: 'too_big' });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('terminates a worker that runs past the time limit and answers parse', async () => {
    const worker = new FakeWorker();
    await expect(parseIcs('x', WINDOW, { createWorker: () => worker, timeoutMs: 20 })).resolves.toEqual({ ok: false, internal: 'parse' });
    expect(worker.terminated).toBe(1);
  });

  it('answers parse when the worker fails, runs out of memory or exits without a result', async () => {
    for (const event of ['error', 'exit']) {
      const worker = new FakeWorker();
      const pending = parseIcs('x', WINDOW, { createWorker: () => worker, timeoutMs: 5000 });
      worker.emit(event, Object.assign(new Error('Worker terminated due to reaching memory limit'), { code: 'ERR_WORKER_OUT_OF_MEMORY' }));
      await expect(pending).resolves.toEqual({ ok: false, internal: 'parse' });
    }
  });

  it('answers parse when the worker cannot be started', async () => {
    await expect(parseIcs('x', WINDOW, { createWorker: () => { throw new Error('no'); } })).resolves.toEqual({ ok: false, internal: 'parse' });
  });

  it('ignores a result that is not a parse result', async () => {
    const worker = new FakeWorker();
    const pending = parseIcs('x', WINDOW, { createWorker: () => worker });
    worker.emit('message', { surprise: true });
    await expect(pending).resolves.toEqual({ ok: false, internal: 'parse' });
  });

  it('answers once, and does not throw for a late event', async () => {
    const worker = new FakeWorker();
    const pending = parseIcs('x', WINDOW, { createWorker: () => worker });
    worker.emit('message', GOOD);
    worker.emit('exit', 0);
    worker.emit('error', new Error('late'));
    await expect(pending).resolves.toEqual(GOOD);
  });

  it('runs at most two workers at once and queues the rest, whatever happens to them', async () => {
    const workers: FakeWorker[] = [];
    const createWorker = vi.fn(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });
    const results = Array.from({ length: 6 }, () => parseIcs('x', WINDOW, { createWorker, timeoutMs: 5000 }));
    await Promise.resolve();
    expect(workers).toHaveLength(2);

    workers[0].emit('message', GOOD);
    await results[0];
    expect(workers).toHaveLength(3);
    workers[1].emit('error', new Error('boom'));
    await results[1];
    expect(workers).toHaveLength(4);
    workers[2].emit('exit', 1);
    workers[3].emit('message', GOOD);
    await Promise.all([results[2], results[3]]);
    expect(workers).toHaveLength(6);
    workers[4].emit('message', GOOD);
    workers[5].emit('message', GOOD);
    const all = await Promise.all(results);
    expect(all.filter(result => result.ok)).toHaveLength(4);
  });

  it('frees its place when a worker cannot be started or runs past the limit', async () => {
    const stuck = [new FakeWorker(), new FakeWorker()];
    const first = parseIcs('x', WINDOW, { createWorker: () => stuck[0], timeoutMs: 20 });
    const second = parseIcs('x', WINDOW, { createWorker: () => stuck[1], timeoutMs: 20 });
    const broken = parseIcs('x', WINDOW, { createWorker: () => { throw new Error('no'); } });
    const good = new FakeWorker();
    const last = parseIcs('x', WINDOW, { createWorker: () => good, timeoutMs: 5000 });
    await expect(Promise.all([first, second, broken])).resolves.toEqual(Array(3).fill({ ok: false, internal: 'parse' }));
    good.emit('message', GOOD);
    await expect(last).resolves.toEqual(GOOD);
  });
});
