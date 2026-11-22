# Hearthwise brand

The one place brand values are written down. Hex values live in `app/lib/brand.ts` (and mirrored in `app/app.css` for plain CSS); `app/__tests__/brand.test.ts` fails if any figure below stops being true.

## Principles

- **Calm.** Warm, soft colours. Nothing in Hearthwise is shown as overdue or failed, so there is **no red** and no "attention" colour. Overdue items read "Due".
- **Yellow and green are in the palette on purpose** (a household favourite). Yellow carries fills and highlights, green carries "done". A neon or synthwave theme was considered and left out: saturated neon is high-arousal, which works against the calm goal.
- **Text must be readable.** Normal text needs 4.5:1. A bright yellow cannot carry words on a light background, so yellow text uses the dark shade 6.

## Words (one word for one thing)

Chosen from the neurodivergent design review (`docs/reviews/neurodivergent-2026-11/REPORT.md`). New copy uses these words, and a screen does not use one word for two things.

| Idea | Word | Not |
|---|---|---|
| The first screen | Today | Home |
| Both people | Both of you | Together |
| Taking something | "Take this step" / "Take this project"; the holder is said as one sentence, "Alex has this" / "You have this" | I'm on this, On it, Free this step |
| Handing it back | "Give this step back" | Free |
| A finished project, undone | "Reopen this project" | Bring back |
| Put something deleted back | Restore | Bring back |
| A thing that can be put back from Deleted | Delete | Remove |
| A person or link leaves | Remove | Delete |
| Empties a list or a day | Clear | Delete |
| Finishing a to-do, as a button | "Mark done"; the state reads "Done" | Done as a button |
| A repeating part of the day | Routine | Block |
| Asking the other person | Ask; the request reads "You asked Alex to take ..." | Give ... to (said to the person who asked) |
| Waiting | "Waiting for Alex" (a name, not "them") | Waiting for them |

## Palette

| Token | Shade 6 | Use | Contrast (checked) |
|---|---|---|---|
| `hearth` (terracotta) | `#9C3D22` | Primary actions, links | 6.8:1 on white, 6.3:1 on Ash |
| `honey` (soft yellow) | `#7F6200` | Yellow accent *text*; shades 3 and 4 for fills, highlights and the logo flame | 5.8:1 on white, 5.4:1 on Ash |
| `sage` (green) | `#2F6B3B` | "Done" states, calm confirmations | 6.4:1 on white |
| `gray` (warm neutral) | `#5E524A` | Muted text | 7.0:1 on Ash |

Full tuples (index 0 lightest, 9 darkest) are in `app/lib/brand.ts`.

- `honey[3]` `#F6D35C` and `honey[4]` `#EFC13A` are fills. Ink text on them is 11.1:1 and 9.5:1.
- `dark` is warm charcoal. Mantine reads `dark[7]` (`#1E1815`) as the page, `dark[6]` as a card, `dark[0]` as text and `dark[2]` as dimmed text.

### Surfaces and brand constants (`BRAND`)

| Name | Value | Use | Contrast |
|---|---|---|---|
| `ink` | `#2A1E18` | Headings, `theme-color` | 15.1:1 on Ash |
| `ash` | `#FAF6F2` | App background (light) | |
| `surface` | `#1E1815` | App background (dark) | |
| `darkHearthText` | `#E8957A` | Terracotta text in dark mode | 7.5:1 on the surface |
| `darkHoneyText` | `#F6D35C` | Yellow text in dark mode | 12.0:1 on the surface |
| `darkSageText` | `#8FD08A` | Green text in dark mode | 9.7:1 on the surface |

Error text (form validation) uses the terracotta, because the palette has no red: `hearth[7]` in light mode, `darkHearthText` in dark mode.

## The mark

A hearth: an arch with a small flame inside it. Two colours, so it works as a favicon.

| File | Arch | Flame | Use |
|---|---|---|---|
| `docs/brand/logo/hearthwise-mark.svg` | `#9C3D22` | `#C99A12` | Light backgrounds |
| `docs/brand/logo/hearthwise-mark-dark-bg.svg` | `#E8957A` | `#F6D35C` | Dark backgrounds |
| `docs/brand/logo/hearthwise-mark-mono.svg` | `currentColor` | `currentColor` | One-colour printing and inline use |

The lockup is the mark followed by the name "Hearthwise" set in the heading font (Lora), as text, so it follows the text-size setting. Keep at least a quarter of the mark's width clear around it.

App icons, the Apple touch icon, the ICO favicon and the iOS launch images in `public/` are generated from the mark on Ink (icons) or Ash (launch images). Final art is out of scope for phase 1; a designer can replace the SVGs and regenerate the PNGs without any code change.
