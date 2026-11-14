import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { readPreferences } from '~/lib/preferences';
import { SESSION_LIFETIME_TEXT } from '~/lib/sessionLifetime';

const logout = vi.hoisted(() => vi.fn());
vi.mock('~/lib/signOut', () => ({ requestSignOut: logout }));
vi.mock('~/lib/household', () => ({ useHousehold: () => ({ status: 'loading', refetch: vi.fn() }), useUpdateMe: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('~/components/settings/Reminders', () => ({ Reminders: () => <p>reminders</p> }));
vi.mock('~/components/settings/QuietHours', () => ({ QuietHours: () => <p>quiet hours</p> }));
vi.mock('~/components/settings/DefaultView', () => ({ DefaultView: () => <p>default view</p> }));
vi.mock('~/components/settings/PushCheck', () => ({ PushCheck: () => <p>push check</p> }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

import Settings, { meta } from '../settings';

function renderSettings() {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </MantineProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  logout.mockClear();
});

describe('Settings: notifications', () => {
  it('has a Notifications section with the push check, reminders and quiet hours, and a section for your own view', () => {
    renderSettings();
    const notifications = screen.getByRole('heading', { level: 2, name: 'Notifications' }).closest('div[id], section, .mantine-Card-root') as HTMLElement;
    expect(notifications).toHaveTextContent('push check');
    expect(notifications).toHaveTextContent('reminders');
    expect(notifications).toHaveTextContent('quiet hours');
    expect(screen.getByRole('heading', { level: 2, name: 'Your view' })).toBeInTheDocument();
    expect(screen.getByText('default view')).toBeInTheDocument();
  });

  it('can be linked to: the Notifications section has the id the prompt points at', () => {
    const { container } = renderSettings();
    expect(container.querySelector('#notifications')).not.toBeNull();
  });
});

describe('Settings', () => {
  it('is titled Settings', () => {
    expect(meta({} as never)).toEqual([{ title: 'Settings – Hearthwise' }]);
    renderSettings();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('links to the Deleted page', () => {
    renderSettings();
    expect(screen.getByRole('link', { name: 'See deleted tasks' })).toHaveAttribute('href', '/deleted');
  });

  it('says how long you stay signed in, and signs out from a button', async () => {
    renderSettings();
    expect(screen.getByText(SESSION_LIFETIME_TEXT)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('saves the text size on this device', async () => {
    renderSettings();
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Large' }));
    expect(readPreferences(window.localStorage).textSize).toBe('large');
  });

  it('saves reduced motion on this device', async () => {
    renderSettings();
    await userEvent.setup().click(screen.getByRole('switch', { name: /^Reduce motion/ }));
    expect(readPreferences(window.localStorage).reduceMotion).toBe(true);
  });

  it('saves how long Undo messages stay on this device', async () => {
    renderSettings();
    await userEvent.setup().click(screen.getByRole('radio', { name: '10 seconds' }));
    expect(readPreferences(window.localStorage).undoDuration).toBe('10s');
  });

  it('offers a choice of light, dark or the device setting', () => {
    renderSettings();
    for (const name of ['Match my device', 'Light', 'Dark']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
  });

  it('has nothing left over from a budgeting app', () => {
    const { container } = renderSettings();
    expect(container.textContent ?? '').not.toMatch(/money|bill|budget|transaction|pay day|milestone|assistant|access token|API docs/i);
  });
});
