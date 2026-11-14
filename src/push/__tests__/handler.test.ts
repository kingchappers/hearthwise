import { beforeEach, describe, expect, it, vi } from 'vitest';

const { schedule, store } = vi.hoisted(() => ({ schedule: vi.fn(), store: {} }));
vi.mock('../scheduler', () => ({ runSchedule: schedule }));
vi.mock('../../store', () => ({ initStore: async () => store }));
vi.mock('../init', () => ({ initPush: async () => undefined }));
vi.mock('../registry', () => ({ getSender: () => 'the-sender' }));

import { handler } from '../../../push-handler';

beforeEach(() => schedule.mockReset());

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
