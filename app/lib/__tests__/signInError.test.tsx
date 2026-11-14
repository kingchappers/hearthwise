import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { clearSignInErrorFromAddress, consumeSignInStarted, markSignInStarted, readSignInError } from '../signInError';
import { SignedOutPanel } from '~/components/layout/SignedOutPanel';

const UNAUTHORIZED = '?error=invalid_request&error_description=Client%20%22x%22%20is%20not%20authorized%20to%20access%20resource%20server%20%22https%3A%2F%2Fhearthwise-api%22.&state=abc';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  window.sessionStorage.clear();
});

describe('readSignInError', () => {
  it('returns the code and the decoded sentence', () => {
    expect(readSignInError(UNAUTHORIZED)).toEqual({
      code: 'invalid_request',
      message: 'Client "x" is not authorized to access resource server "https://hearthwise-api".',
    });
  });

  it('returns undefined when there is no error parameter', () => {
    expect(readSignInError('?code=abc&state=def')).toBeUndefined();
    expect(readSignInError('')).toBeUndefined();
  });

  it('cuts a very long description to 300 characters', () => {
    const result = readSignInError(`?error=server_error&error_description=${'x'.repeat(10_000)}`);
    expect(result?.message).toHaveLength(300);
  });

  it('still reports an error that has no description', () => {
    expect(readSignInError('?error=access_denied')).toEqual({ code: 'access_denied', message: '' });
  });
});

describe('clearSignInErrorFromAddress', () => {
  it('removes error, error_description and state and keeps the rest', () => {
    window.history.replaceState(null, '', `/join${UNAUTHORIZED}&keep=1#frag`);
    clearSignInErrorFromAddress();
    expect(window.location.pathname).toBe('/join');
    expect(window.location.search).toBe('?keep=1');
    expect(window.location.hash).toBe('#frag');
  });

  it('leaves a bare path when nothing else was there', () => {
    window.history.replaceState(null, '', `/${UNAUTHORIZED}`);
    clearSignInErrorFromAddress();
    expect(window.location.search).toBe('');
  });
});

function renderPanel(signInError?: { code: string; message: string }) {
  return render(<MantineProvider env="test"><SignedOutPanel sessionEnded={false} signInError={signInError} /></MantineProvider>);
}

describe('SignedOutPanel with a sign-in error', () => {
  it('shows the message in an alert, with the docs hint for an unauthorized resource server', () => {
    renderPanel(readSignInError(UNAUTHORIZED));
    expect(screen.getByRole('alert')).toHaveTextContent('is not authorized to access resource server');
    expect(screen.getByRole('alert')).toHaveTextContent("This app's Auth0 application has not been given access to its API yet. See docs/AUTH0.md.");
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('does not add the docs hint for other errors', () => {
    renderPanel({ code: 'access_denied', message: 'Access denied' });
    expect(screen.getByRole('alert')).toHaveTextContent('Access denied');
    expect(screen.getByRole('alert')).not.toHaveTextContent('docs/AUTH0.md');
  });

  it('renders markup in the message as inert text', () => {
    const { container } = renderPanel({ code: 'x', message: '<script>alert(1)</script>' });
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByRole('alert')).toHaveTextContent('<script>alert(1)</script>');
  });

  it('has no alert when there is no error', () => {
    renderPanel();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// Anyone can send a link with ?error_description=... in it. The page only believes one it was expecting: this tab started a sign-in.
describe('the sign-in marker', () => {
  it('is not set until a sign-in starts', () => {
    expect(consumeSignInStarted()).toBe(false);
  });

  it('is set by a sign-in start, and consumed once', () => {
    markSignInStarted();
    expect(consumeSignInStarted()).toBe(true);
    expect(consumeSignInStarted()).toBe(false);
  });

  it('reads as not started, and never throws, when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => markSignInStarted()).not.toThrow();
    expect(consumeSignInStarted()).toBe(false);
  });
});
