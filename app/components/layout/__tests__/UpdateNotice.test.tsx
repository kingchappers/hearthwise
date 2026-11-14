import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { markUpdateReadyForTests, resetUpdateForTests } from '~/lib/serviceWorker';
import { UpdateNotice } from '../UpdateNotice';

beforeEach(() => resetUpdateForTests());
const renderNotice = () => render(<MantineProvider env="test"><UpdateNotice /></MantineProvider>);

describe('UpdateNotice', () => {
  it('shows nothing until an update is waiting', () => {
    renderNotice();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says a new version is ready and will load next time, and can be dismissed', async () => {
    renderNotice();
    act(() => markUpdateReadyForTests());
    expect(screen.getByRole('status')).toHaveTextContent("New version ready. It'll load next time.");
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('has no small buttons', () => {
    renderNotice();
    act(() => markUpdateReadyForTests());
    for (const button of screen.getAllByRole('button')) expect(button.getAttribute('data-size')).not.toBe('xs');
  });
});
