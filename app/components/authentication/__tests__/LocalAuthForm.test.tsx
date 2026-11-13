import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { LocalAuthForm } from '../LocalAuthForm';

type Mode = 'login' | 'setup' | 'invite';

function renderForm(props: { mode: Mode; onLogin?: any; onSetup?: any; onSignup?: any; defaultDisplayName?: string }) {
  return render(
    <MantineProvider env="test">
      <LocalAuthForm
        mode={props.mode}
        onLogin={props.onLogin ?? vi.fn()}
        onSetup={props.onSetup ?? vi.fn()}
        onSignup={props.onSignup ?? vi.fn()}
      />
    </MantineProvider>,
  );
}

function fill(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('LocalAuthForm', () => {
  it('shows email and password only when signing in', () => {
    renderForm({ mode: 'login' });
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.queryByLabelText('Setup code')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('asks for the setup code and a name on first run, and says where to find the code', () => {
    renderForm({ mode: 'setup' });
    expect(screen.getByLabelText('Setup code')).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByText(/SETUP_CODE\.txt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('asks for a name but no setup code when joining by invite', () => {
    renderForm({ mode: 'invite' });
    expect(screen.queryByLabelText('Setup code')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeInTheDocument();
  });

  it('submits the login fields', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    renderForm({ mode: 'login', onLogin });
    fill('Email', 'me@example.com');
    fill('Password', 'a long enough password');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('me@example.com', 'a long enough password'));
  });

  it('submits the setup fields', async () => {
    const onSetup = vi.fn().mockResolvedValue(undefined);
    renderForm({ mode: 'setup', onSetup });
    fill('Setup code', 'abc123');
    fill('Email', 'me@example.com');
    fill('Your name', ' Me ');
    fill('Password', 'a long enough password');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(onSetup).toHaveBeenCalledWith({ code: 'abc123', email: 'me@example.com', password: 'a long enough password', displayName: 'Me' }));
  });

  it('submits the invite fields without a code', async () => {
    const onSignup = vi.fn().mockResolvedValue(undefined);
    renderForm({ mode: 'invite', onSignup });
    fill('Email', 'you@example.com');
    fill('Your name', 'You');
    fill('Password', 'a long enough password');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(onSignup).toHaveBeenCalledWith({ email: 'you@example.com', password: 'a long enough password', displayName: 'You' }));
  });

  it('shows the server message when it fails, without clearing the email', async () => {
    const onLogin = vi.fn().mockRejectedValue(new Error('Invalid email or password'));
    renderForm({ mode: 'login', onLogin });
    fill('Email', 'me@example.com');
    fill('Password', 'wrong password here');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('me@example.com');
  });

  it('says every field is required', () => {
    renderForm({ mode: 'login' });
    expect(screen.getByText('All fields are required.')).toBeInTheDocument();
  });

  it('does not create an account with a password that is too short', () => {
    const onSetup = vi.fn();
    renderForm({ mode: 'setup', onSetup });
    fill('Setup code', 'abc123');
    fill('Email', 'me@example.com');
    fill('Your name', 'Me');
    fill('Password', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Password must be at least 12 characters');
    expect(onSetup).not.toHaveBeenCalled();
  });

  it('does not create an account without a name, or with one over 40 characters', () => {
    const onSetup = vi.fn();
    renderForm({ mode: 'setup', onSetup });
    fill('Setup code', 'abc123');
    fill('Email', 'me@example.com');
    fill('Password', 'a long enough password');
    fill('Your name', '   ');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Your name must be 1 to 40 characters');
    fill('Your name', 'N'.repeat(41));
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Your name must be 1 to 40 characters');
    expect(onSetup).not.toHaveBeenCalled();
  });

  it('still submits a short password when signing in', async () => {
    const onLogin = vi.fn().mockResolvedValue(undefined);
    renderForm({ mode: 'login', onLogin });
    fill('Email', 'me@example.com');
    fill('Password', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith('me@example.com', 'short'));
  });

  it('tells a first-run user where the code is without naming Docker', () => {
    renderForm({ mode: 'setup' });
    expect(screen.getByText(/host's logs/i)).toBeInTheDocument();
    expect(screen.queryByText(/docker/i)).not.toBeInTheDocument();
  });

  it('offers a forgot-your-password link on the sign-in form only', () => {
    const { unmount } = renderForm({ mode: 'login' });
    expect(screen.getByRole('link', { name: /how to reset it/i })).toHaveAttribute('href', expect.stringContaining('SELF-HOSTING.md#forgot-your-password'));
    unmount();
    renderForm({ mode: 'setup' });
    expect(screen.queryByRole('link', { name: /how to reset it/i })).not.toBeInTheDocument();
  });

  it('has no recovery form', () => {
    renderForm({ mode: 'login' });
    expect(screen.queryByLabelText('Recovery code')).not.toBeInTheDocument();
    expect(screen.queryByText(/recovery/i)).not.toBeInTheDocument();
  });
});
