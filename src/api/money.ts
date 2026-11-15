import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import type { HouseholdContext } from '../household/types';
import { logMoneyWrite, withMoneyLog } from '../money/log';
import type { MoneyAction } from '../money/log';
import { askChange, respondChange, withdrawChange } from '../money/changes';
import { deleteMoney, listMoney, putMoney, respondMoney } from '../money/entries';
import type { MoneyEntry } from '../money/types';
import * as events from '../push/events';
import type { NotifyEvent } from '../push/notifyOther';
import { parseChange, parseChangeRespond, parseChangeWithdraw, parseMoneyDelete, parseMoneyPut, parseRespond } from '../shared/moneyValidation';
import type { Parsed } from '../shared/validation';
import { getStore } from '../store';
import { invalid, noStore, ok, parseJsonObject } from './http';
import { notifyAfter } from './notify';
import { guarded, written } from './respond';
import type { TaskHandler } from './respond';
import type { Router } from './router';
import type { ApiResponse } from './types';

type Outcome = { fresh: boolean; result: { entry: MoneyEntry } };

async function getMoney(_event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  return noStore(ok(await listMoney(getStore(), ctx)));
}

// The shape every write route shares: read the body, check it, do the write, log it if it was new, tell the other person if asked.
function writeRoute<T extends { mutationId: string }>(
  parse: (body: Record<string, unknown>) => Parsed<T>,
  run: (ctx: HouseholdContext, id: string, input: T) => Promise<Outcome>,
  action: (input: T) => MoneyAction,
  notice: (actor: string, mutationId: string, input: T) => NotifyEvent | undefined,
): TaskHandler {
  return async (event, ctx, params) => {
    const body = parseJsonObject(event);
    if (!body) return invalid('body');
    const input = parse(body);
    if (!input.ok) return invalid(input.field);
    const outcome = await run(ctx, params.id, input.value);
    if (outcome.fresh) logMoneyWrite(ctx.householdId, input.value.mutationId, action(input.value), outcome.result.entry);
    await notifyAfter(ctx, body, outcome.fresh, notice(ctx.member.displayName, input.value.mutationId, input.value));
    return written(outcome, 200);
  };
}

const put = writeRoute(
  parseMoneyPut,
  (ctx, id, input) => putMoney(getStore(), ctx, id, input),
  input => (input.kind === undefined ? 'edit' : 'create'),
  // Only a new entry is news: an edit of a waiting entry, or of the description or date, sends nothing.
  (actor, mutationId, input) => (input.kind === undefined ? undefined : events.moneyAdded(actor, mutationId)),
);
const respond = writeRoute(parseRespond, (ctx, id, input) => respondMoney(getStore(), ctx, id, input), () => 'respond', (actor, mutationId) => events.moneyReplied(actor, mutationId));
const change = writeRoute(parseChange, (ctx, id, input) => askChange(getStore(), ctx, id, input), () => 'change', (actor, mutationId) => events.moneyAsked(actor, mutationId));
const changeRespond = writeRoute(
  parseChangeRespond, (ctx, id, input) => respondChange(getStore(), ctx, id, input), () => 'change_respond', (actor, mutationId) => events.moneyReplied(actor, mutationId),
);
const withdraw = writeRoute(parseChangeWithdraw, (ctx, id, input) => withdrawChange(getStore(), ctx, id, input), () => 'withdraw', (actor, mutationId) => events.moneyAsked(actor, mutationId));
const remove = writeRoute(parseMoneyDelete, (ctx, id, input) => deleteMoney(getStore(), ctx, id, input), () => 'delete', () => undefined);

const route = (handler: TaskHandler) => withHousehold(guarded(['id'], withMoneyLog(handler)));

export function registerMoneyRoutes(router: Router): void {
  router.get('/api/hh/money', withHousehold(getMoney));
  router.put('/api/hh/money/{id}', route(put));
  router.post('/api/hh/money/{id}/respond', route(respond));
  router.post('/api/hh/money/{id}/change', route(change));
  router.post('/api/hh/money/{id}/change/respond', route(changeRespond));
  router.post('/api/hh/money/{id}/change/withdraw', route(withdraw));
  router.delete('/api/hh/money/{id}', route(remove));
}
