export class ApiError extends Error {
  readonly status: number;
  // The server's error code from the response body (for example 'no_household'), when it sent one.
  readonly code?: string;
  // Set on 409 already_member: whether the person's current household is empty and may be moved out of.
  readonly canMove?: boolean;

  constructor(status: number, statusText: string, code?: string, extra: { canMove?: boolean } = {}) {
    super(`API error: ${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.canMove = extra.canMove;
  }
}
