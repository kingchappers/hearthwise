import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import type { Material } from '../../../../src/projects/types';
import { expectNoViolations } from '~/test-utils/accessibility';
import { MaterialsSection } from '../MaterialsSection';

const material = (id: string, text: string): Material => ({ id, projectId: 'p1', text, fieldTimes: { text: 1 }, createdBy: 'u', createdAt: 1, updatedAt: 1, updatedBy: 'u' });

function setup(materials: Material[], extra: { unsaved?: string[]; listState?: [string, 'onList' | 'cleared'][] } = {}) {
  const actions = { addMaterials: vi.fn(), editMaterial: vi.fn(), deleteMaterial: vi.fn(), copyToList: vi.fn() };
  const view = render(
    <MantineProvider env="test">
      <MaterialsSection projectId="p1" materials={materials} unsavedIds={new Set(extra.unsaved ?? [])} listState={new Map(extra.listState ?? [])} actions={actions} />
    </MantineProvider>,
  );
  return { actions, ...view };
}

describe('the materials section', () => {
  it('is only a button until used, and asks for nothing', async () => {
    const { actions } = setup([]);
    expect(screen.queryByText('Materials')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add materials' }));
    expect(screen.getByRole('heading', { name: 'Materials' })).toBeInTheDocument();
    expect(actions.addMaterials).not.toHaveBeenCalled();
  });

  it('adds one line for each pasted line, trimmed', async () => {
    const { actions } = setup([material('m1', 'Timber')]);
    await userEvent.type(screen.getByLabelText('Add materials'), '6 lengths of 47x100 timber, 2.4m{Enter}  1 box of 75mm screws ');
    await userEvent.click(screen.getAllByRole('button', { name: 'Add materials' }).at(-1)!);
    expect(actions.addMaterials).toHaveBeenCalledWith('p1', ['6 lengths of 47x100 timber, 2.4m', '1 box of 75mm screws']);
  });

  it('shows each line with where it stands on the shopping list, in words', () => {
    setup([material('m1', 'Timber'), material('m2', 'Screws'), material('m3', 'Paint')], { listState: [['m1', 'onList'], ['m2', 'cleared']], unsaved: ['m3'] });
    const rows = screen.getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('On the list');
    expect(rows[1]).toHaveTextContent('Added earlier, and since cleared');
    expect(rows[2]).toHaveTextContent('Not saved yet');
  });

  it('copies every saved line to the shopping list in one press, and leaves out a line that is not saved yet', async () => {
    const { actions } = setup([material('m1', 'Timber'), material('m2', 'Screws')], { unsaved: ['m2'] });
    await userEvent.click(screen.getByRole('button', { name: 'Add to the shopping list' }));
    expect(actions.copyToList).toHaveBeenCalledWith('p1', ['m1']);
  });

  it('turns the copy off when every line is unsaved', () => {
    setup([material('m1', 'Timber')], { unsaved: ['m1'] });
    expect(screen.getByRole('button', { name: 'Add to the shopping list' })).toBeDisabled();
  });

  it('edits a line, sending only a changed one, and deletes a line', async () => {
    const { actions } = setup([material('m1', 'Timber')]);
    await userEvent.click(screen.getByRole('button', { name: 'Edit: Timber' }));
    await userEvent.clear(screen.getByLabelText('Material'));
    await userEvent.type(screen.getByLabelText('Material'), 'Treated timber');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(actions.editMaterial).toHaveBeenCalledWith('p1', 'm1', 'Treated timber');
    await userEvent.click(screen.getByRole('button', { name: 'Delete line: Timber' }));
    expect(actions.deleteMaterial).toHaveBeenCalledWith('p1', expect.objectContaining({ id: 'm1' }));
  });

  it('has no accessibility violations and 44px buttons', async () => {
    const { container } = setup([material('m1', 'Timber')]);
    await expectNoViolations(container);
    for (const button of within(container).getAllByRole('button')) expect(button, button.textContent ?? '').toHaveStyle({ minHeight: '44px' });
  });
});
