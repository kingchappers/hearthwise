export type MoneyKind = 'expense' | 'loan' | 'payment';
export type MoneyStatus = 'waiting' | 'agreed' | 'declined';

export const MONEY_KINDS: MoneyKind[] = ['expense', 'loan', 'payment'];

// The fields that change together, under one version number.
export interface MoneyUnit {
  kind: MoneyKind;
  paidBy: string;
  amountPence: number;
  sharePence: number;
  // Only on a payment, and optional.
  loanId?: string;
}

// What a change request carries: the unit without its kind, which never changes.
export type MoneyChange = Omit<MoneyUnit, 'kind'>;

export interface PendingChange {
  // The mutationId of the request that made it.
  id: string;
  by: string;
  at: number;
  money?: MoneyChange;
  delete?: true;
}

export interface MoneyFieldTimes {
  description?: number;
  on?: number;
}

export interface MoneyEntry extends MoneyUnit {
  id: string;
  description: string;
  // YYYY-MM-DD: the date the money moved.
  on: string;
  fieldTimes: MoneyFieldTimes;
  status: MoneyStatus;
  version: number;
  createdBy: string;
  createdAt: number;
  // Who put the entry into waiting: its creator, or whoever restored it.
  proposedBy: string;
  agreedAt?: number;
  // Left out when the entry needed no agreement.
  agreedBy?: string;
  pendingChange?: PendingChange;
  updatedAt: number;
  updatedBy: string;
  deletedAt?: number;
  deletedBy?: string;
}

export interface MoneyData {
  entries: MoneyEntry[];
  serverTime: number;
}

// The body of a create (kind set) or an edit (kind left out) of PUT /api/hh/money/{id}.
export interface MoneyPutInput {
  kind?: MoneyKind;
  money?: MoneyChange;
  baseVersion?: number;
  description?: { value: string; at: number };
  on?: { value: string; at: number };
  mutationId: string;
  clientAt?: number;
}

export interface RespondInput {
  response: 'agree' | 'decline';
  version: number;
  mutationId: string;
}

export interface ChangeInput {
  version: number;
  money?: MoneyChange;
  delete?: true;
  mutationId: string;
}

export interface ChangeRespondInput {
  response: 'agree' | 'decline';
  requestId: string;
  mutationId: string;
}

export interface ChangeWithdrawInput {
  requestId: string;
  mutationId: string;
}
