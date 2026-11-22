import { describe, expect, it } from 'vitest';
import { ApiError } from '../apiError';
import { tryAgainText } from '../tryAgain';

describe('tryAgainText', () => {
  it('blames the connection only when the request did not reach the server', () => {
    expect(tryAgainText('We could not save your name.', new TypeError('Failed to fetch'))).toBe('We could not save your name. Check your connection and try again.');
  });

  it('says the fault is ours for a server error, and points at the input for a refusal', () => {
    expect(tryAgainText('We could not save your name.', new ApiError(500, 'Server'))).toBe('We could not save your name. Something went wrong on our side. Try again in a moment.');
    expect(tryAgainText('We could not save your name.', new ApiError(400, 'Bad'))).toBe('We could not save your name. Check what you entered and try again.');
  });
});
