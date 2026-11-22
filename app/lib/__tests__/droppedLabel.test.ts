import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { labelOf, notSavedLine } from '../droppedLabel';
import { ITEMS_KEY } from '../items';

describe('naming a refused change', () => {
  const client = new QueryClient();

  it('uses the words the write carries', () => {
    expect(labelOf('edit', { title: 'Bins' }, client)).toBe('Bins');
    expect(labelOf('recipeAdd', { recipe: { title: 'Pasta' } }, client)).toBe('Pasta');
    expect(labelOf('moneyAdd', { entry: { description: 'Weekly shop' } }, client)).toBe('Weekly shop');
  });

  it('finds the words on the phone for an id', () => {
    client.setQueryData(ITEMS_KEY, { items: [{ id: 'i1', text: 'Milk' }], serverTime: 1 });
    expect(labelOf('itemTick', { itemId: 'i1' }, client)).toBe('Milk');
    expect(labelOf('complete', { taskId: 't1' }, client, () => ({ tasks: [{ id: 't1', title: 'Bins' }] }) as never)).toBe('Bins');
  });

  it('says what kind of thing it was when the words are not known', () => {
    expect(labelOf('moneyDelete', { entryId: 'x' }, client)).toBeUndefined();
    expect(notSavedLine('moneyDelete', undefined)).toBe('A change to a money entry was not saved.');
    expect(notSavedLine('itemTick', 'Milk')).toBe('"Milk" was not saved.');
  });

  it('shortens long words', () => {
    expect(notSavedLine('edit', 'x'.repeat(80))).toBe(`"${'x'.repeat(57)}..." was not saved.`);
  });
});
