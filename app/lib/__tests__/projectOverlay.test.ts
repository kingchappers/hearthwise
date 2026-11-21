import { describe, expect, it } from 'vitest';
import type { Material, Project, Step } from '../../../src/projects/types';
import { projectMutationKeys } from '../projectKeys';
import type { ProjectDetailData } from '../projectOverlay';
import { applyPendingProjectDetail, applyPendingProjectsList } from '../projectOverlay';
import type { ProjectsListData } from '../projects';

const AT = 1_800_000_000_000;
const ME = 'u1';
const THEM = 'u2';

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', title: 'Decking', status: 'active', fieldTimes: { title: AT - 10_000 }, createdBy: THEM, createdAt: 1, updatedAt: 1, updatedBy: THEM, ...over,
});
const step = (id: string, position: string, over: Partial<Step> = {}): Step => ({
  id, projectId: 'p1', text: id, state: 'todo', position, fieldTimes: { text: AT - 10_000, position: AT - 10_000 }, createdBy: THEM, createdAt: 1, updatedAt: 1, updatedBy: THEM, ...over,
});
const detail = (steps: Step[] = [], p: Project = project(), materials: Material[] = []): ProjectDetailData => ({ project: p, steps, materials, serverTime: 0 });
const line = (id: string, text: string): Material => ({ id, projectId: 'p1', text, fieldTimes: { text: AT - 10_000 }, createdBy: THEM, createdAt: 1, updatedAt: 1, updatedBy: THEM });
const list = (projects: Project[] = [project()], deleted: Project[] = []): ProjectsListData => ({ projects, deleted, serverTime: 0 });
const pending = (kind: keyof typeof projectMutationKeys, variables: object) => ({ mutationKey: projectMutationKeys[kind], variables: { mutationId: 'm', at: AT, by: ME, ...variables } });

describe('the list overlay', () => {
  it('shows a pending new project, and a pending edit', () => {
    const created = applyPendingProjectsList(list([]), [pending('putProject', { projectId: 'p9', changes: { title: 'Fence' } })]);
    expect(created.projects.map(p => p.title)).toEqual(['Fence']);
    const edited = applyPendingProjectsList(list(), [pending('putProject', { projectId: 'p1', changes: { status: 'finished' } })]);
    expect(edited.projects[0].status).toBe('finished');
  });

  it('keeps the step counts through an edit', () => {
    const data = list([{ ...project(), counts: { steps: 3, done: 1 } } as Project]);
    expect(applyPendingProjectsList(data, [pending('putProject', { projectId: 'p1', changes: { notes: 'x' } })]).projects[0]).toMatchObject({ counts: { steps: 3, done: 1 } });
  });

  it('moves a deleted project to the deleted rows and a restored one back', () => {
    const deleted = applyPendingProjectsList(list(), [pending('deleteProject', { projectId: 'p1' })]);
    expect(deleted.projects).toEqual([]);
    expect(deleted.deleted.map(p => p.id)).toEqual(['p1']);
    const restored = applyPendingProjectsList(deleted, [pending('restoreProject', { entries: [{ id: 'p1', deletedAt: AT }] })]);
    expect(restored.projects.map(p => p.id)).toEqual(['p1']);
    expect(restored.projects[0].deletedAt).toBeUndefined();
  });

  it('shows a take as mine, never over someone else\'s hold, and a release as free', () => {
    expect(applyPendingProjectsList(list(), [pending('takeProject', { projectId: 'p1' })]).projects[0].takenBy).toBe(ME);
    const held = list([project({ takenBy: THEM, takenAt: 5 })]);
    expect(applyPendingProjectsList(held, [pending('takeProject', { projectId: 'p1' })]).projects[0].takenBy).toBe(THEM);
    expect(applyPendingProjectsList(held, [pending('releaseProject', { projectId: 'p1' })]).projects[0].takenBy).toBeUndefined();
  });

  it('leaves the cached data itself alone', () => {
    const data = list();
    const copy = structuredClone(data);
    applyPendingProjectsList(data, [pending('deleteProject', { projectId: 'p1' })]);
    expect(data).toEqual(copy);
  });
});

describe('the detail overlay', () => {
  it('adds a pending step in its place, and shows a move at once', () => {
    const data = detail([step('a', 'i'), step('c', 'k')]);
    const added = applyPendingProjectDetail(data, [pending('putStep', { projectId: 'p1', stepId: 'b', changes: { text: 'b', position: 'j' } })]);
    expect(added.steps.map(s => s.id)).toEqual(['a', 'b', 'c']);
    const moved = applyPendingProjectDetail(data, [pending('putStep', { projectId: 'p1', stepId: 'c', changes: { position: 'h' } })]);
    expect(moved.steps.map(s => s.id)).toEqual(['c', 'a']);
  });

  it('loses a pending edit to a newer stored one, as the server will', () => {
    const data = detail([step('a', 'i', { text: 'Alex wording', fieldTimes: { text: AT + 5000 } })]);
    const out = applyPendingProjectDetail(data, [pending('putStep', { projectId: 'p1', stepId: 'a', changes: { text: 'Sam wording' } })]);
    expect(out.steps[0].text).toBe('Alex wording');
  });

  it('ticks done and clears a hold, and todo clears done', () => {
    const data = detail([step('a', 'i', { takenBy: THEM, takenAt: 5 })]);
    const done = applyPendingProjectDetail(data, [pending('putStep', { projectId: 'p1', stepId: 'a', changes: { state: 'done' } })]);
    expect(done.steps[0]).toMatchObject({ state: 'done', doneBy: ME });
    expect(done.steps[0].takenBy).toBeUndefined();
  });

  it('takes a free step, not a done one or one someone else holds, and releases', () => {
    const take = (s: Step) => applyPendingProjectDetail(detail([s]), [pending('takeStep', { projectId: 'p1', stepId: 'a' })]).steps[0];
    expect(take(step('a', 'i')).takenBy).toBe(ME);
    expect(take(step('a', 'i', { state: 'done' })).takenBy).toBeUndefined();
    expect(take(step('a', 'i', { takenBy: THEM })).takenBy).toBe(THEM);
    expect(applyPendingProjectDetail(detail([step('a', 'i', { takenBy: THEM })]), [pending('releaseStep', { projectId: 'p1', stepId: 'a' })]).steps[0].takenBy).toBeUndefined();
  });

  it('drops a deleted step, and empties a deleted project', () => {
    const data = detail([step('a', 'i'), step('b', 'j')]);
    expect(applyPendingProjectDetail(data, [pending('deleteStep', { projectId: 'p1', stepId: 'a' })]).steps.map(s => s.id)).toEqual(['b']);
    const gone = applyPendingProjectDetail(data, [pending('deleteProject', { projectId: 'p1' })]);
    expect(gone.steps).toEqual([]);
    expect(gone.project.deletedAt).toBe(AT);
  });

  it('ignores writes about another project', () => {
    const data = detail([step('a', 'i')]);
    expect(applyPendingProjectDetail(data, [pending('putStep', { projectId: 'other', stepId: 'a', changes: { text: 'x' } })])).toEqual(data);
  });

  it('applies pending writes in order', () => {
    const data = detail([step('a', 'i')]);
    const out = applyPendingProjectDetail(data, [
      pending('putStep', { projectId: 'p1', stepId: 'a', changes: { state: 'done' }, at: AT }),
      pending('putStep', { projectId: 'p1', stepId: 'a', changes: { state: 'todo' }, at: AT + 1 }),
    ]);
    expect(out.steps[0].state).toBe('todo');
  });
});

describe('the materials overlay', () => {
  it('shows a pending new line, and an edit that loses to a newer stored one as the server will', () => {
    const added = applyPendingProjectDetail(detail([], project(), []), [pending('putMaterial', { projectId: 'p1', lineId: 'm1', text: 'Timber' })]);
    expect(added.materials.map(m => m.text)).toEqual(['Timber']);
    const newer = { ...line('m1', 'Alex wording'), fieldTimes: { text: AT + 5000 } };
    expect(applyPendingProjectDetail(detail([], project(), [newer]), [pending('putMaterial', { projectId: 'p1', lineId: 'm1', text: 'Sam wording' })]).materials[0].text).toBe('Alex wording');
  });

  it('drops a deleted line at once', () => {
    const data = detail([], project(), [line('m1', 'Timber'), line('m2', 'Screws')]);
    expect(applyPendingProjectDetail(data, [pending('deleteMaterial', { projectId: 'p1', lineId: 'm1' })]).materials.map(m => m.id)).toEqual(['m2']);
  });

  it('adds no shopping lines and changes nothing on screen for the copy', () => {
    const data = detail([], project(), [line('m1', 'Timber')]);
    expect(applyPendingProjectDetail(data, [pending('materialsToList', { projectId: 'p1', lineIds: ['m1'] })])).toEqual(data);
  });
});

describe('the planned day overlay', () => {
  it('shows a pending planned day on the list and on the page, and a clear', () => {
    const change = { planned: { plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' } };
    expect(applyPendingProjectsList(list(), [pending('putProject', { projectId: 'p1', changes: change })]).projects[0]).toMatchObject({ plannedOn: '2026-12-05', plannedEndOn: '2026-12-06' });
    const set = applyPendingProjectDetail(detail(), [pending('putProject', { projectId: 'p1', changes: change })]);
    expect(set.project.plannedOn).toBe('2026-12-05');
    const cleared = applyPendingProjectDetail(set, [pending('putProject', { projectId: 'p1', changes: { planned: { plannedOn: null } }, at: AT + 1 })]);
    expect(cleared.project.plannedOn).toBeUndefined();
  });
});
