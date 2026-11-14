export interface ShoppingItem {
  id: string;
  text: string;
  // Free text, for example "2 kg". Left out when empty.
  quantity?: string;
  ticked: boolean;
  tickedBy?: string;
  // The client time each of text, quantity and ticked was last set (ms), so an older write never overwrites a newer one.
  fieldTimes: { text?: number; quantity?: number; ticked?: number };
  updatedAt: number;
  deletedAt?: number;
  deletedBy?: string;
  // Epoch seconds, when the store may purge a deleted item.
  expiresAt?: number;
}

export interface ItemWrite {
  text?: { value: string; at: number };
  quantity?: { value: string; at: number };
  ticked?: { value: boolean; at: number };
}

export type WriteResult = 'created' | 'applied' | 'noop' | 'gone' | 'skipped';

export type BatchEntry =
  | { id: string; invalid: string }
  | { id: string; delete: true; ifTickedAt?: number }
  | { id: string; write: ItemWrite };
