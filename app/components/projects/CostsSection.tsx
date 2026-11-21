import { useState } from 'react';
import { Button, Stack, Text, TextInput, Title } from '@mantine/core';
import type { Project } from '../../../src/projects/types';
import type { ProjectActions } from '~/hooks/useProjectActions';
import type { ProjectChanges } from '~/lib/mutations';
import { costChange, costFieldText } from '~/lib/projectForm';
import { COPY, costLine, lastChangedBy, nameOf } from '~/lib/projectText';
import type { MemberSummary } from '~/lib/household';

export interface CostsSectionProps {
  project: Project;
  members: MemberSummary[];
  actions: Pick<ProjectActions, 'editProject'>;
}

// Optional, and apart from the ledger: two figures that either person can change. They are shown as figures and never as a verdict.
export function CostsSection({ project, members, actions }: CostsSectionProps) {
  const [open, setOpen] = useState(false);
  const [estimate, setEstimate] = useState(costFieldText(project.estimatePence));
  const [spent, setSpent] = useState(costFieldText(project.spentPence));
  const [errors, setErrors] = useState<{ estimate?: string; spent?: string }>({});
  const line = costLine(project);
  if (line === undefined && !open) return <Button variant="default" style={{ minHeight: 44 }} onClick={() => setOpen(true)}>{COPY.addCost}</Button>;
  const by = project.costBy === undefined ? undefined : nameOf(members, project.costBy);

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    const e = costChange(estimate, project.estimatePence);
    const s = costChange(spent, project.spentPence);
    setErrors({ ...(e.ok ? {} : { estimate: e.message }), ...(s.ok ? {} : { spent: s.message }) });
    if (!e.ok || !s.ok) return;
    // Only a figure that changed is sent, so an untouched one cannot replace the other person's edit of it.
    const changes: ProjectChanges = {};
    if ('value' in e) changes.estimatePence = e.value;
    if ('value' in s) changes.spentPence = s.value;
    actions.editProject(project.id, changes);
    setOpen(false);
  };

  return (
    <Stack component="section" aria-labelledby="costs-heading" gap="xs">
      <Title order={2} size="h4" id="costs-heading">{COPY.costs}</Title>
      {line && <Text fw={600}>{line}</Text>}
      {by && <Text size="sm">{lastChangedBy(by)}</Text>}
      <Text size="sm">{COPY.notInMoney}</Text>
      {open ? (
        <form onSubmit={save}>
          <Stack gap="xs">
            <TextInput label={COPY.estimate} description="In pounds, like 4000 or 12.50" inputMode="decimal" value={estimate} onChange={event => setEstimate(event.currentTarget.value)} error={errors.estimate} />
            <TextInput label={COPY.spentSoFar} description="In pounds. Leave empty to clear." inputMode="decimal" value={spent} onChange={event => setSpent(event.currentTarget.value)} error={errors.spent} />
            <Button type="submit" style={{ minHeight: 44 }}>{COPY.saveCosts}</Button>
          </Stack>
        </form>
      ) : (
        <Button variant="default" style={{ minHeight: 44 }} onClick={() => { setEstimate(costFieldText(project.estimatePence)); setSpent(costFieldText(project.spentPence)); setOpen(true); }}>Change costs</Button>
      )}
    </Stack>
  );
}
