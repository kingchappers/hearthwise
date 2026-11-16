import { describe, expect, it } from 'vitest';
import type { Task } from '../../../src/tasks/types';
import type { MoneyEntry } from '../../../src/money/types';
import type { EventView } from '../../../src/calendar/types';
import { deletedEntries, deletedTasks } from '../deleted';

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id, title: id, fieldTimes: {}, assignee: 'either', repeat: { type: 'none' }, cycleSeq: 1, ruleVersion: 1, checklist: [], checklistState: {},
  status: 'open', createdBy: 'u1', updatedAt: 1, ...over,
});

describe('deletedTasks', () => {
  it('lists only deleted tasks, newest deletion first', () => {
    const rows = deletedTasks([task('open'), task('old', { deletedAt: 100 }), task('new', { deletedAt: 300 }), task('mid', { deletedAt: 200 })]);
    expect(rows.map(row => row.id)).toEqual(['new', 'mid', 'old']);
  });

  it('is empty when nothing is deleted', () => {
    expect(deletedTasks([task('a'), task('b')])).toEqual([]);
  });
});

describe('deletedEntries', () => {
  const money = (id: string, deletedAt?: number): MoneyEntry => ({
    id, kind: 'loan', paidBy: 'u1', amountPence: 100, sharePence: 100, description: id, on: '2026-11-15', fieldTimes: {}, status: 'agreed', version: 1,
    createdBy: 'u1', createdAt: 1, proposedBy: 'u1', updatedAt: 1, updatedBy: 'u1', ...(deletedAt === undefined ? {} : { deletedAt }),
  });

  it('gives the money entries that are deleted, newest deletion first', () => {
    const rows = deletedEntries([], [], [], [money('live'), money('old', 100), money('new', 300)]);
    expect(rows.money.map(row => row.id)).toEqual(['new', 'old']);
  });

  it('has no money group when none is given', () => {
    expect(deletedEntries([], [], []).money).toEqual([]);
  });
});

describe('deletedEntries events', () => {
  const calendarEvent = (id: string, deletedAt?: number): EventView => ({
    id, kind: 'event', title: id, who: 'both', private: false, startOn: '2026-11-16', allDay: true, repeat: { type: 'none' }, skipOn: [], reminders: {}, fieldTimes: {},
    createdBy: 'u1', createdAt: 1, updatedAt: 1, updatedBy: 'u1', ...(deletedAt === undefined ? {} : { deletedAt }),
  });

  it('gives the deleted events, newest deletion first', () => {
    const rows = deletedEntries([], [], [], [], [calendarEvent('old', 100), calendarEvent('new', 300)]);
    expect(rows.events.map(row => row.id)).toEqual(['new', 'old']);
  });

  it('has no events group when none is given', () => {
    expect(deletedEntries([], [], []).events).toEqual([]);
  });
});
