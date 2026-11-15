import { Button, Group, Stack, Text } from '@mantine/core';
import { formatAmount } from '../../../src/shared/ingredients';
import type { ReviewLine as Line } from '../../../src/shared/shoppingLines';

export interface ReviewLineProps {
  line: Line;
  // Marked "I have this": it will not be added.
  have: boolean;
  // An open shopping line already has this name.
  alreadyOnList: boolean;
  onToggle: () => void;
}

// How the line was made: the amounts it was summed from, then the recipes it is for ("2 + 1 from Chilli, Pasta bake").
function madeFrom(line: Line): string {
  const amounts = line.from.filter(source => source.amount !== undefined).map(source => formatAmount(source.amount!, source.unit));
  return amounts.length > 0 ? `${amounts.join(' + ')} from ${line.forRecipes}` : `from ${line.forRecipes}`;
}

export function ReviewLine({ line, have, alreadyOnList, onToggle }: ReviewLineProps) {
  return (
    <li style={{ listStyle: 'none', paddingBlock: 6 }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <Stack gap={2} miw={0}>
          <Group gap="xs" wrap="wrap">
            <Text fw={600} data-line-text td={have ? 'line-through' : undefined} style={{ overflowWrap: 'anywhere' }}>{line.text}</Text>
            {line.quantity !== undefined && <Text td={have ? 'line-through' : undefined}>{line.quantity}</Text>}
            {line.notScaled && <Text size="sm">Not scaled</Text>}
          </Group>
          <Text size="sm">{madeFrom(line)}</Text>
          {alreadyOnList && <Text size="sm">{`You already have ${line.text} on the list`}</Text>}
          {have && <Text size="sm">Not adding</Text>}
        </Stack>
        <Button variant={have ? 'filled' : 'default'} aria-pressed={have} aria-label={`I have this: ${line.text}`} onClick={onToggle}>I have this</Button>
      </Group>
    </li>
  );
}
