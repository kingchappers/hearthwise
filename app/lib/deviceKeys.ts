// What the app keeps in this browser's localStorage for one person: half-typed recipes, cooking ticks, the add-to-list review and project notices. Each
// key holds one JSON object and ends with the signed-in person's user id, so a second person on the same phone never sees the first
// person's. Every read and write is inside try/catch: blocked or full storage must never break a page.
export const recipeDraftKey = (userId: string): string => `hearthwise.recipeDraft.${userId}`;
export const cookingKey = (userId: string): string => `hearthwise.cooking.${userId}`;
export const reviewKey = (userId: string): string => `hearthwise.review.${userId}`;
export const textDraftsKey = (userId: string): string => `hearthwise.textDrafts.${userId}`;
export const projectSavedKey = (userId: string): string => `hearthwise.projectSaved.${userId}`;
export const littleEnergyKey = (userId: string): string => `hearthwise.littleEnergy.${userId}`;
export const projectNoticesKey = (userId: string): string => `hearthwise.projectNotices.${userId}`;

export function readObject(key: string): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch (error) {
    console.error(`deviceKeys: could not read ${key}`, error);
    return {};
  }
}

export function writeObject(key: string, value: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`deviceKeys: could not save ${key}`, error);
  }
}

// Forgets everything this device kept for the person. Each key is removed on its own, so one that cannot be removed does not stop the rest.
export function clearDeviceKeys(userId: string): void {
  for (const key of [recipeDraftKey(userId), cookingKey(userId), reviewKey(userId), projectNoticesKey(userId), textDraftsKey(userId), projectSavedKey(userId), littleEnergyKey(userId)]) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      console.error(`deviceKeys: could not clear ${key}`, error);
    }
  }
}
