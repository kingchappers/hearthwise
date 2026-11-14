import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendNotification = vi.hoisted(() => vi.fn());
class FakeWebPushError extends Error { constructor(readonly statusCode: number) { super('push failed'); } }
vi.mock('web-push', () => ({ default: { sendNotification, WebPushError: FakeWebPushError } }));

import { createContainerSender } from '../push';

const vapid = { publicKey: 'pub', privateKey: 'priv', subject: 'mailto:admin@localhost' };
const sub = { endpoint: 'https://push.example/1', p256dh: 'p', auth: 'a', createdAt: 1 };
const payload = { title: 'T', body: 'B', tag: 'x' };
beforeEach(() => { sendNotification.mockReset(); });

describe('createContainerSender', () => {
  it('sends the payload as JSON with the VAPID details, and returns the status', async () => {
    sendNotification.mockResolvedValue({ statusCode: 201 });
    expect(await createContainerSender(vapid).send(sub, payload)).toEqual({ status: 201 });
    const [target, body, options] = sendNotification.mock.calls[0];
    expect(target).toEqual({ endpoint: sub.endpoint, keys: { p256dh: 'p', auth: 'a' } });
    expect(JSON.parse(body)).toEqual(payload);
    expect(options.vapidDetails).toEqual({ subject: vapid.subject, publicKey: 'pub', privateKey: 'priv' });
  });

  it('returns the status of a refusal, so a gone subscription can be removed', async () => {
    sendNotification.mockRejectedValue(new FakeWebPushError(410));
    expect(await createContainerSender(vapid).send(sub, payload)).toEqual({ status: 410 });
  });

  it('throws when the push service cannot be reached at all', async () => {
    sendNotification.mockRejectedValue(new Error('ECONNRESET'));
    await expect(createContainerSender(vapid).send(sub, payload)).rejects.toThrow('ECONNRESET');
  });
});
