import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { letThemKnowOn, notifyFields, resetLetThemKnow, useLetThemKnow } from '../letThemKnow';

beforeEach(() => { resetLetThemKnow(); });

describe('Let them know', () => {
  it('is off by default, and says nothing to add to a write', () => {
    expect(letThemKnowOn()).toBe(false);
    expect(notifyFields()).toEqual({});
  });

  it('adds notify to a write while it is ticked', () => {
    const { result } = renderHook(() => useLetThemKnow());
    act(() => result.current.set(true));
    expect(result.current.on).toBe(true);
    expect(letThemKnowOn()).toBe(true);
    expect(notifyFields()).toEqual({ notify: true });
  });

  it('is used up by the save it was ticked for, so the next save does not message the other person', () => {
    const { result } = renderHook(() => useLetThemKnow());
    act(() => result.current.set(true));
    let used: ReturnType<typeof notifyFields> = {};
    act(() => { used = notifyFields(); });
    expect(used).toEqual({ notify: true });
    expect(letThemKnowOn()).toBe(false);
    expect(result.current.on).toBe(false);
    expect(notifyFields()).toEqual({});
  });

  it('says it told them after a save that carried the tick, until it is ticked again or the page changes', () => {
    const view = renderHook(() => useLetThemKnow());
    const { result } = view;
    expect(result.current.told).toBe(false);
    act(() => result.current.set(true));
    act(() => { notifyFields(); });
    expect(result.current.told).toBe(true);
    act(() => result.current.set(true));
    expect(result.current.told).toBe(false);
    act(() => { notifyFields(); });
    expect(result.current.told).toBe(true);
    view.unmount();
    expect(renderHook(() => useLetThemKnow()).result.current.told).toBe(false);
  });

  it('is shared by every box on the page, and goes off again when the last one leaves', () => {
    const page = renderHook(() => useLetThemKnow());
    const sheet = renderHook(() => useLetThemKnow());
    act(() => sheet.result.current.set(true));
    expect(page.result.current.on).toBe(true);
    sheet.unmount();
    expect(letThemKnowOn()).toBe(true);
    page.unmount();
    expect(letThemKnowOn()).toBe(false);
  });

  it('is never remembered between visits', () => {
    const first = renderHook(() => useLetThemKnow());
    act(() => first.result.current.set(true));
    first.unmount();
    expect(renderHook(() => useLetThemKnow()).result.current.on).toBe(false);
  });
});
