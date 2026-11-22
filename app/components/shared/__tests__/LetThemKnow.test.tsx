import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';

const household = vi.hoisted(() => ({ current: { status: 'ready', data: { me: { userId: 'a' }, members: [{ userId: 'a', displayName: 'Sam' }, { userId: 'b', displayName: 'Alex' }] } } as unknown }));
vi.mock('~/lib/household', () => ({ useHousehold: () => household.current }));

import { act } from '@testing-library/react';
import { letThemKnowOn, notifyFields, resetLetThemKnow } from '~/lib/letThemKnow';
import { LetThemKnow } from '../LetThemKnow';

const ui = () => render(<MantineProvider env="test"><LetThemKnow /></MantineProvider>);
beforeEach(() => {
  resetLetThemKnow();
  household.current = { status: 'ready', data: { me: { userId: 'a' }, members: [{ userId: 'a', displayName: 'Sam' }, { userId: 'b', displayName: 'Alex' }] } };
});

describe('LetThemKnow', () => {
  it('is a box named for the other member, unticked', () => {
    ui();
    expect(screen.getByRole('checkbox', { name: 'Tell Alex when I save a change' })).not.toBeChecked();
    expect(letThemKnowOn()).toBe(false);
  });

  it('turns the next writes on when ticked, and off again when unticked', async () => {
    const user = userEvent.setup();
    ui();
    await user.click(screen.getByRole('checkbox', { name: 'Tell Alex when I save a change' }));
    expect(letThemKnowOn()).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: 'Tell Alex when I save a change' }));
    expect(letThemKnowOn()).toBe(false);
  });

  it('says what it will do and when it clears, and says the other person was told after the save', async () => {
    const user = userEvent.setup();
    ui();
    expect(screen.getByText('Sends Alex one short message. It clears after each save.')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Tell Alex when I save a change' }));
    act(() => { notifyFields(); });
    expect(screen.getByRole('checkbox', { name: 'Tell Alex when I save a change' })).not.toBeChecked();
    expect(screen.getByRole('status')).toHaveTextContent('Alex was told.');
  });

  it('is not shown when there is nobody else in the household', () => {
    household.current = { status: 'ready', data: { me: { userId: 'a' }, members: [{ userId: 'a', displayName: 'Sam' }] } };
    ui();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});
