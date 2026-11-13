import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME, mergeMantineTheme } from '@mantine/core';
import { contrastRatio } from '~/lib/contrast';
import { BRAND } from '~/lib/brand';
import { cssVariablesResolver, theme } from '../root';

const mergedTheme = mergeMantineTheme(DEFAULT_THEME, theme);
const resolved = cssVariablesResolver(mergedTheme);

// Light mode: text sits on the Ash page or on a white card. Dark mode: on the brand surface
// (dark.7, Mantine's body in dark mode) or on a card (dark.6).
const LIGHT_PAGE = BRAND.ash;
const LIGHT_CARD = '#ffffff';
const DARK_PAGE = mergedTheme.colors.dark[7];
const DARK_CARD = mergedTheme.colors.dark[6];

describe('brand surfaces', () => {
  it('uses the brand surface as the dark page', () => {
    expect(DARK_PAGE.toLowerCase()).toBe(BRAND.surface.toLowerCase());
  });

  it('uses Ash as the light page and Ink as the light text', () => {
    expect(resolved.light?.['--mantine-color-body']).toBe(BRAND.ash);
    expect(mergedTheme.black).toBe(BRAND.ink);
  });
});

describe('dimmed text contrast', () => {
  it('reaches 4.5:1 on the dark page and on a dark card (WCAG AA for normal text)', () => {
    const dimmed = resolved.dark?.['--mantine-color-dimmed'] as string;

    expect(dimmed).toBeTruthy();
    expect(contrastRatio(dimmed, DARK_PAGE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dimmed, DARK_CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it('reaches 4.5:1 on the light page and on a white card', () => {
    const dimmed = resolved.light?.['--mantine-color-dimmed'] as string;

    expect(contrastRatio(dimmed, LIGHT_PAGE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(dimmed, LIGHT_CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it('reaches 4.5:1 for body text in dark mode', () => {
    expect(contrastRatio(mergedTheme.colors.dark[0], DARK_PAGE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mergedTheme.colors.dark[0], DARK_CARD)).toBeGreaterThanOrEqual(4.5);
  });
});

// Colour carries a small set of meanings, and each must be readable as text in both modes. Mantine uses shade 6 for text
// in light mode; in dark mode the -text variable is overridden to the brand's lighter shades.
//   hearth - the brand, links and primary actions
//   honey  - something worth a look, in a soft yellow (nothing in Hearthwise is shown as overdue or failed)
//   sage   - "done" states and calm confirmations
describe('meaning colours', () => {
  const darkText: Record<string, string> = {
    hearth: resolved.dark?.['--mantine-color-hearth-text'] as string,
    honey: resolved.dark?.['--mantine-color-honey-text'] as string,
    sage: resolved.dark?.['--mantine-color-sage-text'] as string,
  };

  it.each(['hearth', 'honey', 'sage'])('%s text reads at 4.5:1 on the light page and a white card', name => {
    expect(contrastRatio(mergedTheme.colors[name][6], LIGHT_PAGE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(mergedTheme.colors[name][6], LIGHT_CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['hearth', 'honey', 'sage'])('%s text reads at 4.5:1 on the dark page and a dark card', name => {
    expect(darkText[name]).toBeTruthy();
    expect(contrastRatio(darkText[name], DARK_PAGE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkText[name], DARK_CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps white text on a filled hearth button at 4.5:1', () => {
    const shade = mergedTheme.primaryShade as { light: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9; dark: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 };
    expect(mergedTheme.primaryColor).toBe('hearth');
    expect(contrastRatio('#ffffff', mergedTheme.colors.hearth[shade.light])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#ffffff', mergedTheme.colors.hearth[shade.dark])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps honey visibly different from hearth', () => {
    expect(mergedTheme.colors.honey[6]).not.toBe(mergedTheme.colors.hearth[6]);
  });
});

describe('motion', () => {
  it('follows the device reduced-motion setting', () => {
    expect(mergedTheme.respectReducedMotion).toBe(true);
  });
});

describe('error text contrast', () => {
  it('reaches 4.5:1 on the light page and a white card', () => {
    const error = resolved.light?.['--mantine-color-error'] as string;
    expect(contrastRatio(error, LIGHT_PAGE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(error, LIGHT_CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it('reaches 4.5:1 on the dark page and on a dark card', () => {
    const error = resolved.dark?.['--mantine-color-error'] as string;
    expect(contrastRatio(error, DARK_PAGE)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(error, DARK_CARD)).toBeGreaterThanOrEqual(4.5);
  });

  it('is drawn from the brand palette, since the palette has no red', () => {
    expect(resolved.light?.['--mantine-color-error']).toBe(mergedTheme.colors.hearth[7]);
    expect(resolved.dark?.['--mantine-color-error']).toBe(BRAND.darkHearthText);
  });
});
