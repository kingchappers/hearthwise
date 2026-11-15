import { beforeEach, describe, expect, it, vi } from 'vitest';

const { schedule, reminders, store } = vi.hoisted(() => ({ schedule: vi.fn(), reminders: vi.fn(), store: {} }));
vi.mock('../scheduler', () => ({ runSchedule: schedule }));
vi.mock('../../calendar/reminders', () => ({ runReminders: reminders }));
vi.mock('../../store', () => ({ initStore: async () => store }));
vi.mock('../init', () => ({ initPush: async () => undefined }));
vi.mock('../registry', () => ({ getSender: () => 'the-sender' }));

import { handler } from '../../../push-handler';

beforeEach(() => { schedule.mockReset(); reminders.mockReset(); });

describe('the scheduler Lambda, by job', () => {
  it('runs the hourly work for the event the hourly rule sends, which has no job', async () => {
    await handler({ 'detail-type': 'Scheduled Event', source: 'aws.events' });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(reminders).not.toHaveBeenCalled();
  });

  it('runs only the reminders for { job: "reminders" }, with the store, the sender and the time', async () => {
    await handler({ job: 'reminders' });
    expect(schedule).not.toHaveBeenCalled();
    expect(reminders).toHaveBeenCalledTimes(1);
    const [usedStore, sender, now] = reminders.mock.calls[0];
    expect(usedStore).toBe(store);
    expect(sender).toBe('the-sender');
    expect(now).toBeInstanceOf(Date);
  });

  it.each(['digests', '', 'REMINDERS', 5, null])('does nothing for any other job (%s)', async job => {
    await handler({ job } as never);
    expect(schedule).not.toHaveBeenCalled();
    expect(reminders).not.toHaveBeenCalled();
  });
});

describe('the scheduler Lambda', () => {
  it('runs the schedule once, with the store, the sender and the current time', async () => {
    const before = Date.now();
    await handler();
    expect(schedule).toHaveBeenCalledTimes(1);
    const [usedStore, sender, now] = schedule.mock.calls[0];
    expect(usedStore).toBe(store);
    expect(sender).toBe('the-sender');
    expect((now as Date).getTime()).toBeGreaterThanOrEqual(before);
  });
});
