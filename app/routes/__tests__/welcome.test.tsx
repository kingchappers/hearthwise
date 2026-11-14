import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';

const auth = vi.hoisted(() => ({ user: { name: 'Ann Auth' } as { name?: string; nickname?: string } | undefined }));
vi.mock('~/lib/auth', () => ({ useAuth: () => ({ user: auth.user }) }));
vi.mock('~/components/layout/DefaultLayout', () => ({ DefaultLayout: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
const create = vi.hoisted(() => vi.fn().mockResolvedValue({ householdId: 'h' }));
vi.mock('~/lib/household', () => ({ useCreateHousehold: () => ({ mutateAsync: create, isPending: false }) }));

import Welcome, { meta } from '../welcome';

function renderWelcome() {
  return render(<MantineProvider env="test"><MemoryRouter><Welcome /></MemoryRouter></MantineProvider>);
}

beforeEach(() => {
  create.mockClear();
  auth.user = { name: 'Ann Auth' };
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Europe/London' } as Intl.ResolvedDateTimeFormatOptions);
});

describe('Welcome', () => {
  it('is titled Welcome', () => {
    expect(meta({} as never)).toEqual([{ title: 'Welcome – Hearthwise' }]);
  });

  it('leads with the invite prompt, before the create form', () => {
    renderWelcome();
    const prompt = screen.getByText('Waiting for an invite? Open the link your partner sent you.');
    const form = screen.getByRole('heading', { name: 'Create a household' });
    expect(prompt.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('prefills the name from the profile and the time zone from the browser', () => {
    renderWelcome();
    expect(screen.getByLabelText('Your name')).toHaveValue('Ann Auth');
    expect(screen.getByLabelText('Time zone')).toHaveValue('Europe/London');
  });

  it('falls back to the nickname when there is no name', () => {
    auth.user = { nickname: 'annie' };
    renderWelcome();
    expect(screen.getByLabelText('Your name')).toHaveValue('annie');
  });

  it('creates the household with the typed values', async () => {
    const user = userEvent.setup();
    renderWelcome();
    await user.type(screen.getByLabelText('Household name'), 'Our place');
    await user.click(screen.getByRole('button', { name: 'Create household' }));
    expect(create).toHaveBeenCalledWith({ name: 'Our place', displayName: 'Ann Auth', timezone: 'Europe/London' });
  });

  it('does not submit without a household name', async () => {
    const user = userEvent.setup();
    renderWelcome();
    await user.click(screen.getByRole('button', { name: 'Create household' }));
    expect(create).not.toHaveBeenCalled();
  });
});
