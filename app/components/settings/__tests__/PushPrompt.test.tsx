import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

const state = vi.hoisted(() => ({ support: 'supported', vapid: 'KEY' as string | undefined, subscribed: false }));
vi.mock('~/lib/push', () => ({ pushSupport: () => state.support, hasPushSubscription: async () => state.subscribed }));
vi.mock('~/lib/runtimeConfig', () => ({ peekRuntimeConfig: () => (state.vapid ? { auth: 'local', vapidPublicKey: state.vapid } : { auth: 'local' }) }));

import { PushPrompt } from '../PushPrompt';

const ui = () => render(<MantineProvider env="test"><MemoryRouter><PushPrompt /></MemoryRouter></MantineProvider>);
beforeEach(() => { window.localStorage.clear(); state.support = 'supported'; state.vapid = 'KEY'; state.subscribed = false; });

describe('PushPrompt', () => {
  it('points once to the notification settings', async () => {
    ui();
    expect(await screen.findByRole('link', { name: 'Notification settings' })).toHaveAttribute('href', '/settings#notifications');
  });

  it('also appears on an iPhone that needs the app installed first, since the settings explain how', async () => {
    state.support = 'needs-install';
    ui();
    expect(await screen.findByRole('link', { name: 'Notification settings' })).toBeInTheDocument();
  });

  it('is gone for good once dismissed', async () => {
    const user = userEvent.setup();
    const first = ui();
    await user.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('link', { name: 'Notification settings' })).toBeNull();
    first.unmount();
    ui();
    expect(screen.queryByRole('link', { name: 'Notification settings' })).toBeNull();
  });

  it.each([
    ['the browser cannot do push', () => { state.support = 'unsupported'; }],
    ['the server has no push keys', () => { state.vapid = undefined; }],
    ['notifications are already on here', () => { state.subscribed = true; }],
  ])('is not shown when %s', async (_name, arrange) => {
    arrange();
    ui();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(screen.queryByRole('link', { name: 'Notification settings' })).toBeNull();
  });
});
