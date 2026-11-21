import { describe, expect, it } from 'vitest';
import { MATERIAL_PREFIX, materialKey, materialPrefixFor, PROJECT_PREFIX, projectKey, STEP_PREFIX, stepKey, stepPrefixFor } from '../keys';

// The other sort-key prefixes in a household's partition.
const OTHERS = ['TASK#', 'ITEM#', 'RECIPE#', 'PLAN#', 'MONEY#', 'EVENT#', 'CALFEED#', 'CALSECRET#', 'CALSNAP#', 'DONE#', 'EDIT#', 'INVITE#', 'MEMBER#', 'MUT#', 'PROPOSAL#', 'REMIND#', 'HELD#'];
const OURS = [PROJECT_PREFIX, STEP_PREFIX, MATERIAL_PREFIX];

describe('project key prefixes', () => {
  it.each(OURS)('%s ends in #', prefix => {
    expect(prefix.endsWith('#')).toBe(true);
  });

  it('is not a string prefix of, or prefixed by, any other prefix in the partition', () => {
    const all = [...OURS, ...OTHERS];
    for (const a of OURS) {
      for (const b of all) {
        if (a === b) continue;
        expect(a.startsWith(b) || b.startsWith(a)).toBe(false);
      }
    }
  });

  it('builds keys under the household with the project id inside the child keys', () => {
    expect(projectKey('h1', 'p1')).toEqual({ PK: 'HH#h1', SK: 'PROJECT#p1' });
    expect(stepKey('h1', 'p1', 's1')).toEqual({ PK: 'HH#h1', SK: 'PSTEP#p1#s1' });
    expect(materialKey('h1', 'p1', 'm1')).toEqual({ PK: 'HH#h1', SK: 'PMAT#p1#m1' });
  });

  it('reads a project\'s children with a prefix that another project cannot match', () => {
    expect(stepPrefixFor('p1')).toBe('PSTEP#p1#');
    expect(materialPrefixFor('p1')).toBe('PMAT#p1#');
    expect(stepKey('h1', 'p10', 's1').SK.startsWith(stepPrefixFor('p1'))).toBe(false);
  });
});
