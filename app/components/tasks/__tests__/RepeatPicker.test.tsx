import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { RepeatPicker } from '../RepeatPicker';

const show = (props: Partial<React.ComponentProps<typeof RepeatPicker>> = {}) =>
  render(<MantineProvider env="test"><RepeatPicker value={{ type: 'none' }} today="2026-11-16" onChange={vi.fn()} {...props} /></MantineProvider>);

describe('RepeatPicker', () => {
  it('offers a repeat counted from when a task is done, by default', () => {
    show();
    expect(screen.getByRole('option', { name: "Some days after I finish it" })).toBeInTheDocument();
  });

  it('leaves that out when told, as an event has no done', () => {
    show({ allowAfter: false });
    expect(screen.queryByRole('option', { name: "Some days after I finish it" })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Every few days, finished or not' })).toBeInTheDocument();
  });

  it('starts a new rule on the date it is given', async () => {
    const onChange = vi.fn();
    show({ onChange, today: '2026-11-18' });
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Repeat' }), 'week');
    expect(onChange).toHaveBeenCalledWith({ type: 'fixed', every: 1, unit: 'week', weekdays: ['wed'], startOn: '2026-11-18' });
  });
});
