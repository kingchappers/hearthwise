// How much of a person a task or step takes: small, medium or big. A rough, personal guess, never a score; nothing counts or ranks by it
// except "Little energy today", which prefers the small things.
export const ENERGY_SIZES = ['small', 'medium', 'big'] as const;
export type Energy = (typeof ENERGY_SIZES)[number];

export const isEnergy = (value: unknown): value is Energy => typeof value === 'string' && (ENERGY_SIZES as readonly string[]).includes(value);

export const ENERGY_LABELS: Record<Energy, string> = { small: 'Small', medium: 'Medium', big: 'Big' };
