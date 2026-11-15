// One reader of ingredient lines, shared by the editor, the cooking view, the review and the server's limits.

export const UNITS = ['g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'cup', 'tin', 'pack', 'clove', 'bunch', 'pinch', 'slice'] as const;
export type Unit = (typeof UNITS)[number];

const SPELLINGS: Record<Unit, string[]> = {
  g: ['g', 'gram', 'grams'],
  kg: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'],
  ml: ['ml', 'millilitre', 'millilitres', 'milliliter', 'milliliters'],
  l: ['l', 'litre', 'litres', 'liter', 'liters'],
  tsp: ['tsp', 'tsps', 'teaspoon', 'teaspoons'],
  tbsp: ['tbsp', 'tbsps', 'tablespoon', 'tablespoons'],
  cup: ['cup', 'cups'],
  tin: ['tin', 'tins', 'can', 'cans'],
  pack: ['pack', 'packs', 'packet', 'packets'],
  clove: ['clove', 'cloves'],
  bunch: ['bunch', 'bunches'],
  pinch: ['pinch', 'pinches'],
  slice: ['slice', 'slices'],
};

const UNIT_BY_SPELLING = new Map<string, Unit>(
  (Object.entries(SPELLINGS) as [Unit, string[]][]).flatMap(([unit, spellings]) => spellings.map((spelling): [string, Unit] => [spelling, unit])),
);

export interface ParsedIngredient {
  name: string;
  note?: string;
  amount?: number;
  unit?: Unit;
}

const GLYPHS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
const GLYPH_CLASS = '[½¼¾⅓⅔]';

interface Read {
  amount: number;
  rest: string;
}

// The number at the start of `text`, and what follows it. Undefined when the text does not start with a usable number.
function readNumber(text: string): Read | undefined {
  const patterns: [RegExp, (match: RegExpMatchArray) => number][] = [
    [new RegExp(`^(\\d+)\\s*(${GLYPH_CLASS})`), match => Number(match[1]) + GLYPHS[match[2]]],
    [new RegExp(`^(${GLYPH_CLASS})`), match => GLYPHS[match[1]]],
    [/^(\d+)\s+(\d+)\/(\d+)(?!\d)/, match => Number(match[1]) + Number(match[2]) / Number(match[3])],
    [/^(\d+)\/(\d+)(?!\d)/, match => Number(match[1]) / Number(match[2])],
    [/^\d{1,3}(?:,\d{3})+(?:\.\d+)?(?![\d,])/, match => Number(match[0].replaceAll(',', ''))],
    [/^\d+,\d{1,2}(?![\d,])/, match => Number(match[0].replace(',', '.'))],
    [/^\d+(?:\.\d+)?/, match => Number(match[0])],
  ];
  for (const [pattern, value] of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = value(match);
    const rest = text.slice(match[0].length);
    // A range ("2-3") or a figure glued to digits is not an amount.
    if (!Number.isFinite(amount) || amount <= 0 || /^\s*[-–]\s*\d/.test(rest) || /^[\d/.,]/.test(rest)) return undefined;
    return { amount, rest };
  }
  return undefined;
}

// A unit at the start of `text` (after any space), with an optional "of" after it.
function readUnit(text: string): { unit: Unit; rest: string } | undefined {
  const match = text.match(/^\s*([A-Za-z]+)\.?(?=[\s,]|$)/);
  if (!match) return undefined;
  const unit = UNIT_BY_SPELLING.get(match[1].toLowerCase());
  if (!unit) return undefined;
  const rest = text.slice(match[0].length).replace(/^\s+of\s+/i, ' ');
  return { unit, rest };
}

function splitNote(rest: string): { name: string; note?: string } {
  const text = rest.trim();
  const comma = text.indexOf(',');
  if (comma < 0) return { name: text };
  const name = text.slice(0, comma).trim();
  const note = text.slice(comma + 1).trim();
  return note === '' ? { name } : { name, note };
}

export function parseIngredientLine(text: string): ParsedIngredient {
  const line = text.trim();
  const whole: ParsedIngredient = { name: line };

  let read = readNumber(line);
  let unit: Unit | undefined;
  let rest = '';
  if (read) {
    const withUnit = readUnit(read.rest);
    unit = withUnit?.unit;
    rest = withUnit ? withUnit.rest : read.rest;
  } else {
    // "a" and "an" count as 1, but only when a unit follows.
    const article = line.match(/^(?:a|an)\s+(.*)$/i);
    const withUnit = article ? readUnit(article[1]) : undefined;
    if (!withUnit) return whole;
    read = { amount: 1, rest: '' };
    unit = withUnit.unit;
    rest = withUnit.rest;
  }

  const { name, note } = splitNote(rest);
  if (name === '') return whole;
  const parsed: ParsedIngredient = { name, amount: read.amount };
  if (unit) parsed.unit = unit;
  if (note) parsed.note = note;
  return parsed;
}

const UNCHANGED = new Set(['asparagus', 'hummus', 'houmous', 'cress', 'watercress', 'couscous', 'molasses', 'lemongrass', 'citrus', 'swiss', 'series']);
const IRREGULAR: Record<string, string> = {
  leaves: 'leaf', loaves: 'loaf', halves: 'half', knives: 'knife', wolves: 'wolf',
  cookies: 'cookie', brownies: 'brownie', smoothies: 'smoothie', veggies: 'veggie', pies: 'pie',
  chillies: 'chilli', chilies: 'chili',
};

function singular(word: string): string {
  if (UNCHANGED.has(word)) return word;
  if (IRREGULAR[word]) return IRREGULAR[word];
  if (word.length <= 3 || /(ss|us|is)$/.test(word)) return word;
  if (/ies$/.test(word)) return `${word.slice(0, -3)}y`;
  if (/(oes|ches|shes|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

// Decides only whether two ingredient names merge: lower case, no punctuation but hyphens, and the last word made singular.
export function normaliseName(name: string): string {
  const words = name.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').split(/\s+/).filter(word => word !== '');
  if (words.length === 0) return '';
  words[words.length - 1] = singular(words[words.length - 1]);
  return words.join(' ');
}

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

function formatNumber(amount: number, unit: Unit | undefined): string {
  if (unit === 'kg' || unit === 'l') return String(Number(amount.toFixed(2)));
  const whole = Math.floor(amount + 1e-9);
  const fraction = Math.round((amount - whole) * 4) / 4;
  if (Math.abs(amount - whole - fraction) < 1e-9 && fraction === 0) return String(whole);
  const glyph = Math.abs(amount - whole - fraction) < 1e-9 ? FRACTIONS[fraction] : undefined;
  if (glyph) return whole === 0 ? glyph : `${whole}${glyph}`;
  return String(Number(amount.toFixed(2)));
}

// The text stored as a shopping line's quantity: "1½", "400 g", "3".
export function formatAmount(amount: number, unit?: Unit): string {
  const number = formatNumber(amount, unit);
  return unit ? `${number} ${unit}` : number;
}
