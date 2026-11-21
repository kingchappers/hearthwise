import { describe, expect, it } from 'vitest';
import { parseAddMaterials, parseMaterialPut, parseProjectPut, parseStepPut, parseTakeBody } from '../projectValidation';

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
