import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { SECURITY_HEADERS } from '../api/constants';
import { err, ok, parseJsonObject } from '../api/http';
import type { ApiResponse } from '../api/types';
import { HouseholdError } from '../household/types';
import { parseDisplayName, parseInviteToken } from '../shared/validation';
import { ConditionFailedError } from '../store';
import type { Store } from '../store';
import { clearedCookie, originAllowed, readSessionCookie, sessionCookie } from './cookies';
import {
  EmailTakenError, MAX_EMAIL_LENGTH, clearThrottle, createFirstAccount, createInvitedAccount, createSession, deleteSession,
  getAccountByEmail, isSetupOpen, isUsableEmail, readSession, recordFailure, throttleRemaining,
} from './localData';
import type { Account } from './localData';
import { MAX_PASSWORD_LENGTH, dummyRecord, validatePassword, verifyPassword } from './password';
import { serialisedPasswordAttempt } from './passwordAttempts';
import type { SetupCode } from './setupCode';

export interface AuthRouteContext {
  store: Store;
  // Present while first-run setup is open: the one-time code the person running the server read from the log.
  setupCode: SetupCode | undefined;
  // Called once when the code has been spent, so the host can remove any copy of it.
  onCodeUsed?: () => void;
  secureCookie: boolean;
  appOrigin?: string;
  nowSeconds(): number;
}

const NO_STORE = { 'Cache-Control': 'no-store' };

function withCookie(response: ApiResponse, cookie: string): ApiResponse {
  return { ...response, headers: { ...response.headers, ...NO_STORE }, cookies: [cookie] };
}

function noStore(response: ApiResponse): ApiResponse {
  return { ...response, headers: { ...response.headers, ...NO_STORE } };
}

// 400 { error: 'invalid', field, message }: the field is for code, the message is what the sign-in form shows.
function invalidField(field: string, message: string): ApiResponse {
  return err(400, 'invalid', { field, message });
}

const publicAccount = (account: Pick<Account, 'userId' | 'email' | 'displayName'>) => ({
  userId: account.userId,
  email: account.email,
  displayName: account.displayName,
});

async function signInResponse(ctx: AuthRouteContext, account: Account, nowSeconds: number): Promise<ApiResponse> {
  const token = await createSession(ctx.store, account, nowSeconds);
  return withCookie(ok(publicAccount(account)), sessionCookie(token, ctx.secureCookie));
}

async function status(ctx: AuthRouteContext): Promise<ApiResponse> {
  return noStore(ok({ setupRequired: await isSetupOpen(ctx.store) }));
}

type JsonBody = NonNullable<ReturnType<typeof parseJsonObject>>;

// The fields every new account needs, checked before anything costly (hashing) or stored.
function checkNewAccountFields(body: JsonBody): { email: string; password: string; displayName: string } | ApiResponse {
  const { email, password } = body;
  if (!isUsableEmail(email)) return invalidField('email', 'A valid email address is required');
  const passwordProblem = validatePassword(password);
  if (passwordProblem) return invalidField('password', passwordProblem);
  const displayName = parseDisplayName(body.displayName);
  if (!displayName.ok) return invalidField('displayName', 'A name of 1 to 40 characters is required');
  return { email, password: password as string, displayName: displayName.value };
}

const isResponse = (value: unknown): value is ApiResponse => typeof value === 'object' && value !== null && 'statusCode' in value;

async function setup(event: APIGatewayProxyEventV2, ctx: AuthRouteContext): Promise<ApiResponse> {
  const body = parseJsonObject(event);
  if (!body) return invalidField('body', 'Request body must be a JSON object');

  if (!(await isSetupOpen(ctx.store))) return err(409, 'This instance is already set up');
  if (typeof body.code !== 'string' || !ctx.setupCode?.matches(body.code)) return err(403, 'Invalid setup code');

  const fields = checkNewAccountFields(body);
  if (isResponse(fields)) return fields;

  try {
    const account = await createFirstAccount(ctx.store, fields);
    ctx.setupCode.clear();
    ctx.onCodeUsed?.();
    return signInResponse(ctx, account, ctx.nowSeconds());
  } catch (error) {
    if (error instanceof ConditionFailedError) return err(409, 'This instance is already set up');
    throw error;
  }
}

// An invited person creates their account and joins the household in one step. There is no other way to get a second account.
function signupWithInvite(event: APIGatewayProxyEventV2, ctx: AuthRouteContext): Promise<ApiResponse> {
  return serialisedPasswordAttempt(() => attemptSignup(event, ctx));
}

async function attemptSignup(event: APIGatewayProxyEventV2, ctx: AuthRouteContext): Promise<ApiResponse> {
  const body = parseJsonObject(event);
  if (!body) return invalidField('body', 'Request body must be a JSON object');

  // A token of the wrong shape cannot be an invite: answered as an expired link before any password is hashed.
  const token = parseInviteToken(body.token);
  if (!token.ok) return err(410, 'invite_expired');
  const fields = checkNewAccountFields(body);
  if (isResponse(fields)) return fields;

  try {
    const { account } = await createInvitedAccount(ctx.store, { token: token.value, ...fields, nowMs: ctx.nowSeconds() * 1000 });
    return signInResponse(ctx, account, ctx.nowSeconds());
  } catch (error) {
    if (error instanceof EmailTakenError) return err(409, 'email_taken');
    if (error instanceof HouseholdError) return err(error.status, error.code, error.extra);
    throw error;
  }
}

async function attemptLogin(event: APIGatewayProxyEventV2, ctx: AuthRouteContext): Promise<ApiResponse> {
  const body = parseJsonObject(event);
  if (!body) return invalidField('body', 'Request body must be a JSON object');
  const { email, password } = body;
  if (typeof email !== 'string' || typeof password !== 'string') return invalidField('email', 'Email and password are required');

  const now = ctx.nowSeconds();
  // Only an address that could be a key has a throttle (see localData), so there is nothing to look up for any other.
  const usable = isUsableEmail(email);
  if (usable) {
    const wait = await throttleRemaining(ctx.store, email, now);
    if (wait > 0) {
      const limited = err(429, 'Too many attempts. Try again shortly.', { retryAfter: wait });
      return noStore({ ...limited, headers: { ...limited.headers, 'Retry-After': String(wait) } });
    }
  }

  const invalid = async (): Promise<ApiResponse> => {
    await recordFailure(ctx.store, email, now);
    return noStore(err(401, 'Invalid email or password'));
  };

  // Bound the hashing cost and the input size before spending any of it.
  if (!usable || password.length > MAX_PASSWORD_LENGTH || email.length > MAX_EMAIL_LENGTH * 2) return invalid();

  const account = await getAccountByEmail(ctx.store, email);
  // Always verify against some record, so an unknown email takes as long as a wrong password.
  let passwordMatches: boolean;
  try {
    passwordMatches = await verifyPassword(password, account ?? (await dummyRecord()));
  } catch (error) {
    // A stored record with unusable parameters cannot be verified, so it is a failed login. Log only the error message, never request data.
    console.error('Stored account password record could not be verified:', error instanceof Error ? error.message : String(error));
    return invalid();
  }
  if (!account || !passwordMatches) return invalid();

  await clearThrottle(ctx.store, email);
  return signInResponse(ctx, account, now);
}

function login(event: APIGatewayProxyEventV2, ctx: AuthRouteContext): Promise<ApiResponse> {
  return serialisedPasswordAttempt(() => attemptLogin(event, ctx));
}

async function logout(event: APIGatewayProxyEventV2, ctx: AuthRouteContext): Promise<ApiResponse> {
  await deleteSession(ctx.store, readSessionCookie(event, ctx.secureCookie));
  return withCookie(ok({}), clearedCookie(ctx.secureCookie));
}

async function me(event: APIGatewayProxyEventV2, ctx: AuthRouteContext): Promise<ApiResponse> {
  const session = await readSession(ctx.store, readSessionCookie(event, ctx.secureCookie), ctx.nowSeconds());
  const account = session ? await getAccountByEmail(ctx.store, session.email) : undefined;
  if (!session || !account) return noStore(err(401, 'Unauthorized'));
  return noStore(ok(publicAccount(account)));
}

// A Map, not an object literal: a path like "/constructor" must not resolve to an inherited property.
const POST_ROUTES = new Map<string, (event: APIGatewayProxyEventV2, ctx: AuthRouteContext) => Promise<ApiResponse>>([
  ['/api/auth/setup', setup],
  ['/api/auth/login', login],
  ['/api/auth/logout', logout],
  ['/api/auth/signup-with-invite', signupWithInvite],
]);

const FORBIDDEN: ApiResponse = { statusCode: 403, headers: SECURITY_HEADERS, body: JSON.stringify({ error: 'Forbidden' }) };

// These are the only routes that answer without a session (the AUTH-05 exceptions).
export async function handleAuthRoute(event: APIGatewayProxyEventV2, ctx: AuthRouteContext): Promise<ApiResponse | undefined> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === 'GET' && path === '/api/auth/status') return status(ctx);
  if (method === 'GET' && path === '/api/auth/me') return me(event, ctx);

  const handler = method === 'POST' ? POST_ROUTES.get(path) : undefined;
  if (!handler) return undefined;

  if (!originAllowed(event, ctx.appOrigin)) return FORBIDDEN;
  return handler(event, ctx);
}
