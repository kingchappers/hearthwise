import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { Project } from '../../../../src/projects/types';
import { EditProjectSheet } from '../EditProjectSheet';

vi.mock('~/lib/household', () => ({ useHousehold: () => ({ data: { members: [{ userId: 'u1', displayName: 'Sam' }, { userId: 'u2', displayName: 'Alex' }], me: { userId: 'u1' } } }) }));

const project = (over: Partial<Project> = {}): Project => ({ id: 'p1', title: 'Decking', status: 'active', fieldTimes: {}, createdBy: 'u1', createdAt: 1, updatedAt: 1, updatedBy: 'u1', ...over });

function setup(p: Project = project()) {
  const actions = { editProject: vi.fn() };
  render(<MantineProvider env="test"><EditProjectSheet project={p} opened onClose={vi.fn()} actions={actions} /></MantineProvider>);
  return actions;
}

describe('the edit project sheet: the planned day', () => {
  it('sets a first day alone', async () => {
    const actions = setup();
    await userEvent.type(screen.getByLabelText('Planned for (day)'), '2026-12-05');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.editProject).toHaveBeenCalledWith('p1', { planned: { plannedOn: '2026-12-05', plannedEndOn: null } });
  });

  it('sets a first and last day, and sends only the planned day when nothing else changed', async () => {
    const actions = setup();
    await userEvent.type(screen.getByLabelText('Planned for (day)'), '2026-12-05');
    await userEvent.type(screen.getByLabelText('Last day (optional)'), '2026-12-06');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.editProject).toHaveBeenCalledWith('p1', { planned: { plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' } });
  });

  it('says what is wrong, calmly, when the last day is before the first, and saves nothing', async () => {
    const actions = setup();
    await userEvent.type(screen.getByLabelText('Planned for (day)'), '2026-12-05');
    await userEvent.type(screen.getByLabelText('Last day (optional)'), '2026-12-01');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('The last day must be on or after the first, and within 14 days.')).toBeInTheDocument();
    expect(actions.editProject).not.toHaveBeenCalled();
  });

  it('clears the planned day, and sends nothing for the day when it was not touched', async () => {
    const actions = setup(project({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear the planned day' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.editProject).toHaveBeenCalledWith('p1', { planned: { plannedOn: null } });
  });

  it('sends the planned day only when it changed, so an untouched day cannot replace the other person\'s edit', async () => {
    const actions = setup(project({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' }));
    await userEvent.clear(screen.getByLabelText('Title'));
    await userEvent.type(screen.getByLabelText('Title'), 'Garden room');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.editProject).toHaveBeenCalledWith('p1', { title: 'Garden room' });
  });
});
