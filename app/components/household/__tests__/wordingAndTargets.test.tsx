import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

const noop = vi.hoisted(() => ({ mutateAsync: vi.fn().mockResolvedValue({ link: 'https://x/join#T', expiresAt: 2_000_000_000, hash: 'a'.repeat(64) }), isPending: false }));
vi.mock('~/lib/household', () => ({
  useCreateHousehold: () => noop,
  useCreateInvite: () => noop,
  useRevokeInvite: () => noop,
  useRemoveMember: () => noop,
  useUpdateMe: () => noop,
  useInvites: () => ({ data: [{ hash: 'b'.repeat(64), createdBy: 'a', expiresAt: 2_000_000_000 }] }),
}));

import { CreateHousehold } from '../CreateHousehold';
import { InviteLink } from '../InviteLink';
import { Members } from '../Members';

const DATA = {
  household: { name: 'Home', timezone: 'UTC', createdBy: 'a', createdAt: '', memberCount: 2 },
  members: [{ userId: 'a', displayName: 'Ann', joinedAt: '' }, { userId: 'b', displayName: 'Bea', joinedAt: '' }],
  me: { userId: 'a', displayName: 'Ann', joinedAt: '', settings: {} as never },
};

// Compact buttons are lifted to 44px on touch screens by app.css; "xs" ones are not, so none may be xs.
describe('the household components', () => {
  it('use neutral wording and no button smaller than the touch minimum, including after a confirmation opens', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MantineProvider env="test">
        <CreateHousehold defaultDisplayName="Ann" />
        <Members data={DATA} />
        <InviteLink />
      </MantineProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Remove Bea from household' }));
    await user.click(screen.getByRole('button', { name: 'Create invite link' }));
    await screen.findByRole('button', { name: 'Copy link' });

    expect(container.textContent).not.toMatch(/overdue|missed|streak/i);
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.length).toBeGreaterThan(5);
    for (const button of buttons) expect(button.getAttribute('data-size'), button.textContent ?? '').not.toBe('xs');
  });
});
