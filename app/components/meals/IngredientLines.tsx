import { Stack, Text, Textarea } from '@mantine/core';
import { formatAmount, parseIngredientLine } from '../../../src/shared/ingredients';
import { cleanLines } from '~/lib/recipeFields';
import { pasteLines } from './pasteLines';

export interface IngredientLinesProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

function reading(line: string): string {
  const parsed = parseIngredientLine(line);
  if (parsed.amount === undefined) return "Kept as typed. It won't be scaled or added up.";
  return `${formatAmount(parsed.amount, parsed.unit)} · ${parsed.name}${parsed.note ? `, ${parsed.note}` : ''}`;
}

// One ingredient per line. Beneath the box, how each line was read, so a person can correct a line by editing its text.
export function IngredientLines({ value, onChange, error }: IngredientLinesProps) {
  const lines = cleanLines(value);
  return (
    <Stack gap="xs">
      <Textarea
        label="Ingredients"
        description="One ingredient per line, like 2 onions or 200 g flour. You can paste a list."
        value={value}
        onChange={event => onChange(event.currentTarget.value)}
        onPaste={pasteLines(value, onChange)}
        autosize
        minRows={4}
        error={error}
      />
      {lines.length > 0 && (
        <ul aria-label="How each ingredient was read" style={{ margin: 0, padding: 0 }}>
          {lines.map((line, index) => (
            <li key={`${index}-${line}`} style={{ listStyle: 'none', paddingBlock: 2 }}>
              <Text span fw={600} style={{ overflowWrap: 'anywhere' }}>{line}</Text>
              <Text size="sm">{reading(line)}</Text>
            </li>
          ))}
        </ul>
      )}
    </Stack>
  );
}
