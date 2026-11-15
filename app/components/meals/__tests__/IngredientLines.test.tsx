import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { IngredientLines } from '../IngredientLines';

function Harness({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MantineProvider env="test"><IngredientLines value={value} onChange={setValue} /></MantineProvider>;
}

const box = () => screen.getByRole('textbox', { name: /ingredients/i }) as HTMLTextAreaElement;

describe('IngredientLines', () => {
  it('shows how each line was read, beneath the box', async () => {
    render(<Harness />);
    await userEvent.type(box(), '2 onions{Enter}200 g flour{Enter}salt to taste');
    const reading = screen.getByRole('list', { name: 'How each ingredient was read' });
    expect(reading.textContent).toContain('2 · onions');
    expect(reading.textContent).toContain('200 g · flour');
    expect(reading.textContent).toContain('Kept as typed. It won\'t be scaled or added up.');
  });

  it('shows a note after the name', () => {
    render(<Harness initial="1 onion, diced" />);
    expect(screen.getByRole('list', { name: 'How each ingredient was read' }).textContent).toContain('1 · onion, diced');
  });

  it('shows nothing under the box for blank lines', () => {
    render(<Harness initial={'\n  \n'} />);
    expect(screen.queryByRole('list', { name: 'How each ingredient was read' })).not.toBeInTheDocument();
  });

  it('removes bullets and list numbers, and blank lines, from a pasted block', () => {
    render(<Harness />);
    const pasted = ['- 2 onions', '* 1 tin beans', '', '• 3 cloves garlic', '1. 200 g rice', '2) salt', '1.5 kg flour', '4 eggs', '5 tomatoes', '6 carrots'].join('\n');
    fireEvent.paste(box(), { clipboardData: { getData: () => pasted } });
    expect(box().value.split('\n')).toEqual(['2 onions', '1 tin beans', '3 cloves garlic', '200 g rice', 'salt', '1.5 kg flour', '4 eggs', '5 tomatoes', '6 carrots']);
  });

  it('puts a pasted block where the cursor is', () => {
    render(<Harness initial="first" />);
    box().setSelectionRange(5, 5);
    fireEvent.paste(box(), { clipboardData: { getData: () => '- a\n- b' } });
    expect(box().value).toBe('first\na\nb');
  });

  it('leaves a single pasted word alone', () => {
    render(<Harness initial="x" />);
    box().setSelectionRange(1, 1);
    const prevented = !fireEvent.paste(box(), { clipboardData: { getData: () => 'yz' } });
    expect(prevented).toBe(false);
  });
});
