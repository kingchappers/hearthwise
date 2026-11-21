import { describe, expect, it } from 'vitest';
import { applyProjectDelete, applyProjectWrite } from '../applyProject';
import type { Project } from '../types';

const NOW = Date.parse('2026-11-14T10:00:00.000Z');
const U1 = 'auth0|u1';
const U2 = 'auth0|u2';

const made = (): Project => {
  const { project } = applyProjectWrite(undefined, 'p1', { title: { value: 'Decking', at: 1000 } }, U1, NOW);
  return project!;
};

describe('applyProjectWrite', () => {
  it('creates a project from its title, active, with the field time', () => {
    const { result, project, stale } = applyProjectWrite(undefined, 'p1', { title: { value: 'Decking', at: 1000 } }, U1, NOW);
    expect(result).toBe('created');
    expect(project).toMatchObject({ id: 'p1', title: 'Decking', status: 'active', createdBy: U1, createdAt: NOW, updatedBy: U1, fieldTimes: { title: 1000 } });
    expect(stale).toEqual([]);
  });

  it('does nothing for a write to a missing project that is not a create', () => {
    expect(applyProjectWrite(undefined, 'p1', { notes: { value: 'x', at: 1 } }, U1, NOW).result).toBe('noop');
  });

  it('writes a newer field and refuses an older one, listing it as stale', () => {
    const first = made();
    const newer = applyProjectWrite(first, 'p1', { title: { value: 'Garden room', at: 2000 } }, U2, NOW);
    expect(newer.result).toBe('applied');
    expect(newer.project).toMatchObject({ title: 'Garden room', updatedBy: U2, fieldTimes: { title: 2000 } });
    const older = applyProjectWrite(newer.project, 'p1', { title: { value: 'Shed', at: 1500 } }, U1, NOW);
    expect(older.result).toBe('noop');
    expect(older.stale).toEqual(['title']);
    expect(older.project?.title).toBe('Garden room');
  });

  it('does not call a replaced field stale when the value is the same', () => {
    const first = made();
    expect(applyProjectWrite(first, 'p1', { title: { value: 'Decking', at: 500 } }, U2, NOW).stale).toEqual([]);
  });

  it('clamps a client time more than five minutes ahead to the server time', () => {
    const { project } = applyProjectWrite(made(), 'p1', { title: { value: 'Later', at: NOW + 3_600_000 } }, U1, NOW);
    expect(project?.fieldTimes.title).toBe(NOW);
  });

  it('sets and clears notes, and changes status', () => {
    const noted = applyProjectWrite(made(), 'p1', { notes: { value: 'Check the joists', at: 2000 } }, U1, NOW).project!;
    expect(noted.notes).toBe('Check the joists');
    const cleared = applyProjectWrite(noted, 'p1', { notes: { value: null, at: 3000 } }, U1, NOW).project!;
    expect('notes' in cleared).toBe(false);
    const finished = applyProjectWrite(cleared, 'p1', { status: { value: 'finished', at: 4000 } }, U1, NOW).project!;
    expect(finished.status).toBe('finished');
  });

  it('is final for edits once deleted', () => {
    const deleted = applyProjectDelete(made(), U2, NOW).project!;
    expect(applyProjectWrite(deleted, 'p1', { title: { value: 'Back', at: 9000 } }, U1, NOW).result).toBe('gone');
  });

  it('keeps updatedAt moving forward', () => {
    const first = made();
    const edited = applyProjectWrite(first, 'p1', { notes: { value: 'x', at: 2000 } }, U1, first.updatedAt - 10_000).project!;
    expect(edited.updatedAt).toBeGreaterThan(first.updatedAt);
  });

  it('does not change what it was given', () => {
    const first = made();
    const copy = structuredClone(first);
    applyProjectWrite(first, 'p1', { title: { value: 'New', at: 5000 } }, U2, NOW);
    expect(first).toEqual(copy);
  });
});

describe('applyProjectWrite: the planned day', () => {
  const plan = (project: Project, planned: { plannedOn: string | null; plannedEndOn?: string | null }, at: number) =>
    applyProjectWrite(project, 'p1', { planned: { value: planned, at } }, U2, NOW);

  it('sets a start and an end together under one time, and a start alone leaves no end', () => {
    const both = plan(made(), { plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' }, 2000).project!;
    expect(both).toMatchObject({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-06', fieldTimes: { planned: 2000 } });
    const one = plan(both, { plannedOn: '2026-12-12', plannedEndOn: null }, 3000).project!;
    expect(one.plannedOn).toBe('2026-12-12');
    expect('plannedEndOn' in one).toBe(false);
  });

  it('clears both when the start is null, with the attributes left out and not stored as null', () => {
    const set = plan(made(), { plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' }, 2000).project!;
    const cleared = plan(set, { plannedOn: null }, 3000).project!;
    expect('plannedOn' in cleared).toBe(false);
    expect('plannedEndOn' in cleared).toBe(false);
  });

  it('is newest-write-wins as one group: an older planned write is stale and changes neither day', () => {
    const set = plan(made(), { plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' }, 3000).project!;
    const older = plan(set, { plannedOn: '2026-12-20' }, 2000);
    expect(older).toMatchObject({ result: 'noop', stale: ['planned'] });
    expect(older.project).toMatchObject({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' });
  });

  it('does not call an older write stale when it says the same thing', () => {
    const set = plan(made(), { plannedOn: '2026-12-05' }, 3000).project!;
    expect(plan(set, { plannedOn: '2026-12-05', plannedEndOn: null }, 2000).stale).toEqual([]);
  });

  it('leaves the planned day alone when other fields are edited', () => {
    const set = plan(made(), { plannedOn: '2026-12-05' }, 3000).project!;
    expect(applyProjectWrite(set, 'p1', { notes: { value: 'x', at: 4000 } }, U1, NOW).project).toMatchObject({ plannedOn: '2026-12-05' });
  });
});

describe('applyProjectDelete', () => {
  it('tombstones with a 30-day expiry in seconds', () => {
    const { result, project } = applyProjectDelete(made(), U2, NOW);
    expect(result).toBe('applied');
    expect(project).toMatchObject({ deletedAt: NOW, deletedBy: U2, expiresAt: Math.floor(NOW / 1000) + 30 * 86400 });
  });

  it('is a no-op for a missing or already deleted project', () => {
    expect(applyProjectDelete(undefined, U1, NOW).result).toBe('noop');
    const deleted = applyProjectDelete(made(), U1, NOW).project!;
    expect(applyProjectDelete(deleted, U2, NOW + 1000).result).toBe('noop');
  });
});
