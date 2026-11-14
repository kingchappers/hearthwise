import { describe, expect, it } from 'vitest';
import { invalid } from '../http';

describe('invalid', () => {
  it('answers 400 with the error code and the field', () => {
    const res = invalid('settings.digest.hour');
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: 'invalid', field: 'settings.digest.hour' });
  });
});
