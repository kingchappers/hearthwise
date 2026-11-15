import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP = resolve(__dirname, '..');
const BANNED = /\b(overdue|missed|streak|late|failed to complete)\b/i;
// Phase 2 also avoids these. They are tested only against the meal files, because "Forgot your password?" and similar words in the
// sign-in screens are not about a plan or a recipe.
const BANNED_PHASE_2 = /\b(forgot|skipped|incomplete|missing|unplanned)\b/i;
// Phase 3 also avoids these in the money files, so that nothing there reads as blame. They are tested only against those files.
const BANNED_PHASE_3 = /\b(owe|owes|owed|debt|debts|unpaid|behind)\b/i;
const MONEY_LIB = ['money', 'moneyKeys', 'moneyOverlay', 'moneyForm', 'moneyText'];
// The fixed fragments of the design's Wording table, each of which must appear in what a person can read in the money files.
const MONEY_PHRASES = [
  'to settle, from', 'All square', 'Waiting for', 'Not saved yet', 'wants to check this one', 'Change waiting for', 'paid back', 'Needs another look', 'Show settled',
  'Change not made', 'Everything is settled', 'No money entries yet. Add one when you share a cost or lend money.', 'Delete waiting for', 'Payments recorded against this loan will stay in the total.',
  'That entry changed. Please look at it again.', 'to agree to this change.', 'Adding or agreeing needs the two people this ledger is between.', 'This household has reached 2,000 entries.',
];
const MEAL_LIB = ['recipes', 'recipeOverlay', 'plan', 'planOverlay', 'cookingState', 'reviewState', 'recipeDraft', 'wakeLock'];
// The fixed phrases the design promises, each of which must appear in what a person can read in the meal files.
const FIXED_PHRASES = [
  'Nothing planned yet', 'Tonight', 'Pick something easy', 'Make this tonight', 'Add to shopping list', 'I have this', 'Not adding', 'On the list',
  'Not scaled', 'Get everything out', 'Steps', 'Start again', 'Kept as typed', 'Checking the recipe…', 'This recipe was deleted', 'This recipe is gone', 'Last changed by',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' || name === 'test-utils' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

// What a person can read: quoted strings and the text between JSX tags. Comments are left out.
export function readableText(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const strings = [...code.matchAll(/(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g)].map(match => match[2]);
  const jsx = [...code.matchAll(/>([^<>{}\n]+)</g)].map(match => match[1]);
  return [...strings, ...jsx];
}

// The files of the meal plan: the screens, the routes, the client data and the actions.
function mealFiles(): string[] {
  return sourceFiles(APP).filter(file => {
    const path = relative(APP, file).split('\\').join('/');
    return path.startsWith('components/meals/')
      || /^routes\/(recipes[^/]*|plan)\.tsx$/.test(path)
      || MEAL_LIB.some(name => path === `lib/${name}.ts`)
      || /^hooks\/(useRecipeActions|usePlanActions)\.tsx$/.test(path);
  });
}

// The files of the money tracker: the screens, the routes, the client data and the actions.
function moneyFiles(): string[] {
  return sourceFiles(APP).filter(file => {
    const path = relative(APP, file).split('\\').join('/');
    return path.startsWith('components/money/')
      || /^routes\/money[^/]*\.tsx$/.test(path)
      || MONEY_LIB.some(name => path === `lib/${name}.ts`)
      || path === 'hooks/useMoneyActions.tsx';
  });
}

describe('wording', () => {
  it('finds the words it is looking for, as whole words only', () => {
    const found = (text: string): boolean => readableText(text).some(line => BANNED.test(line));
    expect(found(`const a = 'This is overdue';`)).toBe(true);
    expect(found('<p>You missed it</p>')).toBe(true);
    expect(found(`const a = "Keep your streak";`)).toBe(true);
    expect(found(`const a = 'Later';`)).toBe(false);
    expect(found(`const a = 'template';`)).toBe(false);
    expect(found(`// overdue is banned\nconst a = 1;`)).toBe(false);
  });

  it('keeps the shaming words out of everything a person can read', () => {
    const hits = sourceFiles(APP).flatMap(file =>
      readableText(readFileSync(file, 'utf8')).filter(line => BANNED.test(line)).map(line => `${relative(APP, file)}: ${line}`),
    );
    expect(hits).toEqual([]);
  });

  it('finds the files of the meal plan, and not others', () => {
    const files = mealFiles().map(file => relative(APP, file).split('\\').join('/'));
    expect(files).toEqual(expect.arrayContaining([
      'components/meals/CookingView.tsx', 'routes/recipes._index.tsx', 'routes/recipes.$id.tsx', 'routes/plan.tsx', 'lib/plan.ts', 'lib/reviewState.ts', 'hooks/usePlanActions.tsx',
    ]));
    expect(files).not.toContain('components/authentication/LocalAuthForm.tsx');
  });

  it('keeps forgot, skipped, incomplete, missing and unplanned out of the meal plan', () => {
    const found = (text: string): boolean => readableText(text).some(line => BANNED_PHASE_2.test(line));
    expect(found(`const a = 'A missing recipe';`)).toBe(true);
    expect(found('<p>You forgot dinner</p>')).toBe(true);
    expect(found(`const a = 'Unplanned';`)).toBe(true);
    expect(found(`// missing is fine in a comment\nconst a = 1;`)).toBe(false);
    const hits = mealFiles().flatMap(file =>
      readableText(readFileSync(file, 'utf8')).filter(line => BANNED_PHASE_2.test(line)).map(line => `${relative(APP, file)}: ${line}`),
    );
    expect(hits).toEqual([]);
  });

  it('uses every fixed phrase of the meal plan in at least one file', () => {
    const text = mealFiles().flatMap(file => readableText(readFileSync(file, 'utf8')));
    const absent = FIXED_PHRASES.filter(phrase => !text.some(line => line.includes(phrase)));
    expect(absent).toEqual([]);
  });

  it('finds the files of the money tracker, and not others', () => {
    const files = moneyFiles().map(file => relative(APP, file).split('\\').join('/'));
    expect(files).toEqual(expect.arrayContaining([
      'components/money/TotalCard.tsx', 'components/money/WaitingList.tsx', 'components/money/LoanList.tsx', 'components/money/EntryList.tsx', 'components/money/EntryRow.tsx',
      'components/money/AddSheet.tsx', 'components/money/EntryDetail.tsx', 'routes/money._index.tsx', 'routes/money.$id.tsx', 'lib/money.ts', 'lib/moneyOverlay.ts',
      'lib/moneyForm.ts', 'lib/moneyText.ts', 'lib/moneyKeys.ts', 'hooks/useMoneyActions.tsx',
    ]));
    expect(files).not.toContain('components/meals/CookingView.tsx');
  });

  it('keeps owe, debt, unpaid and behind out of the money tracker', () => {
    const found = (text: string): boolean => readableText(text).some(line => BANNED_PHASE_3.test(line));
    expect(found(`const a = 'Alex owes Sam';`)).toBe(true);
    expect(found('<p>Your debt</p>')).toBe(true);
    expect(found(`const a = "unpaid";`)).toBe(true);
    expect(found(`const a = 'You are behind';`)).toBe(true);
    expect(found(`const a = 'Owen';`)).toBe(false);
    expect(found(`// owed is banned in comments too, but this test reads only what is shown\nconst a = 1;`)).toBe(false);
    const hits = moneyFiles().flatMap(file =>
      readableText(readFileSync(file, 'utf8')).filter(line => BANNED_PHASE_3.test(line)).map(line => `${relative(APP, file)}: ${line}`),
    );
    expect(hits).toEqual([]);
  });

  it('keeps forgot, skipped, incomplete, missing and unplanned out of the money tracker', () => {
    const hits = moneyFiles().flatMap(file =>
      readableText(readFileSync(file, 'utf8')).filter(line => BANNED_PHASE_2.test(line)).map(line => `${relative(APP, file)}: ${line}`),
    );
    expect(hits).toEqual([]);
  });

  it('keeps every banned word out of the comments of the money files too', () => {
    const everything = new RegExp(`${BANNED.source}|${BANNED_PHASE_2.source}|${BANNED_PHASE_3.source}`, 'i');
    const hits = moneyFiles().flatMap(file =>
      readFileSync(file, 'utf8').split('\n').filter(line => everything.test(line)).map(line => `${relative(APP, file)}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it('uses every fixed phrase of the money wording table in at least one file', () => {
    const text = moneyFiles().flatMap(file => readableText(readFileSync(file, 'utf8')));
    const absent = MONEY_PHRASES.filter(phrase => !text.some(line => line.includes(phrase)));
    expect(absent).toEqual([]);
  });

  it('uses no red in the money files', () => {
    const hits = moneyFiles().flatMap(file =>
      readFileSync(file, 'utf8').split('\n').filter(line => /\b(red|crimson|#f00|#ff0000|c="red"|color="red")\b|color=["']red/i.test(line)).map(line => `${relative(APP, file)}: ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });
});
