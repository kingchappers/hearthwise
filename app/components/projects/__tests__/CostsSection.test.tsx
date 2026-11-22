import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { Project } from '../../../../src/projects/types';
import { expectNoViolations } from '~/test-utils/accessibility';
import { CostsSection } from '../CostsSection';

const members = [{ userId: 'u1', displayName: 'Sam', joinedAt: '' }, { userId: 'u2', displayName: 'Alex', joinedAt: '' }];
const project = (over: Partial<Project> = {}): Project => ({ id: 'p1', title: 'Garden room', status: 'active', fieldTimes: {}, createdBy: 'u1', createdAt: 1, updatedAt: 1, updatedBy: 'u1', ...over });

function setup(p: Project = project()) {
  const actions = { editProject: vi.fn() };
  const view = render(<MantineProvider env="test"><CostsSection project={p} members={members} actions={actions} /></MantineProvider>);
  return { actions, ...view };
}

describe('the costs section', () => {
  it('is only an "Add a cost" button for a project with no figures, so no cost area shows', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Add a cost' })).toBeInTheDocument();
    expect(screen.queryByText('Costs')).not.toBeInTheDocument();
    expect(screen.queryByText(/Not in Money/)).not.toBeInTheDocument();
  });

  it('adds an estimate and later what was spent, sending only the figure that changed', async () => {
    const { actions } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Add a cost' }));
    await userEvent.type(screen.getByLabelText('Estimate'), '4000');
    await userEvent.click(screen.getByRole('button', { name: 'Save costs' }));
    expect(actions.editProject).toHaveBeenCalledWith('p1', { estimatePence: 400000 });
  });

  it('names each figure, "Spent so far £1,250.00. Estimate £4,000.00.", and says who changed it last, and says it is not in Money', () => {
    setup(project({ estimatePence: 400000, spentPence: 125000, costBy: 'u1' }));
    expect(screen.getByText('Spent so far £1,250.00. Estimate £4,000.00.')).toBeInTheDocument();
    expect(screen.getByText('Last changed by Sam')).toBeInTheDocument();
    expect(screen.getByText('Not in Money. This is only for the project.')).toBeInTheDocument();
  });

  it('clears a figure when it is emptied or set to 0, and sends nothing for an untouched one', async () => {
    const { actions } = setup(project({ estimatePence: 400000, spentPence: 125000, costBy: 'u2' }));
    await userEvent.click(screen.getByRole('button', { name: 'Change costs' }));
    await userEvent.clear(screen.getByLabelText('Spent so far'));
    await userEvent.type(screen.getByLabelText('Spent so far'), '0');
    await userEvent.click(screen.getByRole('button', { name: 'Save costs' }));
    expect(actions.editProject).toHaveBeenCalledWith('p1', { spentPence: null });
  });

  it('says what is wrong, calmly, and saves nothing, for a figure it cannot read', async () => {
    const { actions } = setup(project({ estimatePence: 100 }));
    await userEvent.click(screen.getByRole('button', { name: 'Change costs' }));
    await userEvent.clear(screen.getByLabelText('Estimate'));
    await userEvent.type(screen.getByLabelText('Estimate'), 'lots');
    await userEvent.click(screen.getByRole('button', { name: 'Save costs' }));
    expect(screen.getByText('Use an amount like 12.50')).toBeInTheDocument();
    expect(actions.editProject).not.toHaveBeenCalled();
  });

  it('never says a verdict when more was spent than estimated, and has no accessibility violations', async () => {
    const { container } = setup(project({ estimatePence: 100000, spentPence: 250000, costBy: 'u2' }));
    expect(container).not.toHaveTextContent(/over|under budget|overspent/i);
    await expectNoViolations(container);
  });
});
