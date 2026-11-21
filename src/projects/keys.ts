import { hhPk } from '../household/keys';
import type { Key } from '../store';

// Each prefix ends in `#`, so a query on one never returns another.
export const PROJECT_PREFIX = 'PROJECT#';
export const STEP_PREFIX = 'PSTEP#';
export const MATERIAL_PREFIX = 'PMAT#';

export const projectKey = (householdId: string, id: string): Key => ({ PK: hhPk(householdId), SK: `${PROJECT_PREFIX}${id}` });
export const stepKey = (householdId: string, projectId: string, stepId: string): Key => ({ PK: hhPk(householdId), SK: `${STEP_PREFIX}${projectId}#${stepId}` });
export const materialKey = (householdId: string, projectId: string, lineId: string): Key => ({ PK: hhPk(householdId), SK: `${MATERIAL_PREFIX}${projectId}#${lineId}` });

// A project's steps, or materials, are read with these.
export const stepPrefixFor = (projectId: string): string => `${STEP_PREFIX}${projectId}#`;
export const materialPrefixFor = (projectId: string): string => `${MATERIAL_PREFIX}${projectId}#`;
