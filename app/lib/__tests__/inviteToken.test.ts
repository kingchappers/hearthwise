import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearInviteToken, peekInviteToken, storeInviteToken, tokenFromHash } from '../inviteToken';

const TOKEN = 'A'.repeat(43);
const HOUR = 60 * 60 * 1000;

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('the stored invite token', () => {
  it('is returned within the hour', () => {
    storeInviteToken(TOKEN, 1_000);
    expect(peekInviteToken(1_000 + HOUR - 1)).toBe(TOKEN);
  });

  it('is gone after an hour and a second', () => {
    storeInviteToken(TOKEN, 1_000);
    expect(peekInviteToken(1_000 + HOUR + 1_000)).toBeUndefined();
  });

  it('can be read more than once until it is cleared', () => {
    storeInviteToken(TOKEN, 1_000);
    expect(peekInviteToken(2_000)).toBe(TOKEN);
    expect(peekInviteToken(3_000)).toBe(TOKEN);
    clearInviteToken();
    expect(peekInviteToken(4_000)).toBeUndefined();
  });

  it('is undefined, and never throws, when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => storeInviteToken(TOKEN)).not.toThrow();
    expect(peekInviteToken()).toBeUndefined();
    expect(() => clearInviteToken()).not.toThrow();
  });

  it('is undefined when what is stored is not a token record', () => {
    window.localStorage.setItem('hearthwise-invite', 'not json');
    expect(peekInviteToken()).toBeUndefined();
  });
});

describe('tokenFromHash', () => {
  it('reads a 43-character token after the #', () => {
    expect(tokenFromHash(`#${TOKEN}`)).toBe(TOKEN);
  });

  it('rejects a token of the wrong length', () => {
    expect(tokenFromHash(`#${'A'.repeat(42)}`)).toBeUndefined();
    expect(tokenFromHash(`#${'A'.repeat(44)}`)).toBeUndefined();
  });

  it('rejects characters outside base64url', () => {
    expect(tokenFromHash(`#${'A'.repeat(42)}+`)).toBeUndefined();
    expect(tokenFromHash(`#${'A'.repeat(42)}=`)).toBeUndefined();
  });

  it('rejects an empty hash', () => {
    expect(tokenFromHash('')).toBeUndefined();
    expect(tokenFromHash('#')).toBeUndefined();
  });
});
