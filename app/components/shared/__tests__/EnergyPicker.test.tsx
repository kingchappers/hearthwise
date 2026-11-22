import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { Energy } from '../../../../src/shared/energy';
import { EnergyPicker } from '../EnergyPicker';
import { expectNoViolations } from '~/test-utils/accessibility';

const ui = (value: Energy | undefined, onChange = vi.fn()) => ({ onChange, ...render(<MantineProvider env="test"><EnergyPicker value={value} onChange={onChange} /></MantineProvider>) });

describe('EnergyPicker', () => {
  it('offers Not set and three sizes, with the current one chosen, and says it is optional', () => {
    ui('small');
    for (const name of ['Not set', 'Small', 'Medium', 'Big']) expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Small' })).toBeChecked();
    expect(screen.getByText(/Optional/)).toBeInTheDocument();
  });

  it('says Not set when there is no size, and reports a size or undefined when changed', async () => {
    const { onChange } = ui(undefined);
    expect(screen.getByRole('radio', { name: 'Not set' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: 'Big' }));
    expect(onChange).toHaveBeenLastCalledWith('big');
  });

  it('reports undefined when Not set is chosen', async () => {
    const { onChange } = ui('big');
    await userEvent.click(screen.getByRole('radio', { name: 'Not set' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('has no accessibility violations', async () => {
    const { container } = ui('medium');
    await expectNoViolations(container);
  });
});
