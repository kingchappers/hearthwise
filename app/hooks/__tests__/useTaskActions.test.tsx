import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { Task } from '../../../src/tasks/types';

const calls = vi.hoisted(() => [] as { kind: string; vars: Record<string, unknown> }[]);
const completeResult = vi.hoisted(() => ({ value: undefined as unknown }));
const show = vi.hoisted(() => vi.fn());

vi.mock('@mantine/notifications', () => ({ notifications: { show, hide: vi.fn() } }));
vi.mock('~/lib/queries', () => ({ useTasks: () => ({ today: '2026-11-13' }) }));
vi.mock('~/lib/household', () => ({
  useHousehold: () => ({
    status: 'ready', refetch: vi.fn(),
    data: { household: { timezone: 'Europe/London' }, members: [{ userId: 'u1', displayName: 'Sam', joinedAt: '' }, { userId: 'u2', displayName: 'Alex', joinedAt: '' }],
      me: { userId: 'u1', displayName: 'Sam', joinedAt: '', settings: {} } },
  }),
}));
// Each mutation records what it was asked to do; a completion then answers with the cycle the server says it completed.
vi.mock('~/lib/mutations', async importOriginal => ({
  ...(await importOriginal<typeof import('~/lib/mutations')>()),
  useHouseholdMutation: (kind: string) => ({
    mutate: (vars: Record<string, unknown>, options?: { onSuccess?: (result: unknown) => void }) => {
      calls.push({ kind, vars });
      if (kind === 'complete' && completeResult.value !== undefined) options?.onSuccess?.(completeResult.value);
    },
  }),
}));

import { useTaskActions } from '../useTaskActions';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: 'Hoover', fieldTimes: {}, assignee: 'either', repeat: { type: 'after', days: 1 }, dueOn: '2026-11-12', cycleSeq: 2, ruleVersion: 1,
  checklist: [], checklistState: {}, status: 'open', createdBy: 'u1', updatedAt: 1, ...over,
});

// The toast's Undo button, taken from the message the hook showed.
const pressUndo = (): void => {
  const message = show.mock.calls.at(-1)![0].message as { props: { onAction: () => void } };
  message.props.onAction();
};

beforeEach(() => {
  calls.length = 0;
  show.mockClear();
  completeResult.value = undefined;
});

describe('useTaskActions: undoing a completion', () => {
  it('undoes the cycle the server completed, not the one that was tapped', () => {
    // The phone showed cycle 2, but the other phone had already undone it: the server completed cycle 1.
    completeResult.value = { task: task(), cycleSeq: 1 };
    const { result } = renderHook(() => useTaskActions());
    result.current.complete(task({ cycleSeq: 2 }));
    expect(calls.find(call => call.kind === 'complete')!.vars.cycleSeq).toBe(2);

    pressUndo();
    expect(calls.find(call => call.kind === 'uncomplete')!.vars.cycleSeq).toBe(1);
  });

  it('undoes the tapped cycle when the answer has not arrived yet', () => {
    const { result } = renderHook(() => useTaskActions());
    result.current.complete(task({ cycleSeq: 2 }));
    pressUndo();
    expect(calls.find(call => call.kind === 'uncomplete')!.vars.cycleSeq).toBe(2);
  });

  it('ignores an answer that carries no cycle', () => {
    completeResult.value = {};
    const { result } = renderHook(() => useTaskActions());
    result.current.complete(task({ cycleSeq: 2 }));
    pressUndo();
    expect(calls.find(call => call.kind === 'uncomplete')!.vars.cycleSeq).toBe(2);
  });
});
