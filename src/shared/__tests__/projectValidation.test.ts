import { describe, expect, it } from 'vitest';
import { parseAddMaterials, parseHoldBody, parseMaterialPut, parseProjectPut, parseStepPut, parseTakeBody } from '../projectValidation';

const MUT = '00000000-0000-4000-8000-000000000001';
const AT = 1_790_000_000_000;
const env = { mutationId: MUT };

describe('parseProjectPut', () => {
  it('reads a title with its time', () => {
    expect(parseProjectPut({ title: ' Decking ', titleAt: AT, ...env })).toEqual({ ok: true, value: { write: { title: { value: 'Decking', at: AT } }, mutationId: MUT } });
  });

  it('reads notes, a clear and a status', () => {
    const parsed = parseProjectPut({ notes: null, notesAt: AT, status: 'finished', statusAt: AT, ...env });
    expect(parsed).toMatchObject({ ok: true, value: { write: { notes: { value: null, at: AT }, status: { value: 'finished', at: AT } } } });
  });

  it('carries clientAt', () => {
    expect(parseProjectPut({ title: 'x', titleAt: AT, clientAt: AT, ...env })).toMatchObject({ ok: true, value: { clientAt: AT } });
  });

  it.each([
    ['an empty title', { title: '  ', titleAt: AT }, 'title'],
    ['a title over 80 characters', { title: 'a'.repeat(81), titleAt: AT }, 'title'],
    ['notes over 1,000', { notes: 'a'.repeat(1001), notesAt: AT }, 'notes'],
    ['an unknown status', { status: 'archived', statusAt: AT }, 'status'],
    ['a field with no time', { title: 'x' }, 'titleAt'],
    ['a time with no field', { titleAt: AT }, 'titleAt'],
    ['an unknown key', { title: 'x', titleAt: AT, colour: 'red' }, 'colour'],
    ['no fields', {}, 'body'],
  ])('refuses %s', (_name, body, field) => {
    expect(parseProjectPut({ ...body, ...env })).toEqual({ ok: false, field });
  });

  it('refuses a missing or bad mutation id', () => {
    expect(parseProjectPut({ title: 'x', titleAt: AT })).toEqual({ ok: false, field: 'mutationId' });
    expect(parseProjectPut({ title: 'x', titleAt: AT, mutationId: 'nope' })).toEqual({ ok: false, field: 'mutationId' });
  });

  it('refuses text over the limit rather than cutting it', () => {
    expect(parseProjectPut({ title: 'a'.repeat(80), titleAt: AT, ...env }).ok).toBe(true);
    expect(parseProjectPut({ title: 'a'.repeat(81), titleAt: AT, ...env }).ok).toBe(false);
  });
});

describe('parseProjectPut: the planned day', () => {
  it('reads a start, a start and an end, and a clear, each with one time', () => {
    expect(parseProjectPut({ plannedOn: '2026-12-05', plannedAt: AT, ...env })).toMatchObject({ ok: true, value: { write: { planned: { value: { plannedOn: '2026-12-05', plannedEndOn: null }, at: AT } } } });
    expect(parseProjectPut({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-06', plannedAt: AT, ...env })).toMatchObject({ ok: true, value: { write: { planned: { value: { plannedEndOn: '2026-12-06' } } } } });
    expect(parseProjectPut({ plannedOn: null, plannedAt: AT, ...env })).toMatchObject({ ok: true, value: { write: { planned: { value: { plannedOn: null } } } } });
  });

  it('can come with other fields in one write', () => {
    expect(parseProjectPut({ title: 'x', titleAt: AT, plannedOn: '2026-12-05', plannedAt: AT, ...env })).toMatchObject({ ok: true, value: { write: { title: { value: 'x' }, planned: { value: { plannedOn: '2026-12-05' } } } } });
  });

  it.each([
    ['a day that is not real', { plannedOn: '2026-02-30', plannedAt: AT }, 'plannedOn'],
    ['text that is not a date', { plannedOn: 'soon', plannedAt: AT }, 'plannedOn'],
    ['an end before the start', { plannedOn: '2026-12-05', plannedEndOn: '2026-12-04', plannedAt: AT }, 'plannedEndOn'],
    ['an end 14 days after', { plannedOn: '2026-12-05', plannedEndOn: '2026-12-19', plannedAt: AT }, 'plannedEndOn'],
    ['an end with a cleared start', { plannedOn: null, plannedEndOn: '2026-12-06', plannedAt: AT }, 'plannedEndOn'],
    ['an end with no start', { plannedEndOn: '2026-12-06', plannedAt: AT }, 'plannedOn'],
    ['a day with no time', { plannedOn: '2026-12-05' }, 'plannedAt'],
    ['a time with no day', { plannedAt: AT }, 'plannedOn'],
  ])('refuses %s', (_name, body, field) => {
    expect(parseProjectPut({ ...body, ...env })).toEqual({ ok: false, field });
  });

  it('accepts an end exactly 13 days after, a 14-day span', () => {
    expect(parseProjectPut({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-18', plannedAt: AT, ...env }).ok).toBe(true);
  });
});

describe('parseProjectPut: costs', () => {
  it('reads each figure in whole pence with its own time, and a clear', () => {
    expect(parseProjectPut({ estimatePence: 400000, estimateAt: AT, ...env })).toMatchObject({ ok: true, value: { write: { estimate: { value: 400000, at: AT } } } });
    expect(parseProjectPut({ spentPence: 125000, spentAt: AT, estimatePence: null, estimateAt: AT, ...env })).toMatchObject({ ok: true, value: { write: { spent: { value: 125000 }, estimate: { value: null } } } });
  });

  it('accepts 1 pence and the largest figure, and refuses 0, a negative, a fraction, text and one over the largest', () => {
    expect(parseProjectPut({ spentPence: 1, spentAt: AT, ...env }).ok).toBe(true);
    expect(parseProjectPut({ spentPence: 100_000_000, spentAt: AT, ...env }).ok).toBe(true);
    for (const bad of [0, -5, 12.5, '12', 100_000_001, NaN]) expect(parseProjectPut({ spentPence: bad, spentAt: AT, ...env })).toEqual({ ok: false, field: 'spentPence' });
  });

  it('refuses a figure with no time, a time with no figure, and the field names of the design that are not the write fields', () => {
    expect(parseProjectPut({ estimatePence: 100, ...env })).toEqual({ ok: false, field: 'estimateAt' });
    expect(parseProjectPut({ estimateAt: AT, ...env })).toEqual({ ok: false, field: 'estimatePence' });
    expect(parseProjectPut({ estimate: 100, ...env })).toEqual({ ok: false, field: 'estimate' });
  });

  it('can come with the planned day and a title in one write', () => {
    expect(parseProjectPut({ title: 'x', titleAt: AT, plannedOn: '2026-12-05', plannedAt: AT, spentPence: 5, spentAt: AT, ...env })).toMatchObject({ ok: true, value: { write: { title: {}, planned: {}, spent: { value: 5 } } } });
  });
});

describe('parseStepPut', () => {
  it('reads text, note, state and position with times', () => {
    const parsed = parseStepPut({ text: 'Lift the boards', textAt: AT, note: 'Mind the nails', noteAt: AT, state: 'done', stateAt: AT, position: 'i', positionAt: AT, ...env });
    expect(parsed).toMatchObject({ ok: true, value: { write: { text: { value: 'Lift the boards' }, note: { value: 'Mind the nails' }, state: { value: 'done' }, position: { value: 'i' } } } });
  });

  it('clears a note with null', () => {
    expect(parseStepPut({ note: null, noteAt: AT, ...env })).toMatchObject({ ok: true, value: { write: { note: { value: null } } } });
  });

  it.each([
    ['text over 120', { text: 'a'.repeat(121), textAt: AT }, 'text'],
    ['a note over 500', { note: 'a'.repeat(501), noteAt: AT }, 'note'],
    ['a bad state', { state: 'started', stateAt: AT }, 'state'],
    ['a position outside the alphabet', { position: 'A', positionAt: AT }, 'position'],
    ['a position with a separator', { position: 'a#b', positionAt: AT }, 'position'],
    ['an empty position', { position: '', positionAt: AT }, 'position'],
    ['a position over 64 characters', { position: 'a'.repeat(65), positionAt: AT }, 'position'],
    ['an unknown key', { text: 'x', textAt: AT, dueOn: '2026-12-01' }, 'dueOn'],
  ])('refuses %s', (_name, body, field) => {
    expect(parseStepPut({ ...body, ...env })).toEqual({ ok: false, field });
  });

  it('accepts a 64-character position', () => {
    expect(parseStepPut({ position: 'a'.repeat(64), positionAt: AT, ...env }).ok).toBe(true);
  });
});

describe('parseTakeBody', () => {
  it('accepts only the envelope', () => {
    expect(parseTakeBody({ ...env })).toEqual({ ok: true, value: { mutationId: MUT } });
    expect(parseTakeBody({ ...env, notify: true, clientAt: AT })).toMatchObject({ ok: true });
  });

  it('refuses any other key', () => {
    expect(parseTakeBody({ ...env, takenBy: 'someone' })).toEqual({ ok: false, field: 'takenBy' });
  });

  it('refuses a missing mutation id', () => {
    expect(parseTakeBody({})).toEqual({ ok: false, field: 'mutationId' });
  });
});

describe('parseMaterialPut', () => {
  it('reads a line of text with its time, and refuses empty or over 120 characters', () => {
    expect(parseMaterialPut({ text: ' 1 box of 75mm screws ', textAt: AT, ...env })).toMatchObject({ ok: true, value: { write: { text: { value: '1 box of 75mm screws', at: AT } } } });
    expect(parseMaterialPut({ text: '', textAt: AT, ...env })).toEqual({ ok: false, field: 'text' });
    expect(parseMaterialPut({ text: 'a'.repeat(121), textAt: AT, ...env })).toEqual({ ok: false, field: 'text' });
    expect(parseMaterialPut({ text: 'a'.repeat(120), textAt: AT, ...env }).ok).toBe(true);
  });

  it('refuses null, a note, and a write with no text', () => {
    expect(parseMaterialPut({ text: null, textAt: AT, ...env })).toEqual({ ok: false, field: 'text' });
    expect(parseMaterialPut({ text: 'x', textAt: AT, note: 'n', ...env })).toEqual({ ok: false, field: 'note' });
    expect(parseMaterialPut({ ...env })).toEqual({ ok: false, field: 'body' });
  });
});

describe('parseAddMaterials', () => {
  const ID = '11111111-1111-4111-8111-111111111111';

  it('reads up to 60 line ids', () => {
    expect(parseAddMaterials({ lineIds: [ID], ...env })).toEqual({ ok: true, value: { lineIds: [ID], mutationId: MUT } });
    expect(parseAddMaterials({ lineIds: Array.from({ length: 60 }, () => ID), ...env }).ok).toBe(true);
  });

  it.each([
    ['none', { lineIds: [] }, 'lineIds'], ['over 60', { lineIds: Array.from({ length: 61 }, () => ID) }, 'lineIds'],
    ['a bad id', { lineIds: ['nope'] }, 'lineIds[0]'], ['not an array', { lineIds: ID }, 'lineIds'], ['an unknown key', { lineIds: [ID], text: 'x' }, 'text'],
  ])('refuses %s', (_name, body, field) => {
    expect(parseAddMaterials({ ...body, ...env })).toEqual({ ok: false, field });
  });
});

describe('a step\'s energy tag', () => {
  it('is accepted as a size with its time, or null to clear, and nothing else', () => {
    const body = env;
    expect(parseStepPut({ ...body, energy: 'small', energyAt: AT }).ok).toBe(true);
    expect(parseStepPut({ ...body, energy: null, energyAt: AT }).ok).toBe(true);
    expect(parseStepPut({ ...body, energy: 'huge', energyAt: AT }).ok).toBe(false);
    expect(parseStepPut({ ...body, energy: 'small' }).ok).toBe(false);
  });
});

describe('the in-order flag', () => {
  it('is accepted as true or false with its time, and nothing else', () => {
    expect(parseProjectPut({ ordered: true, orderedAt: AT, ...env }).ok).toBe(true);
    expect(parseProjectPut({ ordered: false, orderedAt: AT, ...env }).ok).toBe(true);
    expect(parseProjectPut({ ordered: 'yes', orderedAt: AT, ...env }).ok).toBe(false);
    expect(parseProjectPut({ ordered: true, ...env }).ok).toBe(false);
  });
});

describe('parseHoldBody', () => {
  it('takes the envelope alone, or with a short reason that is trimmed', () => {
    expect(parseHoldBody({ ...env })).toMatchObject({ ok: true, value: { mutationId: MUT } });
    expect(parseHoldBody({ because: '  I have the drill ', ...env })).toMatchObject({ ok: true, value: { because: 'I have the drill' } });
  });

  it('refuses an empty or over-long reason and any other field', () => {
    expect(parseHoldBody({ because: '   ', ...env }).ok).toBe(false);
    expect(parseHoldBody({ because: 'x'.repeat(201), ...env }).ok).toBe(false);
    expect(parseHoldBody({ because: 3, ...env }).ok).toBe(false);
    expect(parseHoldBody({ note: 'x', ...env }).ok).toBe(false);
  });
});
