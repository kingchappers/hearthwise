import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { MemoryRouter, Route, Routes } from 'react-router';
import { expectNoViolations, expectSoundHeadings } from '~/test-utils/accessibility';

const state = vi.hoisted(() => ({
  projects: { status: 'ready', projects: [] as object[], deleted: [], me: 'u1', members: [{ userId: 'u1', displayName: 'Sam', joinedAt: '' }], unsavedIds: new Set<string>(), dataUpdatedAt: 1 as number | undefined },
  project: { status: 'ready', data: undefined as unknown, me: 'u1', members: [{ userId: 'u1', displayName: 'Sam', joinedAt: '' }], unsavedIds: new Set<string>(), dataUpdatedAt: 1 as number | undefined },
  actions: undefined as unknown,
}));

vi.mock('~/lib/projects', () => ({ useProjects: () => state.projects, useProject: () => state.project }));
vi.mock('~/hooks/useProjectActions', () => ({ useProjectActions: () => state.actions }));
vi.mock('~/lib/household', () => ({ useHousehold: () => ({ data: { members: [{ userId: 'u1', displayName: 'Sam' }], me: { userId: 'u1' } } }) }));
vi.mock('~/lib/useNow', () => ({ useNow: () => 1_800_000_000_000 }));

import ProjectsPage from '../plan.projects._index';
import ProjectRoute from '../plan.projects.$id';

beforeEach(() => {
  state.projects = { ...state.projects, status: 'ready', projects: [], dataUpdatedAt: 1 };
  state.project = { ...state.project, status: 'ready', data: undefined, dataUpdatedAt: 1 };
  state.actions = { me: 'u1', createProject: vi.fn(), editProject: vi.fn(), addSteps: vi.fn(), editStep: vi.fn() };
});

const renderList = () => render(<MantineProvider env="test"><MemoryRouter><ProjectsPage /></MemoryRouter></MantineProvider>);
const renderOne = () => render(
  <MantineProvider env="test"><MemoryRouter initialEntries={['/plan/projects/p1']}><Routes><Route path="/plan/projects/:id" element={<ProjectRoute {...({ params: { id: 'p1' } } as unknown as React.ComponentProps<typeof ProjectRoute>)} />} /><Route path="/plan/projects" element={<p>list page</p>} /></Routes></MemoryRouter></MantineProvider>,
);

describe('the Projects page', () => {
  it('shows the empty state, a New project button, one h1 and no accessibility violations', async () => {
    const { container } = renderList();
    expect(screen.getByText('No projects yet. Add one when you start a bigger job.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New project' })).toBeInTheDocument();
    expectSoundHeadings(container);
    await expectNoViolations(container);
  });

  it('asks only for a title, and creates the project with an id made when the sheet opened', async () => {
    renderList();
    await userEvent.click(screen.getByRole('button', { name: 'New project' }));
    const sheet = await screen.findByRole('dialog');
    expect(sheet).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Title'), 'Fix the hall socket');
    await userEvent.click(screen.getAllByRole('button', { name: 'New project' }).at(-1)!);
    const create = (state.actions as { createProject: ReturnType<typeof vi.fn> }).createProject;
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({ title: 'Fix the hall socket' });
    expect(create.mock.calls[0][0].id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('says a project never opened online has nothing saved for offline yet', () => {
    state.projects = { ...state.projects, dataUpdatedAt: undefined };
    renderList();
    expect(screen.getByText('Not saved for offline yet')).toBeInTheDocument();
  });

  it('says nothing is lost when the list cannot load', () => {
    state.projects = { ...state.projects, status: 'error' };
    renderList();
    expect(screen.getByText(/Nothing has been lost/)).toBeInTheDocument();
  });
});

describe('a project page', () => {
  it('says a project that was not found was deleted, with a way back, and never from absence alone', () => {
    state.project = { ...state.project, status: 'notfound' };
    renderOne();
    expect(screen.getByText('That was deleted.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All projects' })).toBeInTheDocument();
  });

  it('says "Not saved for offline yet" for a project never opened online, not that it is gone', () => {
    state.project = { ...state.project, status: 'error', data: undefined, dataUpdatedAt: undefined };
    renderOne();
    expect(screen.getByText('Not saved for offline yet')).toBeInTheDocument();
    expect(screen.queryByText('That was deleted.')).not.toBeInTheDocument();
  });
});
