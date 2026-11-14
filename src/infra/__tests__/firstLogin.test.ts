import { describe, expect, it, vi } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createHandler } = require('../../../infra/auth0/first-login.js') as {
  createHandler: (publish: (message: string) => Promise<void>) => (event: unknown, api: unknown) => Promise<void>;
};

const event = (loginsCount: number) => ({
  user: { user_id: 'auth0|abc', email: 'me@example.com', name: 'Me Myself' },
  stats: { logins_count: loginsCount },
});

describe('the first-login Action', () => {
  it('publishes one user_first_seen message on a first login', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    await createHandler(publish)(event(1), {});
    expect(publish).toHaveBeenCalledTimes(1);
    const message = JSON.parse(publish.mock.calls[0][0]);
    expect(message).toMatchObject({ event: 'user_first_seen', userId: 'auth0|abc' });
    expect(typeof message.at).toBe('string');
  });

  it('publishes nothing on a later login', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    await createHandler(publish)(event(2), {});
    expect(publish).not.toHaveBeenCalled();
  });

  it('never puts the email or name in the message', async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    await createHandler(publish)(event(1), {});
    const text: string = publish.mock.calls[0][0];
    expect(text).not.toContain('me@example.com');
    expect(text).not.toContain('Me Myself');
  });

  it('does not throw when the publish fails, so a login never fails because of an alert', async () => {
    const publish = vi.fn().mockRejectedValue(new Error('sns down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(createHandler(publish)(event(1), {})).resolves.toBeUndefined();
    warn.mockRestore();
  });
});
