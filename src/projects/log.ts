import type { ProjectOutcome } from './types';

export type TakeOutcome = 'taken' | 'already_yours' | 'held_by_other' | 'done' | 'gone' | 'released' | 'not_held';
export type ProjectRecordKind = 'project' | 'step' | 'material';

// One line for each fresh write. Ids, enums and counts only: never a title, step, note, material, figure or name.
export function logProjectWrite(householdId: string, kind: ProjectRecordKind, action: 'put' | 'delete', outcome: ProjectOutcome): void {
  console.log(JSON.stringify({ event: 'project_write', householdId, kind, action, outcome }));
}

export function logProjectTake(householdId: string, kind: 'project' | 'step', outcome: TakeOutcome): void {
  console.log(JSON.stringify({ event: 'project_take', householdId, kind, outcome }));
}

// Counts only: never the text of a material or the project's title.
export function logProjectMaterials(householdId: string, counts: { lines: number; created: number; already: number; cleared: number }): void {
  console.log(JSON.stringify({ event: 'project_materials', householdId, ...counts }));
}
