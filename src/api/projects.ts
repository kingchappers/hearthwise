import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { withHousehold } from '../household/guard';
import type { HouseholdContext } from '../household/types';
import { deleteProjectTree } from '../projects/children';
import { releaseRecord, takeRecord } from '../projects/holds';
import type { HoldTarget } from '../projects/holds';
import { getProject, getProjectsList, putProject } from '../projects/projects';
import { deleteStep, putStep } from '../projects/steps';
import * as events from '../push/events';
import type { NotifyEvent } from '../push/notifyOther';
import { parseProjectPut, parseStepPut, parseTakeBody } from '../shared/projectValidation';
import { getStore } from '../store';
import { invalid, noStore, ok, parseJsonObject } from './http';
import { notifyAfter } from './notify';
import { guarded, written } from './respond';
import type { TaskHandler } from './respond';
import type { Router } from './router';
import type { ApiResponse } from './types';

async function getList(event: APIGatewayProxyEventV2, ctx: HouseholdContext): Promise<ApiResponse> {
  // Today and the calendar need titles, days and holders but no step counts, so they ask for the light read.
  const counts = event.queryStringParameters?.counts !== '0';
  return noStore(ok(await getProjectsList(getStore(), ctx, { counts })));
}

const getOne: TaskHandler = async (_event, ctx, params) => noStore(ok(await getProject(getStore(), ctx, params.id)));

// A write tells the other person only when it was asked to (the "Let them know" tick), was fresh, and actually changed something.
const changed = (ctx: HouseholdContext, mutationId: string, projectId: string): NotifyEvent => events.projectChanged(ctx.member.displayName, mutationId, projectId);
const didChange = (outcome: string): boolean => outcome === 'created' || outcome === 'applied' || outcome === 'taken' || outcome === 'released';

const putProjectRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseProjectPut(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await putProject(getStore(), ctx, params.id, input.value);
  const { mutationId } = input.value;
  const notice = outcome.result.outcome === 'created' ? events.projectAdded(ctx.member.displayName, mutationId, params.id) : changed(ctx, mutationId, params.id);
  await notifyAfter(ctx, body, outcome.fresh, didChange(outcome.result.outcome) ? notice : undefined);
  return written(outcome, 200);
};

const deleteProjectRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseTakeBody(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await deleteProjectTree(getStore(), ctx, params.id, input.value);
  await notifyAfter(ctx, body, outcome.fresh, outcome.result.outcome === 'applied' ? changed(ctx, input.value.mutationId, params.id) : undefined);
  return written(outcome, 200);
};

const putStepRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseStepPut(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await putStep(getStore(), ctx, params.id, params.sid, input.value);
  await notifyAfter(ctx, body, outcome.fresh, didChange(outcome.result.outcome) ? changed(ctx, input.value.mutationId, params.id) : undefined);
  return written(outcome, 200);
};

const deleteStepRoute: TaskHandler = async (event, ctx, params) => {
  const body = parseJsonObject(event);
  if (!body) return invalid('body');
  const input = parseTakeBody(body);
  if (!input.ok) return invalid(input.field);
  const outcome = await deleteStep(getStore(), ctx, params.id, params.sid, input.value);
  await notifyAfter(ctx, body, outcome.fresh, outcome.result.outcome === 'applied' ? changed(ctx, input.value.mutationId, params.id) : undefined);
  return written(outcome, 200);
};

// A take or release of a project (no `sid`) or of one of its steps. Every answer is a 200 with an outcome.
function holdRoute(act: typeof takeRecord): TaskHandler {
  return async (event, ctx, params) => {
    const body = parseJsonObject(event);
    if (!body) return invalid('body');
    const input = parseTakeBody(body);
    if (!input.ok) return invalid(input.field);
    const target: HoldTarget = params.sid === undefined ? { kind: 'project', id: params.id } : { kind: 'step', projectId: params.id, id: params.sid };
    const outcome = await act(getStore(), ctx, target, input.value);
    await notifyAfter(ctx, body, outcome.fresh, didChange(outcome.result.outcome) ? changed(ctx, input.value.mutationId, params.id) : undefined);
    return written(outcome, 200);
  };
}

export function registerProjectRoutes(router: Router): void {
  router.get('/api/hh/projects', withHousehold(getList));
  router.get('/api/hh/projects/{id}', withHousehold(guarded(['id'], getOne)));
  router.put('/api/hh/projects/{id}', withHousehold(guarded(['id'], putProjectRoute)));
  router.delete('/api/hh/projects/{id}', withHousehold(guarded(['id'], deleteProjectRoute)));
  router.post('/api/hh/projects/{id}/take', withHousehold(guarded(['id'], holdRoute(takeRecord))));
  router.post('/api/hh/projects/{id}/release', withHousehold(guarded(['id'], holdRoute(releaseRecord))));
  router.put('/api/hh/projects/{id}/steps/{sid}', withHousehold(guarded(['id', 'sid'], putStepRoute)));
  router.delete('/api/hh/projects/{id}/steps/{sid}', withHousehold(guarded(['id', 'sid'], deleteStepRoute)));
  router.post('/api/hh/projects/{id}/steps/{sid}/take', withHousehold(guarded(['id', 'sid'], holdRoute(takeRecord))));
  router.post('/api/hh/projects/{id}/steps/{sid}/release', withHousehold(guarded(['id', 'sid'], holdRoute(releaseRecord))));
}
