import { useSyncExternalStore } from 'react';

// Offline launch needs the service worker, so unlike an app that registers one only for reminders, this registers on every load.
let ready = false;
const listeners = new Set<() => void>();

function markReady(): void {
  if (ready) return;
  ready = true;
  listeners.forEach(listener => listener());
}

export const updateIsReady = (): boolean => ready;

export function onUpdateReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(onUpdateReady, updateIsReady, () => false);
}

export function resetUpdateForTests(): void {
  ready = false;
  listeners.clear();
}

export function markUpdateReadyForTests(): void {
  markReady();
}

// A new worker waits for the next launch: nothing here tells it to take over while a page is open, so an open page never loads files
// from a different build. "Update ready" means a new worker has installed and an old one is still in control.
export async function registerServiceWorker(nav: Navigator = navigator, enabled: boolean = !import.meta.env.DEV): Promise<void> {
  if (!enabled || !('serviceWorker' in nav)) return;
  try {
    const registration = await nav.serviceWorker.register('/sw.js');
    if (registration.waiting && nav.serviceWorker.controller) markReady();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && nav.serviceWorker.controller) markReady();
      });
    });
  } catch (error) {
    console.error('Could not register the service worker:', error);
  }
}
