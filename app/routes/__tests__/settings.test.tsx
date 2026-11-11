import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import { readPreferences } from '~/lib/preferences';
import { SESSION_LIFETIME_TEXT } from '~/lib/sessionLifetime';

const logout = vi.hoisted(() => vi.fn());
vi.mock('~/lib/auth', () => ({ useAuth: () => ({ logout }) }));
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

describe('Settings', () => {
  it('is titled Settings', () => {
    expect(meta({} as never)).toEqual([{ title: 'Settings – Hearthwise' }]);
    renderSettings();
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
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
