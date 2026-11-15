import { Textarea } from '@mantine/core';
import { pasteLines } from './pasteLines';

export interface StepsEditorProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

// One step per line. A pasted list loses its bullets and numbers.
export function StepsEditor({ value, onChange, error }: StepsEditorProps) {
  return (
    <Textarea
      label="Steps"
      description="One step per line. You can paste a list."
      value={value}
      onChange={event => onChange(event.currentTarget.value)}
      onPaste={pasteLines(value, onChange)}
      autosize
      minRows={4}
      error={error}
    />
  );
}
