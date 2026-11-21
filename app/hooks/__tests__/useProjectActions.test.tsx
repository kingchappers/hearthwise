import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Step } from '../../../src/projects/types';

const calls = vi.hoisted(() => [] as { kind: string; vars: Record<string, unknown> }[]);
const show = vi.hoisted(() => vi.fn());
const notifyOn = vi.hoisted(() => ({ value: true }));

vi.mock('@mantine/notifications', () => ({ notifications: { show, hide: vi.fn() } }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({ status: 'ready', refetch: vi.fn(), data: { household: { timezone: 'Europe/London' }, members: [], me: { userId: 'u-sam', displayName: 'Sam', joinedAt: '', settings: {} } } }),
}));
vi.mock('~/lib/letThemKnow', () => ({ notifyFields: () => (notifyOn.value ? { notify: true } : {}) }));
vi.mock('~/lib/mutations', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/mutations')>()),
  useProjectMutation: (kind: string) => ({ mutate: (vars: Record<string, unknown>) => { calls.push({ kind, vars }); } }),
}));

import { useProjectActions } from '../useProjectActions';

const step = (over: Partial<Step> = {}): Step => ({
  id: 's1', projectId: 'p1', text: 'Lift the boards', state: 'done', position: 'i', note: 'Mind the nails', takenBy: 'u-alex', fieldTimes: {}, createdBy: 'u', createdAt: 1, updatedAt: 1, updatedBy: 'u', ...over,
});

beforeEach(() => { calls.length = 0; show.mockClear(); notifyOn.value = true; });

describe('useProjectActions', () => {
  it('creates with the id and mutation id the sheet made, so a second tap is the same write', () => {
    const { result } = renderHook(() => useProjectActions());
    const input = { id: 'new-id', mutationId: 'sheet-mutation', title: 'Garden room' };
    result.current.createProject(input);
    result.current.createProject(input);
    expect(calls.map(call => call.kind)).toEqual(['putProject', 'putProject']);
    expect(calls[0].vars).toMatchObject({ mutationId: 'sheet-mutation', projectId: 'new-id', by: 'u-sam', notify: true, changes: { title: 'Garden room' } });
    expect(calls[1].vars.mutationId).toBe('sheet-mutation');
  });

  it('sends nothing for an edit with no changes', () => {
    const { result } = renderHook(() => useProjectActions());
    result.current.editProject('p1', {});
    result.current.editStep('p1', 's1', {});
    expect(calls).toEqual([]);
  });

  it('adds one step for each line, each its own write, with the Let them know tick on the first only', () => {
    const { result } = renderHook(() => useProjectActions());
    result.current.addSteps('p1', [{ text: 'One', position: 'a' }, { text: 'Two', position: 'b' }, { text: 'Three', position: 'c' }]);
    expect(calls.map(call => call.vars.notify)).toEqual([true, undefined, undefined]);
    expect(new Set(calls.map(call => call.vars.mutationId)).size).toBe(3);
    expect(new Set(calls.map(call => call.vars.stepId)).size).toBe(3);
  });

  it('leaves the tick off when it was not ticked', () => {
    notifyOn.value = false;
    const { result } = renderHook(() => useProjectActions());
    result.current.takeStep('p1', 's1');
    expect(calls[0].vars.notify).toBeUndefined();
  });

  it('undoes a delete by writing the same words again under a new id, not started and not held', () => {
    const { result } = renderHook(() => useProjectActions());
    result.current.undoDeleteStep('p1', step());
    expect(calls[0].kind).toBe('putStep');
    expect(calls[0].vars.stepId).not.toBe('s1');
    expect(calls[0].vars.changes).toEqual({ text: 'Lift the boards', position: 'i', note: 'Mind the nails' });
  });

  it('shows a toast with Undo when a step is deleted', () => {
    const { result } = renderHook(() => useProjectActions());
    result.current.deleteStep('p1', step());
    expect(calls[0]).toMatchObject({ kind: 'deleteStep', vars: { projectId: 'p1', stepId: 's1' } });
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('restores with the deletion the person saw', () => {
    const { result } = renderHook(() => useProjectActions());
    result.current.restoreProject({ id: 'p1', deletedAt: 5 });
    expect(calls[0]).toMatchObject({ kind: 'restoreProject', vars: { entries: [{ id: 'p1', deletedAt: 5 }] } });
  });
});
