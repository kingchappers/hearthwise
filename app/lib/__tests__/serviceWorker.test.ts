import { beforeEach, describe, expect, it, vi } from 'vitest';
import { onUpdateReady, registerServiceWorker, resetUpdateForTests, updateIsReady } from '../serviceWorker';

type Listener = () => void;

// A fake registration: tests drive its states by hand.
function fakeRegistration(over: { waiting?: object; installing?: { state: string; listeners: Listener[] } } = {}) {
  const listeners = new Map<string, Listener[]>();
  const registration = {
    waiting: over.waiting ?? null,
    installing: over.installing ? { get state() { return over.installing!.state; }, addEventListener: (_: string, fn: Listener) => over.installing!.listeners.push(fn) } : null,
    addEventListener: (name: string, fn: Listener) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    fire: (name: string) => (listeners.get(name) ?? []).forEach(fn => fn()),
  };
  return registration;
}

const navigatorWith = (registration: ReturnType<typeof fakeRegistration> | Error, controller: object | null = {}) => ({
  serviceWorker: { controller, register: vi.fn(() => (registration instanceof Error ? Promise.reject(registration) : Promise.resolve(registration))) },
}) as unknown as Navigator;

beforeEach(() => {
  resetUpdateForTests();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('registerServiceWorker', () => {
  it('registers /sw.js', async () => {
    const nav = navigatorWith(fakeRegistration());
    await registerServiceWorker(nav, true);
    expect(nav.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
  });

  it('does nothing, quietly, where service workers are not supported', async () => {
    await expect(registerServiceWorker({} as Navigator, true)).resolves.toBeUndefined();
  });

  it('does nothing in development, where no worker is built', async () => {
    const nav = navigatorWith(fakeRegistration());
    await registerServiceWorker(nav, false);
    expect(nav.serviceWorker.register).not.toHaveBeenCalled();
  });

  it('logs a failed registration and carries on', async () => {
    await expect(registerServiceWorker(navigatorWith(new Error('blocked')), true)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('says an update is ready when a new worker is already waiting and an old one is in control', async () => {
    await registerServiceWorker(navigatorWith(fakeRegistration({ waiting: {} })), true);
    expect(updateIsReady()).toBe(true);
  });

  it('says nothing about a first install (nothing old is in control)', async () => {
    await registerServiceWorker(navigatorWith(fakeRegistration({ waiting: {} }), null), true);
    expect(updateIsReady()).toBe(false);
  });

  it('says an update is ready once a new worker has installed', async () => {
    const installing = { state: 'installing', listeners: [] as Listener[] };
    const registration = fakeRegistration({ installing });
    await registerServiceWorker(navigatorWith(registration), true);
    registration.fire('updatefound');
    expect(updateIsReady()).toBe(false);
    installing.state = 'installed';
    installing.listeners.forEach(fn => fn());
    expect(updateIsReady()).toBe(true);
  });
});

describe('onUpdateReady', () => {
  it('tells a listener, and stops when it unsubscribes', async () => {
    const heard = vi.fn();
    const stop = onUpdateReady(heard);
    await registerServiceWorker(navigatorWith(fakeRegistration({ waiting: {} })), true);
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    resetUpdateForTests();
    await registerServiceWorker(navigatorWith(fakeRegistration({ waiting: {} })), true);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
