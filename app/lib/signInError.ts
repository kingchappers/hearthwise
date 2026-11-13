// What Auth0 puts in the address when sign-in fails: ?error=...&error_description=...&state=...
export interface SignInError {
  code: string;
  message: string;
}

const MAX_MESSAGE = 300;
const PARAMETERS = ['error', 'error_description', 'state'];

export function readSignInError(search: string): SignInError | undefined {
  const params = new URLSearchParams(search);
  const code = params.get('error');
  if (!code) return undefined;
  return { code, message: (params.get('error_description') ?? '').trim().slice(0, MAX_MESSAGE) };
}

export function clearSignInErrorFromAddress(): void {
  const url = new URL(window.location.href);
  PARAMETERS.forEach(name => url.searchParams.delete(name));
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
}
