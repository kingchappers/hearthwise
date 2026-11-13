export class ApiError extends Error {
  readonly status: number;
  // The server's error code from the response body (for example 'no_household'), when it sent one.
  readonly code?: string;

  constructor(status: number, statusText: string, code?: string) {
    super(`API error: ${status} ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}
