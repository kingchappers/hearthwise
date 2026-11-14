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

// Anyone can send a link with ?error=...&error_description=... in it, and the description is free text. So the page shows an
// error only when this tab started a sign-in just before: login() leaves the marker, the layout takes it once on return.
const STARTED_KEY = 'hearthwise.signInStarted';

export function markSignInStarted(): void {
  try {
    window.sessionStorage.setItem(STARTED_KEY, '1');
  } catch (error) {
    console.warn('Could not note that sign-in started:', error);
  }
}

export function consumeSignInStarted(): boolean {
  try {
    const started = window.sessionStorage.getItem(STARTED_KEY) === '1';
    window.sessionStorage.removeItem(STARTED_KEY);
    return started;
  } catch (error) {
    console.warn('Could not read whether sign-in started:', error);
    return false;
  }
}

// Sign-in failures the app can explain beyond Auth0's own words. docs/AUTH0.md quotes each `contains` text (a test checks it),
// so the panel and the doc stay in step.
export const EXPLAINED_SYMPTOMS: readonly { contains: string; hint: string }[] = [
  {
    contains: 'is not authorized to access resource server',
    hint: "This app's Auth0 application has not been given access to its API yet. See docs/AUTH0.md.",
  },
];

export function explainSignInError(message: string): string | undefined {
  return EXPLAINED_SYMPTOMS.find(symptom => message.includes(symptom.contains))?.hint;
}
