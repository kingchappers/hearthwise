import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

const removeMember = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const updateMe = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('~/lib/household', () => ({
  useRemoveMember: () => ({ mutateAsync: removeMember, isPending: false }),
  useUpdateMe: () => ({ mutateAsync: updateMe, isPending: false }),
}));

import { Members } from '../Members';
import type { HouseholdData } from '~/lib/household';

const MEMBERS = [
  { userId: 'auth0|ann', displayName: 'Ann', joinedAt: '2026-11-13T00:00:00Z' },
  { userId: 'auth0|bea', displayName: 'Bea', joinedAt: '2026-11-13T00:00:00Z' },
];

function data(meId: string): HouseholdData {
  return {
    household: { name: 'Home', timezone: 'Europe/London', createdBy: 'auth0|ann', createdAt: '', memberCount: 2 },
    members: MEMBERS,
    me: { ...MEMBERS.find(member => member.userId === meId)!, settings: {} as never },
  };
}

function renderMembers(meId: string) {
  return render(<MantineProvider env="test"><Members data={data(meId)} /></MantineProvider>);
}

beforeEach(() => {
  removeMember.mockClear();
  updateMe.mockClear();
});

describe('Members', () => {
  it('lists both members', () => {
    renderMembers('auth0|ann');
    expect(screen.getByText('Bea')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveValue('Ann');
  });

  it('saves an edited own display name', async () => {
    const user = userEvent.setup();
    renderMembers('auth0|ann');
    const input = screen.getByLabelText('Your name');
    await user.clear(input);
    await user.type(input, 'Ann B');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(updateMe).toHaveBeenCalledWith({ displayName: 'Ann B' });
  });

  it('shows the creator Remove only on the other member, and only acts after confirming', async () => {
    const user = userEvent.setup();
    renderMembers('auth0|ann');
    expect(screen.getAllByRole('button', { name: /Remove .* from household/ })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove Bea from household' }));
    expect(removeMember).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Remove Bea from the household?');
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Keep Bea' }));
    expect(removeMember).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove Bea from household' }));
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Yes, remove Bea' }));
    expect(removeMember).toHaveBeenCalledWith('auth0|bea');
  });

  it('never shows Remove to the other member', () => {
    renderMembers('auth0|bea');
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });
});
