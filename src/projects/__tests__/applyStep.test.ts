import { describe, expect, it } from 'vitest';
import { applyStepDelete, applyStepWrite } from '../applyStep';
import type { Step } from '../types';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';
const ids = { projectId: 'p1', id: 's1' };

const made = (): Step => applyStepWrite(undefined, ids, { text: { value: 'Lift the boards', at: 1000 }, position: { value: 'i', at: 1000 } }, U1, NOW).step!;

describe('applyStepWrite', () => {
  it('creates a not-started step with its position and field times', () => {
    const { result, step } = applyStepWrite(undefined, ids, { text: { value: 'Lift the boards', at: 1000 }, position: { value: 'i', at: 1000 } }, U1, NOW);
    expect(result).toBe('created');
    expect(step).toMatchObject({ id: 's1', projectId: 'p1', text: 'Lift the boards', state: 'todo', position: 'i', createdBy: U1, fieldTimes: { text: 1000, position: 1000 } });
  });

  it('needs both a text and a position to create', () => {
    expect(applyStepWrite(undefined, ids, { text: { value: 'x', at: 1 } }, U1, NOW).result).toBe('noop');
    expect(applyStepWrite(undefined, ids, { position: { value: 'i', at: 1 } }, U1, NOW).result).toBe('noop');
  });

  it('takes each field on its own time, so two edits to different fields both stay', () => {
    const first = made();
    const a = applyStepWrite(first, ids, { text: { value: 'Lift the decking boards', at: 3000 } }, U1, NOW).step!;
    const b = applyStepWrite(a, ids, { position: { value: 'j', at: 2000 } }, U2, NOW).step!;
    expect(b).toMatchObject({ text: 'Lift the decking boards', position: 'j' });
  });

  it('lists an older edit of the same field as stale and keeps the newer one', () => {
    const first = made();
    const newer = applyStepWrite(first, ids, { text: { value: 'Alex wording', at: 3000 } }, U2, NOW).step!;
    const older = applyStepWrite(newer, ids, { text: { value: 'Sam wording', at: 2000 } }, U1, NOW);
    expect(older.result).toBe('noop');
    expect(older.stale).toEqual(['text']);
    expect(older.step?.text).toBe('Alex wording');
  });

  it('sets and clears a note', () => {
    const noted = applyStepWrite(made(), ids, { note: { value: 'Mind the nails', at: 2000 } }, U1, NOW).step!;
    expect(noted.note).toBe('Mind the nails');
    expect('note' in applyStepWrite(noted, ids, { note: { value: null, at: 3000 } }, U1, NOW).step!).toBe(false);
  });

  it('done clears the holder and records who and when, and todo clears that again', () => {
    const held = { ...made(), takenBy: U2, takenAt: 1500 };
    const done = applyStepWrite(held, ids, { state: { value: 'done', at: 4000 } }, U1, NOW).step!;
    expect(done).toMatchObject({ state: 'done', doneBy: U1, doneAt: 4000 });
    expect('takenBy' in done).toBe(false);
    expect('takenAt' in done).toBe(false);
    const again = applyStepWrite(done, ids, { state: { value: 'todo', at: 5000 } }, U2, NOW).step!;
    expect(again.state).toBe('todo');
    expect('doneBy' in again).toBe(false);
    expect('doneAt' in again).toBe(false);
  });

  it('never changes a hold on an edit of other fields', () => {
    const held = { ...made(), takenBy: U2, takenAt: 1500 };
    const edited = applyStepWrite(held, ids, { text: { value: 'New', at: 3000 }, position: { value: 'k', at: 3000 } }, U1, NOW).step!;
    expect(edited).toMatchObject({ takenBy: U2, takenAt: 1500 });
  });

  it('is final for edits once deleted', () => {
    const deleted = applyStepDelete(made(), U2, NOW).step!;
    expect(applyStepWrite(deleted, ids, { text: { value: 'Back', at: 9000 } }, U1, NOW).result).toBe('gone');
  });

  it('clamps a time in the future', () => {
    const { step } = applyStepWrite(made(), ids, { text: { value: 'Later', at: NOW + 3_600_000 } }, U1, NOW);
    expect(step?.fieldTimes.text).toBe(NOW);
  });

  it('gives one result whatever order edit writes arrive in', () => {
    const writes = [
      { text: { value: 'a', at: 2000 } }, { text: { value: 'b', at: 3000 } }, { position: { value: 'm', at: 2500 } }, { note: { value: 'n', at: 2200 } },
    ];
    const run = (order: number[]): Step => order.reduce<Step>((step, i) => applyStepWrite(step, ids, writes[i], U1, NOW).step ?? step, made());
    const base = run([0, 1, 2, 3]);
    for (const order of [[3, 2, 1, 0], [1, 0, 3, 2], [2, 3, 0, 1]]) {
      const other = run(order);
      expect({ text: other.text, note: other.note, position: other.position, fieldTimes: other.fieldTimes })
        .toEqual({ text: base.text, note: base.note, position: base.position, fieldTimes: base.fieldTimes });
    }
  });
});

describe('applyStepDelete', () => {
  it('tombstones with a 30-day expiry, and is a no-op twice', () => {
    const deleted = applyStepDelete(made(), U2, NOW);
    expect(deleted.step).toMatchObject({ deletedAt: NOW, deletedBy: U2, expiresAt: Math.floor(NOW / 1000) + 30 * 86400 });
    expect(applyStepDelete(deleted.step, U1, NOW).result).toBe('noop');
    expect(applyStepDelete(undefined, U1, NOW).result).toBe('noop');
  });
});

describe('a step\'s energy tag', () => {
  it('is set by a write, the newest wins, an older one is listed as stale, and null takes it off', () => {
    const set = applyStepWrite(made(), ids, { energy: { value: 'small', at: 2000 } }, U2, NOW);
    expect(set.step?.energy).toBe('small');
    const stale = applyStepWrite(set.step, ids, { energy: { value: 'big', at: 1500 } }, U1, NOW);
    expect(stale.result).toBe('noop');
    expect(stale.stale).toEqual(['energy']);
    const cleared = applyStepWrite(set.step, ids, { energy: { value: null, at: 3000 } }, U1, NOW);
    expect('energy' in cleared.step!).toBe(false);
  });

  it('can be given when the step is made, and never touches a hold', () => {
    const created = applyStepWrite(undefined, ids, { text: { value: 'Lift', at: 1000 }, position: { value: 'i', at: 1000 }, energy: { value: 'big', at: 1000 } }, U1, NOW);
    expect(created.step?.energy).toBe('big');
    const held = { ...created.step!, takenBy: U2, takenAt: 5 };
    expect(applyStepWrite(held, ids, { energy: { value: 'small', at: 2000 } }, U1, NOW).step).toMatchObject({ takenBy: U2, energy: 'small' });
  });
});
