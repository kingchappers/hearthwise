import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import type { HouseholdContext } from '../household/types';
import { parseCompleteBody, parseCreateTask, parseDeleteBody, parseMutationBody, parsePatchTask, parseProposalBody, parseRestoreBody } from '../shared/taskValidation';
import { getStore } from '../store';
import { completeCycle, undoCompletion } from '../tasks/completions';
import { taskHistory } from '../tasks/history';
import { acceptProposal, createProposal, declineProposal, listProposals, withdrawProposal } from '../tasks/proposals';
import { restoreEntries } from '../tasks/restore';
import { createTask, deleteTask, listTasks, patchTask } from '../tasks/tasks';
import { err, invalid, noStore, ok, parseJsonObject } from './http';
import type { Router } from './router';
import type { ApiResponse } from './types';
import { guarded, written } from './respond';
import type { TaskHandler } from './respond';

async function getTasks(_event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  const store = getStore();
  const [{ tasks, serverTime }, proposals] = await Promise.all([listTasks(store, ctx), listProposals(store, ctx)]);
  return noStore(ok({ tasks, proposals, serverTime }));
}

const postTask: TaskHandler = async (event, ctx) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseCreateTask(body);
  if (!input.ok) return invalid(input.field);
  return written(await createTask(getStore(), ctx, input.value), 201);
};

const patchTaskRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parsePatchTask(body);
  if (!input.ok) return invalid(input.field);
  return written(await patchTask(getStore(), ctx, params.id, input.value), 200);
};

const deleteTaskRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseDeleteBody(body);
  if (!input.ok) return invalid(input.field);
  return written(await deleteTask(getStore(), ctx, params.id, input.value), 200);
};

const completeRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseCompleteBody(body);
  if (!input.ok) return invalid(input.field);
  return written(await completeCycle(getStore(), ctx, params.id, input.value), 200);
};

// The cycle in the path is a positive integer written plainly; anything else is a completion that cannot exist.
const CYCLE = /^[1-9]\d{0,9}$/;

const undoRoute: TaskHandler = async (event, ctx, params) => {
  if (!CYCLE.test(params.cycleSeq)) return err(404, 'not_found');
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseMutationBody(body);
  if (!input.ok) return invalid(input.field);
  return written(await undoCompletion(getStore(), ctx, params.id, Number(params.cycleSeq), input.value), 200);
};

const historyRoute: TaskHandler = async (_event, ctx, params) => noStore(ok(await taskHistory(getStore(), ctx, params.id)));

const proposeRoute: TaskHandler = async (event, ctx) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseProposalBody(body);
  if (!input.ok) return invalid(input.field);
  return written(await createProposal(getStore(), ctx, input.value), 201);
};

function resolveRoute(act: typeof acceptProposal | typeof declineProposal | typeof withdrawProposal): TaskHandler {
  return async (event, ctx, params) => {
    const body = parseJsonObject(event);
    if (!body) return invalid('body');
    const input = parseMutationBody(body);
    if (!input.ok) return invalid(input.field);
    return written(await act(getStore(), ctx, params.id, input.value), 200);
  };
}

const restoreRoute: TaskHandler = async (event, ctx) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseRestoreBody(body);
  if (!input.ok) return invalid(input.field);
  return written(await restoreEntries(getStore(), ctx, input.value), 200);
};

export function registerTaskRoutes(router: Router): void {
  router.get('/api/hh/tasks', withHousehold(getTasks));
  router.post('/api/hh/tasks', withHousehold(guarded([], postTask)));
  router.patch('/api/hh/tasks/{id}', withHousehold(guarded(['id'], patchTaskRoute)));
  router.delete('/api/hh/tasks/{id}', withHousehold(guarded(['id'], deleteTaskRoute)));
  router.post('/api/hh/tasks/{id}/complete', withHousehold(guarded(['id'], completeRoute)));
  router.delete('/api/hh/tasks/{id}/completions/{cycleSeq}', withHousehold(guarded(['id'], undoRoute)));
  router.get('/api/hh/tasks/{id}/history', withHousehold(guarded(['id'], historyRoute)));
  router.post('/api/hh/proposals', withHousehold(guarded([], proposeRoute)));
  router.post('/api/hh/proposals/{id}/accept', withHousehold(guarded(['id'], resolveRoute(acceptProposal))));
  router.post('/api/hh/proposals/{id}/decline', withHousehold(guarded(['id'], resolveRoute(declineProposal))));
  router.post('/api/hh/proposals/{id}/withdraw', withHousehold(guarded(['id'], resolveRoute(withdrawProposal))));
  router.post('/api/hh/restore', withHousehold(guarded([], restoreRoute)));
}
