import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { parseJsonObject } from '../api/http';
import type { TaskHandler } from '../api/respond';
import { parseRequiredMutationId } from '../shared/validation';
import type { Store } from '../store';
import { TaskError } from '../tasks/types';
import { toEntry } from './entries';
import { moneyKey } from './keys';
import type { MoneyEntry } from './types';

export type MoneyAction = 'create' | 'edit' | 'respond' | 'change' | 'change_respond' | 'withdraw' | 'delete' | 'restore';

// One line for each fresh write. Ids, enums and pence only: never a description or a name.
export function logMoneyWrite(householdId: string, mutationId: string, action: MoneyAction, entry: Pick<MoneyEntry, 'kind' | 'amountPence' | 'sharePence' | 'status'>): void {
  const { kind, amountPence, sharePence, status } = entry;
  console.log(JSON.stringify({ event: 'money_write', householdId, mutationId, action, kind, amountPence, sharePence, status }));
}

// One line for each refusal. The reason is the error code.
export function logMoneyReject(householdId: string, mutationId: string | undefined, reason: string): void {
  console.log(JSON.stringify({ event: 'money_reject', householdId, ...(mutationId === undefined ? {} : { mutationId }), reason }));
}

function mutationIdOf(event: APIGatewayProxyEventV2): string | undefined {
  const parsed = parseRequiredMutationId(parseJsonObject(event)?.mutationId);
  return parsed.ok ? parsed.value : undefined;
}

// Logs a domain refusal and throws it again for `respondTo` to answer.
export function withMoneyLog(handler: TaskHandler): TaskHandler {
  return async (event, ctx, params) => {
    try {
      return await handler(event, ctx, params);
    } catch (error) {
      if (error instanceof TaskError) logMoneyReject(ctx.householdId, mutationIdOf(event), error.code);
      throw error;
    }
  };
}

// A restore answers with results only, so the entries are read again for their log lines.
export async function logRestoredMoney(store: Store, householdId: string, mutationId: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    const raw = await store.get(moneyKey(householdId, id));
    if (raw) logMoneyWrite(householdId, mutationId, 'restore', toEntry(raw));
  }
}
