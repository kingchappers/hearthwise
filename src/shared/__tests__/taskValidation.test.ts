import { describe, expect, it } from 'vitest';
import {
  parseChecklist, parseClientTime, parseCompleteBody, parseCreateTask, parseDay, parseDeleteBody, parseMutationBody, parseNotes,
  parsePatchTask, parseProposalBody, parseRepeat, parseRestoreBody, parseTaskTitle, parseUuid,
} from '../taskValidation';

const ok = <T>(value: T) => ({ ok: true, value });
const bad = (field: string) => ({ ok: false, field });
const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const MUT = uuid(999);
const EDGE = 1_767_225_600_000; // 2026-01-01T00:00:00Z

describe('parseUuid', () => {
  it('accepts a UUID and refuses anything else, naming the field', () => {
    expect(parseUuid(uuid(1), 'id')).toEqual(ok(uuid(1)));
    expect(parseUuid('not-a-uuid', 'id')).toEqual(bad('id'));
    expect(parseUuid(undefined, 'taskId')).toEqual(bad('taskId'));
    expect(parseUuid('x'.repeat(10_000), 'id')).toEqual(bad('id'));
  });
});

describe('parseTaskTitle and parseNotes', () => {
  it('takes 1 to 120 characters after trimming', () => {
    expect(parseTaskTitle('  Hoover ')).toEqual(ok('Hoover'));
    expect(parseTaskTitle('x'.repeat(120))).toEqual(ok('x'.repeat(120)));
    expect(parseTaskTitle('x'.repeat(121))).toEqual(bad('title'));
    expect(parseTaskTitle('   ')).toEqual(bad('title'));
    expect(parseTaskTitle('')).toEqual(bad('title'));
    expect(parseTaskTitle('x'.repeat(10_000))).toEqual(bad('title'));
  });

  it('takes up to 2,000 characters of notes, and empty notes', () => {
    expect(parseNotes('')).toEqual(ok(''));
    expect(parseNotes('x'.repeat(2000))).toEqual(ok('x'.repeat(2000)));
    expect(parseNotes('x'.repeat(2001))).toEqual(bad('notes'));
    expect(parseNotes(5)).toEqual(bad('notes'));
  });
});

describe('parseChecklist', () => {
  const step = (n: number, text = 'Wipe') => ({ id: uuid(n), text });

  it('takes up to 30 steps of 1 to 120 characters, with distinct UUID ids', () => {
    expect(parseChecklist([])).toEqual(ok([]));
    expect(parseChecklist(Array.from({ length: 30 }, (_, n) => step(n + 1))).ok).toBe(true);
    expect(parseChecklist(Array.from({ length: 31 }, (_, n) => step(n + 1)))).toEqual(bad('checklist'));
  });

  it('names the failing step and field', () => {
    expect(parseChecklist([step(1), step(2, 'x'.repeat(121))])).toEqual(bad('checklist[1].text'));
    expect(parseChecklist([step(1), step(2, '  ')])).toEqual(bad('checklist[1].text'));
    expect(parseChecklist([{ id: 'nope', text: 'a' }])).toEqual(bad('checklist[0].id'));
    expect(parseChecklist([step(1), step(1)])).toEqual(bad('checklist[1].id'));
    expect(parseChecklist('x')).toEqual(bad('checklist'));
  });
});

describe('parseDay and parseClientTime', () => {
  it('takes a real YYYY-MM-DD date', () => {
    expect(parseDay('2026-02-28', 'dueOn')).toEqual(ok('2026-02-28'));
    expect(parseDay('2026-02-30', 'dueOn')).toEqual(bad('dueOn'));
    expect(parseDay('2026-2-3', 'dueOn')).toEqual(bad('dueOn'));
    expect(parseDay(20260228, 'dueOn')).toEqual(bad('dueOn'));
  });

  it('takes an integer millisecond time not before 2026-01-01', () => {
    expect(parseClientTime(EDGE, 'at')).toEqual(ok(EDGE));
    expect(parseClientTime(EDGE - 1, 'at')).toEqual(bad('at'));
    expect(parseClientTime(EDGE + 0.5, 'at')).toEqual(bad('at'));
    expect(parseClientTime('1767225600000', 'at')).toEqual(bad('at'));
    expect(parseClientTime(Number.POSITIVE_INFINITY, 'at')).toEqual(bad('at'));
  });
});

describe('parseRepeat', () => {
  const fixed = { type: 'fixed', every: 1, unit: 'week', weekdays: ['sun'], startOn: '2026-03-01' };

  it('takes none, after and fixed', () => {
    expect(parseRepeat({ type: 'none' })).toEqual(ok({ type: 'none' }));
    expect(parseRepeat({ type: 'after', days: 7 })).toEqual(ok({ type: 'after', days: 7 }));
    expect(parseRepeat(fixed)).toEqual(ok(fixed));
  });

  it('limits days to 1-365, every to 1-52 and dayOfMonth to 1-31', () => {
    expect(parseRepeat({ type: 'after', days: 0 })).toEqual(bad('repeat.days'));
    expect(parseRepeat({ type: 'after', days: 365 }).ok).toBe(true);
    expect(parseRepeat({ type: 'after', days: 366 })).toEqual(bad('repeat.days'));
    expect(parseRepeat({ ...fixed, every: 0 })).toEqual(bad('repeat.every'));
    expect(parseRepeat({ ...fixed, every: 52 }).ok).toBe(true);
    expect(parseRepeat({ ...fixed, every: 53 })).toEqual(bad('repeat.every'));
    const monthly = { type: 'fixed', every: 1, unit: 'month', startOn: '2026-03-01' };
    expect(parseRepeat({ ...monthly, dayOfMonth: 0 })).toEqual(bad('repeat.dayOfMonth'));
    expect(parseRepeat({ ...monthly, dayOfMonth: 31 }).ok).toBe(true);
    expect(parseRepeat({ ...monthly, dayOfMonth: 32 })).toEqual(bad('repeat.dayOfMonth'));
  });

  it('takes 1 to 7 distinct weekdays', () => {
    expect(parseRepeat({ ...fixed, weekdays: [] })).toEqual(bad('repeat.weekdays'));
    expect(parseRepeat({ ...fixed, weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }).ok).toBe(true);
    expect(parseRepeat({ ...fixed, weekdays: ['mon', 'mon'] })).toEqual(bad('repeat.weekdays'));
    expect(parseRepeat({ ...fixed, weekdays: ['funday'] })).toEqual(bad('repeat.weekdays'));
  });

  it('needs a real startOn for a fixed rule, and refuses unknown types and keys', () => {
    expect(parseRepeat({ type: 'fixed', every: 1, unit: 'day' })).toEqual(bad('repeat.startOn'));
    expect(parseRepeat({ ...fixed, startOn: '2026-02-30' })).toEqual(bad('repeat.startOn'));
    expect(parseRepeat({ type: 'sometimes' })).toEqual(bad('repeat.type'));
    expect(parseRepeat({ type: 'none', extra: 1 })).toEqual(bad('repeat.extra'));
    expect(parseRepeat('daily')).toEqual(bad('repeat'));
  });
});

describe('parseCreateTask', () => {
  const body = { id: uuid(1), title: 'Hoover', assignee: 'either', mutationId: MUT };

  it('takes a minimal task, defaulting the repeat to none', () => {
    expect(parseCreateTask(body)).toEqual(ok({ id: uuid(1), title: 'Hoover', assignee: 'either', repeat: { type: 'none' }, mutationId: MUT }));
  });

  it('takes notes, a date, a checklist, clientAt and notify', () => {
    const parsed = parseCreateTask({ ...body, notes: 'n', dueOn: '2026-03-01', checklist: [{ id: uuid(2), text: 'a' }], clientAt: EDGE, notify: true });
    expect(parsed).toEqual(ok({ ...body, repeat: { type: 'none' }, notes: 'n', dueOn: '2026-03-01', checklist: [{ id: uuid(2), text: 'a' }], clientAt: EDGE, notify: true }));
  });

  it('names the first bad field', () => {
    expect(parseCreateTask({ ...body, id: 'x' })).toEqual(bad('id'));
    expect(parseCreateTask({ ...body, title: '' })).toEqual(bad('title'));
    expect(parseCreateTask({ ...body, mutationId: undefined })).toEqual(bad('mutationId'));
    expect(parseCreateTask({ ...body, assignee: 5 })).toEqual(bad('assignee'));
    expect(parseCreateTask({ ...body, dueOn: '2026-02-30' })).toEqual(bad('dueOn'));
    expect(parseCreateTask({ ...body, colour: 'red' })).toEqual(bad('colour'));
    expect(parseCreateTask({ ...body, title: 'x'.repeat(10_000) })).toEqual(bad('title'));
  });
});

describe('parsePatchTask', () => {
  const m = { mutationId: MUT };

  it('takes a field with its timestamp', () => {
    expect(parsePatchTask({ ...m, title: 'New', titleAt: EDGE })).toEqual(ok({ ...m, title: { value: 'New', at: EDGE } }));
    expect(parsePatchTask({ ...m, title: 'New' })).toEqual(bad('titleAt'));
    expect(parsePatchTask({ ...m, notes: 'n' })).toEqual(bad('notesAt'));
    expect(parsePatchTask({ ...m, checklist: [], checklistAt: EDGE }).ok).toBe(true);
    expect(parsePatchTask({ ...m, checklist: [] })).toEqual(bad('checklistAt'));
  });

  it('takes per-step ticks for a cycle', () => {
    const ticks = { cycleSeq: 2, steps: { [uuid(1)]: { done: true, at: EDGE } } };
    expect(parsePatchTask({ ...m, ticks })).toEqual(ok({ ...m, ticks }));
    expect(parsePatchTask({ ...m, ticks: { cycleSeq: 0, steps: {} } })).toEqual(bad('ticks.cycleSeq'));
    expect(parsePatchTask({ ...m, ticks: { cycleSeq: 1, steps: { nope: { done: true, at: EDGE } } } })).toEqual(bad('ticks.steps'));
    expect(parsePatchTask({ ...m, ticks: { cycleSeq: 1, steps: { [uuid(1)]: { done: 'yes', at: EDGE } } } })).toEqual(bad(`ticks.steps.${uuid(1)}.done`));
  });

  it('needs baseRuleVersion with an assignee or repeat change', () => {
    expect(parsePatchTask({ ...m, assignee: 'either' })).toEqual(bad('baseRuleVersion'));
    expect(parsePatchTask({ ...m, assignee: 'either', baseRuleVersion: 3 })).toEqual(ok({ ...m, assignee: { value: 'either', baseRuleVersion: 3 } }));
    expect(parsePatchTask({ ...m, repeat: { type: 'after', days: 2 }, dueOn: '2026-03-05' })).toEqual(bad('baseRuleVersion'));
  });

  it('needs a suggested dueOn with a repeat change, unless the rule is none', () => {
    expect(parsePatchTask({ ...m, repeat: { type: 'after', days: 2 }, baseRuleVersion: 1 })).toEqual(bad('dueOn'));
    expect(parsePatchTask({ ...m, repeat: { type: 'none' }, baseRuleVersion: 1 })).toEqual(ok({ ...m, repeat: { value: { type: 'none' }, baseRuleVersion: 1 } }));
    expect(parsePatchTask({ ...m, repeat: { type: 'after', days: 2 }, dueOn: '2026-03-05', baseRuleVersion: 1 }))
      .toEqual(ok({ ...m, repeat: { value: { type: 'after', days: 2 }, dueOn: '2026-03-05', baseRuleVersion: 1 } }));
  });

  it('needs both base versions for a lone dueOn change', () => {
    expect(parsePatchTask({ ...m, dueOn: '2026-03-05' })).toEqual(bad('baseRuleVersion'));
    expect(parsePatchTask({ ...m, dueOn: '2026-03-05', baseRuleVersion: 1 })).toEqual(bad('baseCycleSeq'));
    expect(parsePatchTask({ ...m, dueOn: '2026-03-05', baseRuleVersion: 1, baseCycleSeq: 2 }))
      .toEqual(ok({ ...m, dueOn: { value: '2026-03-05', baseRuleVersion: 1, baseCycleSeq: 2 } }));
  });

  it('refuses an unknown key, an empty patch and a missing mutationId', () => {
    expect(parsePatchTask({ ...m, role: 'admin', title: 'x', titleAt: EDGE })).toEqual(bad('role'));
    expect(parsePatchTask({ ...m })).toEqual(bad('body'));
    expect(parsePatchTask({ title: 'x', titleAt: EDGE })).toEqual(bad('mutationId'));
    expect(parsePatchTask({ ...m, title: 'x'.repeat(10_000), titleAt: EDGE })).toEqual(bad('title'));
  });
});

describe('the other request bodies', () => {
  it('parseCompleteBody takes cycleSeq, completedAt and mutationId', () => {
    expect(parseCompleteBody({ cycleSeq: 3, completedAt: EDGE, mutationId: MUT })).toEqual(ok({ cycleSeq: 3, completedAt: EDGE, mutationId: MUT }));
    expect(parseCompleteBody({ cycleSeq: 0, completedAt: EDGE, mutationId: MUT })).toEqual(bad('cycleSeq'));
    expect(parseCompleteBody({ cycleSeq: 1, completedAt: 5, mutationId: MUT })).toEqual(bad('completedAt'));
    expect(parseCompleteBody({ cycleSeq: 1, completedAt: EDGE })).toEqual(bad('mutationId'));
  });

  it('parseDeleteBody takes baseRuleVersion and mutationId', () => {
    expect(parseDeleteBody({ baseRuleVersion: 2, mutationId: MUT })).toEqual(ok({ baseRuleVersion: 2, mutationId: MUT }));
    expect(parseDeleteBody({ mutationId: MUT })).toEqual(bad('baseRuleVersion'));
    expect(parseDeleteBody({ baseRuleVersion: -1, mutationId: MUT })).toEqual(bad('baseRuleVersion'));
  });

  it('parseMutationBody takes only a mutationId (plus the ignored notify and clientAt)', () => {
    expect(parseMutationBody({ mutationId: MUT })).toEqual(ok({ mutationId: MUT }));
    expect(parseMutationBody({})).toEqual(bad('mutationId'));
    expect(parseMutationBody({ mutationId: MUT, extra: 1 })).toEqual(bad('extra'));
  });

  it('parseProposalBody takes each kind of change with its base versions', () => {
    const base = { id: uuid(5), taskId: uuid(1), baseRuleVersion: 2, mutationId: MUT };
    expect(parseProposalBody({ ...base, change: { kind: 'delete' } })).toEqual(ok({ ...base, change: { kind: 'delete' } }));
    expect(parseProposalBody({ ...base, change: { kind: 'restore' } }).ok).toBe(true);
    expect(parseProposalBody({ ...base, change: { kind: 'swap' } })).toEqual(bad('baseCycleSeq'));
    expect(parseProposalBody({ ...base, baseCycleSeq: 4, change: { kind: 'swap' } }).ok).toBe(true);
    expect(parseProposalBody({ ...base, change: { kind: 'edit', set: { assignee: 'either' } } }).ok).toBe(true);
    expect(parseProposalBody({ ...base, change: { kind: 'edit', set: {} } })).toEqual(bad('change.set'));
    expect(parseProposalBody({ ...base, change: { kind: 'edit', set: { dueOn: '2026-03-05' } } })).toEqual(bad('baseCycleSeq'));
    expect(parseProposalBody({ ...base, change: { kind: 'edit', set: { repeat: { type: 'after', days: 2 } } } })).toEqual(bad('change.set.dueOn'));
    expect(parseProposalBody({ ...base, change: { kind: 'wipe' } })).toEqual(bad('change.kind'));
  });

  it('parseRestoreBody takes 1 to 100 entries', () => {
    const entry = (n: number) => ({ kind: 'task', id: uuid(n) });
    expect(parseRestoreBody({ entries: [entry(1)], mutationId: MUT })).toEqual(ok({ entries: [entry(1)], mutationId: MUT }));
    expect(parseRestoreBody({ entries: [], mutationId: MUT })).toEqual(bad('entries'));
    expect(parseRestoreBody({ entries: Array.from({ length: 100 }, (_, n) => entry(n + 1)), mutationId: MUT }).ok).toBe(true);
    expect(parseRestoreBody({ entries: Array.from({ length: 101 }, (_, n) => entry(n + 1)), mutationId: MUT })).toEqual(bad('entries'));
    expect(parseRestoreBody({ entries: [{ kind: 'bin', id: uuid(1) }], mutationId: MUT })).toEqual(bad('entries[0].kind'));
    expect(parseRestoreBody({ entries: [{ kind: 'task', id: 'x' }], mutationId: MUT })).toEqual(bad('entries[0].id'));
  });
});
