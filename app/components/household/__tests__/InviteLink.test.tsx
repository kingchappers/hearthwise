import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

const createInvite = vi.hoisted(() => vi.fn());
const revoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const invites = vi.hoisted(() => ({ data: [] as { hash: string; createdBy: string; expiresAt: number }[] }));
vi.mock('~/lib/household', () => ({
  useCreateInvite: () => ({ mutateAsync: createInvite, isPending: false }),
  useRevokeInvite: () => ({ mutateAsync: revoke, isPending: false }),
  useInvites: () => ({ data: invites.data }),
}));

import { InviteLink } from '../InviteLink';

const writeText = vi.fn().mockResolvedValue(undefined);

function renderInvite() {
  return render(<MantineProvider env="test"><InviteLink /></MantineProvider>);
}

beforeEach(() => {
  createInvite.mockReset().mockResolvedValue({ link: 'https://hearth.example/join#TOKEN', expiresAt: 2_000_000_000, hash: 'a'.repeat(64) });
  revoke.mockClear();
  writeText.mockClear();
  invites.data = [];
  Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
});

// userEvent.setup() installs its own clipboard, so ours goes in after it.
function setupUser() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return user;
}

describe('InviteLink', () => {
  it('shows the new link once, and copies it', async () => {
    const user = setupUser();
    renderInvite();
    expect(screen.queryByText(/join#TOKEN/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Create invite link' }));
    expect(await screen.findByText('https://hearth.example/join#TOKEN')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(writeText).toHaveBeenCalledWith('https://hearth.example/join#TOKEN');
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('offers Share only where the device can share', async () => {
    const user = setupUser();
    renderInvite();
    await user.click(screen.getByRole('button', { name: 'Create invite link' }));
    await screen.findByText(/join#TOKEN/);
    expect(screen.queryByRole('button', { name: 'Share link' })).not.toBeInTheDocument();
  });

  it('shares the link through the Web Share API when the device has it', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const user = setupUser();
    renderInvite();
    await user.click(screen.getByRole('button', { name: 'Create invite link' }));
    await user.click(await screen.findByRole('button', { name: 'Share link' }));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://hearth.example/join#TOKEN' }));
  });

  it('lists open invites and revokes one', async () => {
    invites.data = [{ hash: 'b'.repeat(64), createdBy: 'auth0|ann', expiresAt: 2_000_000_000 }];
    const user = setupUser();
    renderInvite();
    expect(screen.getByText(/Open invite, expires/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(revoke).toHaveBeenCalledWith('b'.repeat(64));
  });

  it('says in plain words when the household is full', async () => {
    createInvite.mockRejectedValue(Object.assign(new Error('x'), { status: 409, code: 'household_full' }));
    const user = setupUser();
    renderInvite();
    await user.click(screen.getByRole('button', { name: 'Create invite link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your household already has two people.');
  });
});
