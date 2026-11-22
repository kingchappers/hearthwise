import { beforeEach, describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { clearDeviceKeys } from '../deviceKeys';
import { readLittleEnergy, useLittleEnergy, writeLittleEnergy } from '../littleEnergy';

beforeEach(() => localStorage.clear());

describe('little energy', () => {
  it('is off until turned on, and on only for the day it was turned on', () => {
    expect(readLittleEnergy('u1', '2026-11-20')).toBe(false);
    writeLittleEnergy('u1', '2026-11-20', true);
    expect(readLittleEnergy('u1', '2026-11-20')).toBe(true);
    expect(readLittleEnergy('u1', '2026-11-21')).toBe(false);
  });

  it('is one person\'s on this device, not the other\'s, and is cleared at sign-out', () => {
    writeLittleEnergy('u1', '2026-11-20', true);
    expect(readLittleEnergy('u2', '2026-11-20')).toBe(false);
    clearDeviceKeys('u1');
    expect(readLittleEnergy('u1', '2026-11-20')).toBe(false);
  });

  it('can be turned off again, and the hook follows it', () => {
    const { result, rerender } = renderHook(({ day }) => useLittleEnergy('u1', day), { initialProps: { day: '2026-11-20' } });
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(result.current[0]).toBe(true);
    rerender({ day: '2026-11-21' });
    expect(result.current[0]).toBe(false);
    rerender({ day: '2026-11-20' });
    act(() => result.current[1](false));
    expect(result.current[0]).toBe(false);
  });

  it('does nothing without a signed-in person', () => {
    writeLittleEnergy('', '2026-11-20', true);
    expect(readLittleEnergy('', '2026-11-20')).toBe(false);
  });
});
