import { beforeEach, describe, expect, it, vi } from 'vitest';

const { schedule, reminders, refresh, store } = vi.hoisted(() => ({ schedule: vi.fn(), reminders: vi.fn(), refresh: vi.fn(), store: {} }));
vi.mock('../../calendar/refresh', () => ({ runCalendarRefresh: refresh }));
vi.mock('../scheduler', () => ({ runSchedule: schedule }));
vi.mock('../../calendar/reminders', () => ({ runReminders: reminders }));
vi.mock('../../store', () => ({ initStore: async () => store }));
vi.mock('../init', () => ({ initPush: async () => undefined }));
vi.mock('../registry', () => ({ getSender: () => 'the-sender' }));

import { handler } from '../../../push-handler';

beforeEach(() => { schedule.mockReset(); reminders.mockReset(); refresh.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => undefined); });

describe('the scheduler Lambda, by job', () => {
  it('runs the hourly work for the event the hourly rule sends, which has no job', async () => {
    await handler({ 'detail-type': 'Scheduled Event', source: 'aws.events' });
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(reminders).not.toHaveBeenCalled();
  });

  it('refreshes the calendar feeds after the schedule on the hourly run, with the time the function has left', async () => {
    const order: string[] = [];
    schedule.mockImplementation(async () => { order.push('schedule'); });
    refresh.mockImplementation(async () => { order.push('refresh'); });
    const before = Date.now();
    await handler({ source: 'aws.events' }, { getRemainingTimeInMillis: () => 100_000 } as never);
    expect(order).toEqual(['schedule', 'refresh']);
    const [usedStore, now, deadline] = refresh.mock.calls[0];
    expect(usedStore).toBe(store);
    expect(now).toBeInstanceOf(Date);
    expect(deadline).toBeGreaterThanOrEqual(before + 100_000);
    expect(deadline).toBeLessThan(Date.now() + 100_000 + 1000);
  });

  it('refreshes the feeds with no deadline when there is no function context to say how long is left', async () => {
    await handler();
    expect(refresh.mock.calls[0][2]).toBe(Number.POSITIVE_INFINITY);
  });

  it('refreshes the feeds even when the schedule fails, and runs the schedule even when the refresh fails, naming only the error', async () => {
    schedule.mockRejectedValue(Object.assign(new Error('SENTINEL detail'), { name: 'Boom' }));
    await handler();
    expect(refresh).toHaveBeenCalledTimes(1);
    schedule.mockReset();
    refresh.mockRejectedValue(new Error('SENTINEL detail'));
    await handler();
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('SENTINEL');
  });

  it('runs only the reminders for { job: "reminders" }, with the store, the sender and the time', async () => {
    await handler({ job: 'reminders' });
    expect(schedule).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
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
    expect(refresh).not.toHaveBeenCalled();
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
