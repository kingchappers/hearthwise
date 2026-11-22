import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter } from 'react-router';
import type { Project, Step } from '../../../../src/projects/types';
import type { ProjectActions } from '~/hooks/useProjectActions';
import type { ProjectDetailData } from '~/lib/projectOverlay';
import type { ProjectNotice } from '~/lib/projectNotices';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';
import { ProjectPage } from '../ProjectPage';
import { ProjectList } from '../ProjectList';
import { NoticeBar } from '../NoticeBar';

vi.mock('~/lib/household', () => ({ useHousehold: () => ({ data: { members: [{ userId: 'u1', displayName: 'Sam' }, { userId: 'u2', displayName: 'Alex' }], me: { userId: 'u1' } } }) }));

const ME = 'u1';
const THEM = 'u2';
const members = [{ userId: ME, displayName: 'Sam', joinedAt: '' }, { userId: THEM, displayName: 'Alex', joinedAt: '' }];
const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

const project = (over: Partial<Project> = {}): Project => ({ id: 'p1', title: 'Take down the decking', status: 'active', fieldTimes: {}, createdBy: ME, createdAt: 1, updatedAt: 1, updatedBy: ME, ...over });
const step = (id: string, position: string, over: Partial<Step> = {}): Step => ({
  id, projectId: 'p1', text: `Step ${id}`, state: 'todo', position, fieldTimes: {}, createdBy: ME, createdAt: 1, updatedAt: 1, updatedBy: ME, ...over,
});

function actions(): ProjectActions {
  return {
    me: ME, createProject: vi.fn(), editProject: vi.fn(), deleteProject: vi.fn(), restoreProject: vi.fn(), takeProject: vi.fn(), releaseProject: vi.fn(),
    addSteps: vi.fn(), editStep: vi.fn(), deleteStep: vi.fn(), undoDeleteStep: vi.fn(), takeStep: vi.fn(), releaseStep: vi.fn(),
    addMaterials: vi.fn(), editMaterial: vi.fn(), deleteMaterial: vi.fn(), undoDeleteMaterial: vi.fn(), copyToList: vi.fn(),
  };
}

let a: ProjectActions;
beforeEach(() => { window.localStorage.clear(); a = actions(); });

function page(data: Partial<ProjectDetailData> = {}, extra: { notices?: ProjectNotice[]; unsaved?: string[] } = {}) {
  const full: ProjectDetailData = { project: project(), steps: [step('a', 'i'), step('b', 'j'), step('c', 'k')], materials: [], serverTime: 0, ...data };
  return render(
    <MantineProvider env="test">
      <MemoryRouter>
        <ProjectPage data={full} me={ME} members={members} now={NOW} unsavedIds={new Set(extra.unsaved ?? [])} notices={extra.notices ?? []} actions={a} onBack={vi.fn()} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe('the project page', () => {
  it('shows the steps in order with their state in words', () => {
    page({ steps: [step('a', 'i'), step('b', 'j', { state: 'done' }), step('c', 'k', { takenBy: THEM, takenAt: NOW - 21 * DAY })] });
    const items = within(screen.getByRole('list', { name: 'Steps in order' })).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Not started');
    expect(items[1]).toHaveTextContent('Done');
    expect(items[2]).not.toHaveTextContent(/^On it\b/);
    expect(items[2]).toHaveTextContent('Alex has this');
    // One sentence says who has it; the state word "On it" is not repeated beside it.
    expect(items[2].textContent?.match(/On it/g)).toHaveLength(1);
    expect(items[2]).toHaveTextContent('On it for 3 weeks');
  });

  it('has no accessibility violations and sound headings', async () => {
    const { container } = page();
    await expectNoViolations(container);
    expectSoundHeadings(container);
  });

  it('keeps every button at least 44px tall', () => {
    page();
    for (const button of screen.getAllByRole('button')) expect(button, button.textContent ?? '').toHaveStyle({ minHeight: '44px' });
  });

  it('takes a free step, and offers "Give this step back" on a held one but not "Take this step" there', async () => {
    page({ steps: [step('a', 'i'), step('b', 'j', { takenBy: THEM, takenAt: NOW })] });
    const rows = screen.getAllByRole('listitem');
    await userEvent.click(within(rows[0]).getByRole('button', { name: /^Take this step/ }));
    expect(a.takeStep).toHaveBeenCalledWith('p1', 'a');
    expect(within(rows[1]).queryByRole('button', { name: /^Take this step/ })).not.toBeInTheDocument();
    await userEvent.click(within(rows[1]).getByRole('button', { name: 'Give this step back' }));
    expect(a.releaseStep).toHaveBeenCalledWith('p1', 'b');
  });

  it('ticks a step done in place', async () => {
    page();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Mark done: Step a' }));
    expect(a.editStep).toHaveBeenCalledWith('p1', 'a', { state: 'done' });
  });

  it('moves a step with a new position between its neighbours, and does not offer a move off either end', async () => {
    page();
    expect(screen.getByRole('button', { name: 'Move up: Step a' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move down: Step c' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Move up: Step c' }));
    const [, , changes] = (a.editStep as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(changes.position > 'i' && changes.position < 'j').toBe(true);
  });

  it('refuses a move calmly when there is no room, and writes nothing', async () => {
    page({ steps: [step('a', 'i'), step('b', 'i'), step('c', 'i')] });
    await userEvent.click(screen.getByRole('button', { name: 'Move up: Step c' }));
    expect(screen.getByText("This step can't be moved there. Move another step instead.")).toBeInTheDocument();
    expect(a.editStep).not.toHaveBeenCalled();
  });

  it('adds one step for each pasted line, in order, after the last', async () => {
    page();
    await userEvent.type(screen.getByLabelText('Add a step'), 'Ring the council{Enter}Order the skip');
    await userEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    const [, steps] = (a.addSteps as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(steps.map((s: { text: string }) => s.text)).toEqual(['Ring the council', 'Order the skip']);
    expect(steps[0].position > 'k' && steps[1].position > steps[0].position).toBe(true);
  });

  it('says "Not saved yet" for a step with a write waiting', () => {
    page({}, { unsaved: ['b'] });
    expect(within(screen.getAllByRole('listitem')[1]).getByText(/Not saved yet/)).toBeInTheDocument();
    expect(within(screen.getAllByRole('listitem')[0]).queryByText(/Not saved yet/)).not.toBeInTheDocument();
  });

  it('takes the whole project, and frees it when it is mine', async () => {
    const first = page();
    await userEvent.click(screen.getByRole('button', { name: "Take this project" }));
    expect(a.takeProject).toHaveBeenCalledWith('p1');
    first.unmount();
    page({ project: project({ takenBy: ME, takenAt: NOW }) });
    expect(screen.getByText("You have this")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Give this project back' }));
    expect(a.releaseProject).toHaveBeenCalledWith('p1');
  });

  it('shows a hold by someone who has left as nobody, so the project can be taken', () => {
    page({ project: project({ takenBy: 'gone', takenAt: NOW }) });
    expect(screen.queryByText(/is on this/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Take this project" })).toBeInTheDocument();
  });

  it('marks a project finished and brings it back', async () => {
    const first = page();
    await userEvent.click(screen.getByRole('button', { name: 'Mark as finished' }));
    expect(a.editProject).toHaveBeenCalledWith('p1', { status: 'finished' });
    first.unmount();
    page({ project: project({ status: 'finished' }) });
    await userEvent.click(screen.getByRole('button', { name: 'Reopen this project' }));
    expect(a.editProject).toHaveBeenLastCalledWith('p1', { status: 'active' });
  });

  it('works with only a title: no steps, no date, nothing asked for', () => {
    page({ steps: [] });
    expect(screen.getByText('No steps yet. Add the first one below.')).toBeInTheDocument();
    expect(screen.queryByText(/Planned for/)).not.toBeInTheDocument();
  });

  it('says a deleted project was deleted, and offers no edits', () => {
    page({ project: project({ deletedAt: NOW }), steps: [] });
    expect(screen.getByText(/This project was deleted/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as finished' })).not.toBeInTheDocument();
  });
});

describe('a finished project', () => {
  it('says Finished on the page itself, not only by changing a button, and no longer offers to take it', () => {
    page({ project: project({ status: 'finished' }) });
    expect(screen.getByText('Finished')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Take this project" })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reopen this project' })).toBeInTheDocument();
  });

  it('does not say Finished for an active project', () => {
    page();
    expect(screen.queryByText('Finished')).not.toBeInTheDocument();
  });

  it('deletes with the project, so the message can name it', async () => {
    page();
    await userEvent.click(screen.getByRole('button', { name: 'Delete project' }));
    expect(a.deleteProject).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1', title: 'Take down the decking' }));
  });
});

describe('the notices', () => {
  const stepNotice: ProjectNotice = { id: 'n3', kind: 'taken', projectId: 'p1', recordId: 'b', text: 'Alex already has "Step b". Nothing was changed.', at: 3 };
  const listNotice: ProjectNotice = { id: 'n4', kind: 'taken', projectId: 'p1', recordId: 'p1', field: 'list', text: 'Added 2 lines to Shopping.', at: 4 };

  it('shows a step\'s message on that step\'s row, not at the top of the page', () => {
    page({ steps: [step('a', 'i'), step('b', 'j')] }, { notices: [stepNotice] });
    const rows = screen.getAllByRole('listitem');
    expect(within(rows[1]).getByText(/Alex already has "Step b"/)).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/already has/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Alex already has/)).toHaveLength(1);
  });

  it('shows the Shopping message beside the Shopping button', () => {
    page({ materials: [{ id: 'm1', projectId: 'p1', text: 'Timber', fieldTimes: {}, createdBy: ME, createdAt: 1, updatedAt: 1, updatedBy: ME }] }, { notices: [listNotice] });
    const section = screen.getByRole('region', { name: 'Materials' });
    expect(within(section).getByText('Added 2 lines to Shopping.')).toBeInTheDocument();
  });

  const replaced: ProjectNotice = { id: 'n1', kind: 'replaced', projectId: 'p1', recordId: 'a', field: 'text', text: 'Sam wording kept', at: 1 };
  const taken: ProjectNotice = { id: 'n2', kind: 'taken', projectId: 'p1', recordId: 'a', text: 'Alex already has this', at: 2 };

  it('keeps a replaced edit\'s words with Copy and Dismiss, in calm words', () => {
    page({}, { notices: [replaced] });
    expect(screen.getByText('This was changed after you wrote it. Your wording is kept here.')).toBeInTheDocument();
    expect(screen.getByText('Sam wording kept')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
  });

  it('says "{name} already has this" for a refused take, with no Copy', () => {
    render(<MantineProvider env="test"><NoticeBar notices={[taken]} userId={ME} /></MantineProvider>);
    expect(screen.getByText('Alex already has this')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
  });
});

describe('the project list', () => {
  const render2 = (projects: Parameters<typeof ProjectList>[0]['projects']) => render(
    <MantineProvider env="test"><MemoryRouter><ProjectList projects={projects} members={members} me={ME} unsavedIds={new Set()} /></MemoryRouter></MantineProvider>,
  );

  it('says there are no projects yet', () => {
    render2([]);
    expect(screen.getByText('No projects yet. Add one when you start a bigger job.')).toBeInTheDocument();
  });

  it('shows steps done, who is on it, and puts a finished project under "Finished"', () => {
    render2([
      { ...project({ takenBy: THEM, takenAt: NOW }), counts: { steps: 8, done: 3, materials: 0 } },
      project({ id: 'p2', title: 'Fix the fence', status: 'finished' }),
    ]);
    expect(screen.getByText('3 of 8 steps done')).toBeInTheDocument();
    expect(screen.getByText('Alex has this')).toBeInTheDocument();
    const finished = screen.getByRole('region', { name: 'Finished' });
    expect(within(finished).getByText('Fix the fence')).toBeInTheDocument();
    expect(within(finished).queryByText('Take down the decking')).not.toBeInTheDocument();
  });

  it('links each project to its page', () => {
    render2([project()]);
    expect(screen.getByRole('link', { name: /Take down the decking/ })).toHaveAttribute('href', '/plan/projects/p1');
  });
});

describe('the step sheet', () => {
  it('says what happens when two people change a step, before they do', async () => {
    page();
    await userEvent.click(screen.getByRole('button', { name: 'Step a' }));
    expect(await screen.findByText('If you both change a step, the later save is kept. If yours is replaced, your words are kept for you.')).toBeInTheDocument();
  });
});

describe('half-typed words are kept', () => {
  it('keeps a list typed into Add a step when the page is left and come back to, and forgets it once the steps are added', async () => {
    const first = page();
    await userEvent.type(screen.getByLabelText('Add a step'), 'Ring the council{Enter}Order the skip');
    first.unmount();
    page();
    expect(screen.getByLabelText('Add a step')).toHaveValue('Ring the council\nOrder the skip');
    await userEvent.click(screen.getByRole('button', { name: 'Add a step' }));
    expect(a.addSteps).toHaveBeenCalled();
    expect(screen.getByLabelText('Add a step')).toHaveValue('');
  });

  it('keeps what was typed into the materials box', async () => {
    const first = page({ materials: [{ id: 'm1', projectId: 'p1', text: 'Timber', fieldTimes: {}, createdBy: ME, createdAt: 1, updatedAt: 1, updatedBy: ME }] });
    await userEvent.type(screen.getByLabelText('Add materials'), '1 box of screws');
    first.unmount();
    page({ materials: [{ id: 'm1', projectId: 'p1', text: 'Timber', fieldTimes: {}, createdBy: ME, createdAt: 1, updatedAt: 1, updatedBy: ME }] });
    expect(screen.getByLabelText('Add materials')).toHaveValue('1 box of screws');
  });

  it('keeps a half-typed note on a step when its sheet is closed without saving', async () => {
    const first = page();
    await userEvent.click(screen.getByRole('button', { name: 'Step a' }));
    await userEvent.type(await screen.findByLabelText('Note'), 'Use the long bar');
    first.unmount();
    page();
    await userEvent.click(screen.getByRole('button', { name: 'Step a' }));
    expect(await screen.findByLabelText('Note')).toHaveValue('Use the long bar');
  });
});
