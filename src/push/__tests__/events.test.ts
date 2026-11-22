import { describe, expect, it } from 'vitest';
import { projectAdded, projectChanged } from '../events';
import type { ProjectChange } from '../events';

describe('project push events', () => {
  const SENTINEL = 'Zq-title-9931';

  it('has a fixed body and opens the project', () => {
    expect(projectAdded('Sam', 'm1', 'p1')).toEqual({
      type: 'project.added', mutationId: 'm1', title: 'Sam added a project', body: 'Open Hearthwise, then Plan, then Projects to see it.', url: '/plan/projects/p1',
    });
    expect(projectChanged('Alex', 'm2', 'p1')).toMatchObject({ type: 'project.changed', title: 'Alex changed a project', url: '/plan/projects/p1' });
  });

  it('takes no title, step, material or figure, so none can reach a push', () => {
    // The functions accept only the actor, the mutation id and the project id.
    expect(projectAdded.length).toBe(3);
    expect(JSON.stringify([projectAdded('Sam', 'm1', 'p1'), projectChanged('Sam', 'm1', 'p1')])).not.toContain(SENTINEL);
  });

  it('says the kind of thing that happened in the title, with no title, step or figure in it', () => {
    const titles: Record<ProjectChange, string> = {
      project: 'Sam changed a project', step: 'Sam changed a step', step_added: 'Sam added a step', step_taken: 'Sam took a step', step_freed: 'Sam gave a step back',
      project_taken: 'Sam took a project', project_freed: 'Sam gave a project back', finished: 'Sam marked a project as finished', reopened: 'Sam reopened a project',
      deleted: 'Sam deleted a project', materials: 'Sam changed a materials list',
    };
    for (const [what, title] of Object.entries(titles)) {
      expect(projectChanged('Sam', 'm', 'p1', what as ProjectChange)).toMatchObject({ title, body: 'Open Hearthwise, then Plan, then Projects to see it.', url: '/plan/projects/p1' });
    }
    expect(projectChanged('Sam', 'm', 'p1').title).toBe('Sam changed a project');
  });
});
