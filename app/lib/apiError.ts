export class ApiError extends Error {
  readonly status: number;
  // The server's error code from the response body (for example 'no_household'), when it sent one.
  readonly code?: string;
  // Set on 409 already_member: whether the person's current household is empty and may be moved out of.
  readonly canMove?: boolean;
  // A second code a refusal can carry: a calendar feed that could not be read says why (the body is { error: 'feed_failed', code }).
  readonly detail?: string;

  constructor(status: number, statusText: string, code?: string, extra: { canMove?: boolean; detail?: string } = {}) {
    super(`API error: ${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.canMove = extra.canMove;
    this.detail = extra.detail;
  }
}
