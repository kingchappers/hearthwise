import { ApiError } from './apiError';

// What to say when something could not be done: which of three things went wrong, so a person is not sent to check Wi-Fi when the fault is elsewhere.
// `what` is the first sentence, for example "We could not save your name."
export function tryAgainText(what: string, error: unknown): string {
  if (error instanceof ApiError && error.status >= 500) return `${what} Something went wrong on our side. Try again in a moment.`;
  if (error instanceof ApiError) return `${what} Check what you entered and try again.`;
  return `${what} Check your connection and try again.`;
}
