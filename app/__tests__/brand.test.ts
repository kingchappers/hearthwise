import { describe, expect, it } from 'vitest';
import * as palette from '~/lib/brand';
import { BRAND, dark, gray, hearth, honey, sage } from '~/lib/brand';
import { contrastRatio } from '~/lib/contrast';

const WHITE = '#FFFFFF';

describe('palette', () => {
  it('exports exactly the five tuples, each with ten shades, and no red or other attention colour', () => {
    const tuples = Object.entries(palette).filter(([name]) => name !== 'BRAND');
    expect(tuples.map(([name]) => name).sort()).toEqual(['dark', 'gray', 'hearth', 'honey', 'sage']);
    for (const [, tuple] of tuples) expect(tuple).toHaveLength(10);
  });

  it('uses the shades the design fixes for text and buttons (index 6)', () => {
    expect(hearth[6]).toBe('#9C3D22');
    expect(honey[6]).toBe('#7F6200');
    expect(sage[6]).toBe('#2F6B3B');
    expect(gray[6]).toBe('#5E524A');
    expect(dark[7]).toBe('#1E1815');
    expect(BRAND).toMatchObject({ ink: '#2A1E18', ash: '#FAF6F2', surface: '#1E1815' });
  });
});

describe('light mode text contrast', () => {
  it.each([
    ['hearth.6 on white', hearth[6], WHITE, 6.8],
    ['hearth.6 on Ash', hearth[6], BRAND.ash, 6.3],
    ['honey.6 on white', honey[6], WHITE, 5.8],
    ['honey.6 on Ash', honey[6], BRAND.ash, 5.4],
    ['sage.6 on white', sage[6], WHITE, 6.4],
    ['gray.6 on Ash', gray[6], BRAND.ash, 7.0],
    ['ink on Ash', BRAND.ink, BRAND.ash, 15.1],
  ])('%s is the figure the design records, and at least 4.5:1', (_name, text, background, recorded) => {
    const ratio = contrastRatio(text, background);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(Math.round(ratio * 10) / 10).toBe(recorded);
  });
});

describe('dark mode text contrast', () => {
  it.each([
    ['darkHearthText', BRAND.darkHearthText, 7.5],
    ['darkHoneyText', BRAND.darkHoneyText, 12.0],
    ['darkSageText', BRAND.darkSageText, 9.7],
  ])('%s on the surface is the recorded figure, and holds 4.5:1 on a card too', (_name, text, recorded) => {
    expect(Math.round(contrastRatio(text, BRAND.surface) * 10) / 10).toBe(recorded);
    expect(contrastRatio(text, dark[6])).toBeGreaterThanOrEqual(4.5);
  });
});

describe('yellow, used as a fill', () => {
  it.each([['honey.3', honey[3]], ['honey.4', honey[4]]])('%s keeps Ink text on it above 4.5:1', (_name, fill) => {
    expect(contrastRatio(BRAND.ink, fill)).toBeGreaterThanOrEqual(4.5);
  });

  it('is a real yellow, not the old amber: hue between 40 and 60 degrees at shade 4', () => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(honey[4].slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const delta = max - Math.min(r, g, b);
    const hue = max === r ? (60 * ((g - b) / delta) + 360) % 360 : max === g ? 60 * ((b - r) / delta) + 120 : 60 * ((r - g) / delta) + 240;
    expect(hue).toBeGreaterThanOrEqual(40);
    expect(hue).toBeLessThanOrEqual(60);
  });
});

describe('green', () => {
  it('is a green: its shade 6 has more green than red or blue', () => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(sage[6].slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });
});
