import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureLocalAuth, expireLocalSession, getLocalAuthState, loginLocal, logoutLocal, resetLocalAuthForTests, setupLocal, signupWithInvite,
} from '../localAuth';

const fetchMock = vi.fn();

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  resetLocalAuthForTests();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('local auth store', () => {
  it('starts loading, then signs in when /me succeeds', async () => {
    expect(getLocalAuthState()).toEqual({ status: 'loading' });
    fetchMock.mockResolvedValueOnce(reply(200, { userId: 'local|1', email: 'me@example.com', displayName: 'Me' }));
    await ensureLocalAuth();
    expect(getLocalAuthState()).toEqual({ status: 'signedIn', user: { sub: 'local|1', email: 'me@example.com', displayName: 'Me' } });
  });

  it('asks whether setup is needed when /me says 401', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, {})).mockResolvedValueOnce(reply(200, { setupRequired: true }));
    await ensureLocalAuth();
    expect(getLocalAuthState()).toEqual({ status: 'signedOut', setupRequired: true });
  });



  it('checks only once however many layouts mount', async () => {
    fetchMock.mockResolvedValue(reply(200, { userId: 'local|1', email: 'me@example.com' }));
    await Promise.all([ensureLocalAuth(), ensureLocalAuth(), ensureLocalAuth()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to signed out, and logs, when the server is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await ensureLocalAuth();
    expect(getLocalAuthState()).toEqual({ status: 'signedOut', setupRequired: false });
    expect(console.error).toHaveBeenCalled();
  });

  it('signs in on a good login and surfaces the server message on a bad one', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { userId: 'local|1', email: 'me@example.com' }));
    await loginLocal('me@example.com', 'a long enough password');
    expect(getLocalAuthState()).toMatchObject({ status: 'signedIn' });
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));

    resetLocalAuthForTests();
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Invalid email or password' }));
    await expect(loginLocal('me@example.com', 'wrong')).rejects.toThrow('Invalid email or password');
  });

  it('sends the setup code and fields to /setup', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { userId: 'local|1', email: 'me@example.com' }));
    await setupLocal({ code: 'abc', email: 'me@example.com', password: 'a long enough password', displayName: 'Me' });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/auth/setup');
    expect(JSON.parse(init.body)).toEqual({ code: 'abc', email: 'me@example.com', password: 'a long enough password', displayName: 'Me' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends the token and fields to /signup-with-invite', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { userId: 'local|2', email: 'you@example.com', displayName: 'You' }));
    await signupWithInvite({ token: 'T'.repeat(43), email: 'you@example.com', password: 'a long enough password', displayName: 'You' });
    const [path, init] = fetchMock.mock.calls[0];
    expect(path).toBe('/api/auth/signup-with-invite');
    expect(JSON.parse(init.body)).toEqual({ token: 'T'.repeat(43), email: 'you@example.com', password: 'a long enough password', displayName: 'You' });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(getLocalAuthState()).toMatchObject({ status: 'signedIn' });
  });

  it.each([
    [410, { error: 'invite_expired' }, 'This invite has expired. Ask your partner for a new link.'],
    [409, { error: 'email_taken' }, 'That email already has an account. Try signing in instead.'],
    [409, { error: 'household_full' }, 'This household already has two people.'],
  ])('explains a %i %o in plain words', async (status, body, message) => {
    fetchMock.mockResolvedValueOnce(reply(status, body));
    fetchMock.mockResolvedValue(reply(401, {}));
    await expect(signupWithInvite({ token: 'T'.repeat(43), email: 'you@example.com', password: 'a long enough password', displayName: 'You' })).rejects.toThrow(message);
  });

  it('shows the server message on a validation failure', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid', field: 'email', message: 'A valid email address is required' }));
    await expect(loginLocal('nope', 'x')).rejects.toThrow('A valid email address is required');
  });

  it('goes signed out when the session expires mid-use', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { userId: 'local|1', email: 'me@example.com' }));
    await ensureLocalAuth();
    fetchMock.mockResolvedValueOnce(reply(401, {})).mockResolvedValueOnce(reply(200, { setupRequired: false }));
    expireLocalSession();
    expect(getLocalAuthState()).toMatchObject({ status: 'signedOut' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(getLocalAuthState()).toEqual({ status: 'signedOut', setupRequired: false });
  });


  it('refreshes the status on a 409 and still rejects with the server message', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(409, { error: 'This instance is already set up' }))
      .mockResolvedValueOnce(reply(401, {}))
      .mockResolvedValueOnce(reply(200, { setupRequired: false }));
    await expect(setupLocal({ code: 'abc', email: 'me@example.com', password: 'a long enough password', displayName: 'Me' })).rejects.toThrow('This instance is already set up');
    await vi.waitFor(() => expect(getLocalAuthState()).toEqual({ status: 'signedOut', setupRequired: false }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('posts to /logout', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, {}));
    await logoutLocal();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }));
  });

  it('rejects when /logout fails, so the caller can tell the user', async () => {
    fetchMock.mockResolvedValueOnce(reply(500, { error: 'Server error' }));
    await expect(logoutLocal()).rejects.toThrow('Server error');
  });

  it('lets a network failure on /logout propagate', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(logoutLocal()).rejects.toThrow('Failed to fetch');
  });
});

describe('timeouts', () => {
  it('gives the session check, sign-in and sign-out requests a signal each', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, {}));
    fetchMock.mockResolvedValueOnce(reply(200, { setupRequired: false }));
    await ensureLocalAuth();
    fetchMock.mockResolvedValueOnce(reply(200, { userId: 'local|1', email: 'me@example.com' }));
    await loginLocal('me@example.com', 'a long enough password');
    fetchMock.mockResolvedValueOnce(reply(200, {}));
    await logoutLocal();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const call of fetchMock.mock.calls) expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
