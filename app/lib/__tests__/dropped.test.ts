import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { clearDropped, dismissDropped, loadDropped, recordDropped, useDropped } from '../dropped';

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

describe('the dropped writes kept on this device', () => {
  it('keeps a notice for the person until they dismiss it, and brings it back after a reload', () => {
    window.localStorage.clear();
    recordDropped({ id: 'a', message: '"Milk" was not saved.', userId: 'u1' });
    clearDropped();
    expect(window.localStorage.getItem('hearthwise.dropped.u1')).not.toBeNull();
    const { result } = renderHook(() => useDropped());
    act(() => loadDropped('u1'));
    expect(result.current.map(entry => entry.message)).toEqual(['"Milk" was not saved.']);
    act(() => dismissDropped('a'));
    expect(JSON.parse(window.localStorage.getItem('hearthwise.dropped.u1') ?? '{}')).toEqual({ entries: [] });
  });

  it('shows the same words once, and never keeps another person\'s notice', () => {
    window.localStorage.clear();
    const { result } = renderHook(() => useDropped());
    act(() => { recordDropped({ id: 'a', message: 'Same', userId: 'u1' }); recordDropped({ id: 'b', message: 'Same', userId: 'u1' }); });
    expect(result.current).toHaveLength(1);
    act(() => loadDropped('u2'));
    expect(result.current).toHaveLength(1);
  });
});
