import { describe, expect, it } from 'vitest';
import { projectAdded, projectChanged } from '../events';

describe('project push events', () => {
  const SENTINEL = 'Zq-title-9931';

  it('has a fixed body and opens the project', () => {
    expect(projectAdded('Sam', 'm1', 'p1')).toEqual({
      type: 'project.added', mutationId: 'm1', title: 'Sam added a project', body: 'Open the project to take a look.', url: '/plan/projects/p1',
    });
    expect(projectChanged('Alex', 'm2', 'p1')).toMatchObject({ type: 'project.changed', title: 'Alex changed a project', url: '/plan/projects/p1' });
  });

  it('takes no title, step, material or figure, so none can reach a push', () => {
    // The functions accept only the actor, the mutation id and the project id.
    expect(projectAdded.length).toBe(3);
    expect(JSON.stringify([projectAdded('Sam', 'm1', 'p1'), projectChanged('Sam', 'm1', 'p1')])).not.toContain(SENTINEL);
  });
});
