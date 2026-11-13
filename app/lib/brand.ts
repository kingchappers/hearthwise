// The one place brand hex values live (see docs/brand.md). Everything else uses Mantine theme tokens
// (hearth, honey, sage) or the --hw-* variables in app.css.
//
// There is deliberately no red or other "attention" colour: nothing in Hearthwise is shown as overdue or failed.
import type { MantineColorsTuple } from '@mantine/core';

// Primary: "hearth" terracotta. Index 6 (#9C3D22) is 6.8:1 on white, so it is safe for text and buttons.
export const hearth: MantineColorsTuple = [
  '#FBF0EB', '#EBD2CA', '#DBB4A8', '#CC9686', '#BC7965',
  '#AC5B44', '#9C3D22', '#80321B', '#632614', '#461A0E',
];

// Honey: soft yellow. Use shades 3-4 (#F6D35C, #EFC13A) for fills, the logo flame and highlights, always with Ink text on
// top (11.1:1 and 9.5:1). For honey *text* on light backgrounds use 6 (#7F6200, 5.8:1 on white) or darker: a bright yellow
// cannot carry words on white.
export const honey: MantineColorsTuple = [
  '#FFF9E0', '#FDEFB5', '#FBE388', '#F6D35C', '#EFC13A',
  '#C99A12', '#7F6200', '#665000', '#503E00', '#3A2E00',
];

// Sage: green, for "done" states and calm confirmations. Index 6 (#2F6B3B) is 6.4:1 on white.
export const sage: MantineColorsTuple = [
  '#EDF6EB', '#D0E6CB', '#AFD6A8', '#8CC583', '#68AE5F',
  '#4A8F4A', '#2F6B3B', '#26572F', '#1D4325', '#142F1A',
];

// Warm neutrals, so card borders, dividers and bar tracks match the brand. Shade 6 is muted text (7.0:1 on Ash).
export const gray: MantineColorsTuple = [
  '#FAF6F2', '#E0DBD6', '#C6BFBA', '#ACA49E', '#928982',
  '#786D66', '#5E524A', '#4E433C', '#3D342F', '#2C2622',
];

// Warm charcoal rather than neutral grey. Mantine reads dark.7 as the page, dark.6 as a card, dark.0 as text and
// dark.2 as dimmed text, so 7 is the brand surface and 0 the brand text.
export const dark: MantineColorsTuple = [
  '#F1E7DF', '#D9CBC0', '#B3A397', '#8E7E73', '#4E423B',
  '#3A302A', '#2A221E', '#1E1815', '#16110F', '#0E0B0A',
];

export const BRAND = {
  ink: '#2A1E18',
  ash: '#FAF6F2',
  surface: '#1E1815',
  // In dark mode the brand's own text-weight shades: Mantine's default shade 4 would be too dim on a card, so the
  // -text variables are pointed at these.
  darkHearthText: '#E8957A',
  darkHoneyText: '#F6D35C',
  darkSageText: '#8FD08A',
} as const;
