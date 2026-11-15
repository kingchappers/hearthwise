// The query key and mutation keys for money. Kept apart from `money.ts` so the mutation registry can name them without importing hooks.
export const MONEY_KEY = ['money'] as const;

export type MoneyMutationKind =
  | 'moneyAdd' | 'moneyEdit' | 'moneyRespond' | 'moneyChange' | 'moneyChangeRespond' | 'moneyChangeWithdraw' | 'moneyDelete' | 'moneyRestore';

// A key is never renamed once shipped: a saved write is replayed by its key.
export const moneyMutationKeys: { [K in MoneyMutationKind]: readonly ['household', K] } = {
  moneyAdd: ['household', 'moneyAdd'], moneyEdit: ['household', 'moneyEdit'], moneyRespond: ['household', 'moneyRespond'],
  moneyChange: ['household', 'moneyChange'], moneyChangeRespond: ['household', 'moneyChangeRespond'],
  moneyChangeWithdraw: ['household', 'moneyChangeWithdraw'], moneyDelete: ['household', 'moneyDelete'], moneyRestore: ['household', 'moneyRestore'],
};
