import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Task } from '../../../../src/tasks/types';
import type { TaskActions } from '~/hooks/useTaskActions';

export const TODAY = '2026-11-13'; // a Friday
export const ME = { userId: 'u1', displayName: 'Sam' };
export const THEM = { userId: 'u2', displayName: 'Alex' };
export const MEMBERS = [ME, THEM];

let n = 0;
export const task = (over: Partial<Task> = {}): Task => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, title: `Task ${n}`, fieldTimes: {}, assignee: 'either', repeat: { type: 'after', days: 1 },
  dueOn: TODAY, cycleSeq: 1, ruleVersion: 1, checklist: [], checklistState: {}, status: 'open', createdBy: ME.userId, updatedAt: 1, ...over,
});

export function makeActions(over: Partial<TaskActions> = {}): TaskActions {
  return {
    me: ME,
    members: MEMBERS,
    caller: { userId: ME.userId, members: MEMBERS },
    today: TODAY,
    needsAsk: vi.fn(() => false),
    complete: vi.fn(),
    tick: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
    restore: vi.fn(),
    swap: vi.fn(),
    accept: vi.fn(),
    decline: vi.fn(),
    withdraw: vi.fn(),
    ...over,
  };
}

export function renderIn(ui: React.ReactNode) {
  return render(<MantineProvider env="test"><MemoryRouter>{ui}</MemoryRouter></MantineProvider>);
}

export const WORDS_WE_NEVER_USE = /overdue|missed|streak/i;
