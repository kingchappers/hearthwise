import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { PasteInvite, tokenFromPasted } from '../PasteInvite';

const TOKEN = 'A'.repeat(43);

beforeEach(() => window.localStorage.clear());

describe('tokenFromPasted', () => {
  it('reads a whole link, a link with spaces round it, or the token alone', () => {
    expect(tokenFromPasted(`https://hearthwise.example/join#${TOKEN}`)).toBe(TOKEN);
    expect(tokenFromPasted(`  https://x/join#${TOKEN}\n`)).toBe(TOKEN);
    expect(tokenFromPasted(TOKEN)).toBe(TOKEN);
    expect(tokenFromPasted('https://x/join#short')).toBeUndefined();
  });
});

describe('PasteInvite', () => {
  function renderPaste() {
    return render(<MantineProvider env="test"><MemoryRouter><Routes><Route path="/" element={<PasteInvite />} /><Route path="/join" element={<p>Join page</p>} /></Routes></MemoryRouter></MantineProvider>);
  }

  it('keeps the token and goes to the join page', async () => {
    renderPaste();
    await userEvent.type(screen.getByLabelText('Invite link'), `https://x/join#${TOKEN}`);
    await userEvent.click(screen.getByRole('button', { name: 'Use this link' }));
    expect(screen.getByText('Join page')).toBeInTheDocument();
    expect(window.localStorage.getItem('hearthwise-invite')).toContain(TOKEN);
  });

  it('says what is wrong with a link that does not read, and goes nowhere', async () => {
    renderPaste();
    await userEvent.type(screen.getByLabelText('Invite link'), 'hello');
    await userEvent.click(screen.getByRole('button', { name: 'Use this link' }));
    expect(screen.getByText("That doesn't look like an invite link. Copy the whole link again.")).toBeInTheDocument();
    expect(screen.queryByText('Join page')).not.toBeInTheDocument();
  });
});
