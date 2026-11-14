import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearDropped, dismissDropped, recordDropped, useDropped } from '../dropped';

beforeEach(() => clearDropped());

describe('the dropped writes', () => {
  it('lists each write the server refused, newest last, and tells a component when it changes', () => {
    const { result } = renderHook(() => useDropped());
    expect(result.current).toEqual([]);
    act(() => { recordDropped({ id: 'a', message: 'First' }); recordDropped({ id: 'b', message: 'Second' }); });
    expect(result.current.map(entry => entry.message)).toEqual(['First', 'Second']);
  });

  it('dismisses one by id, and clears them all', () => {
    const { result } = renderHook(() => useDropped());
    act(() => { recordDropped({ id: 'a', message: 'First' }); recordDropped({ id: 'b', message: 'Second' }); });
    act(() => dismissDropped('a'));
    expect(result.current.map(entry => entry.id)).toEqual(['b']);
    act(() => clearDropped());
    expect(result.current).toEqual([]);
  });

  it('keeps an ask action with its entry', () => {
    const ask = () => undefined;
    const { result } = renderHook(() => useDropped());
    act(() => recordDropped({ id: 'a', message: 'Needs their say', ask }));
    expect(result.current[0].ask).toBe(ask);
  });

  it('does not list the same entry twice', () => {
    const { result } = renderHook(() => useDropped());
    act(() => { recordDropped({ id: 'a', message: 'Once' }); recordDropped({ id: 'a', message: 'Once' }); });
    expect(result.current).toHaveLength(1);
  });
});
