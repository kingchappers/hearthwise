import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { ApiResponse } from './types';
import { SECURITY_HEADERS } from './constants';
import { invalid } from './http';

type Handler = (
  event: APIGatewayProxyEventV2,
  userId: string,
  params: Record<string, string>,
) => Promise<ApiResponse>;

interface Route {
  method: string;
  template: string;
  pattern: RegExp;
  paramNames: string[];
  handler: Handler;
}

export interface Router {
  get(path: string, handler: Handler): void;
  post(path: string, handler: Handler): void;
  put(path: string, handler: Handler): void;
  patch(path: string, handler: Handler): void;
  delete(path: string, handler: Handler): void;
  dispatch(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse>;
  routes(): { method: string; template: string }[];
}

export function createRouter(): Router {
  const routes: Route[] = [];

  function register(method: string, pathTemplate: string, handler: Handler): void {
    const paramNames: string[] = [];
    const regexStr = pathTemplate.replace(/\{(\w+)\}/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    routes.push({ method, template: pathTemplate, pattern: new RegExp(`^${regexStr}$`), paramNames, handler });
  }

  async function dispatch(event: APIGatewayProxyEventV2, userId: string): Promise<ApiResponse> {
    const requestMethod = event.requestContext.http.method;
    const isHead = requestMethod === 'HEAD';
    const method = isHead ? 'GET' : requestMethod;
    const path = event.rawPath;

    for (const route of routes) {
      if (route.method !== method) continue;
      const match = path.match(route.pattern);
      if (!match) continue;

      // Parameters arrive percent-encoded ("auth0%7Cabc"); handlers see the real value. An encoded slash stays inside its one
      // parameter, because the route pattern matched the raw path before this decoding.
      const params: Record<string, string> = {};
      try {
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1]);
        });
      } catch {
        return invalid('path');
      }

      const response = await route.handler(event, userId, params);
      return isHead ? { ...response, body: '' } : response;
    }

    return {
      statusCode: 404,
      headers: SECURITY_HEADERS,
      body: JSON.stringify({ error: 'Endpoint not found' }),
    };
  }

  return {
    get: (path, handler) => register('GET', path, handler),
    post: (path, handler) => register('POST', path, handler),
    put: (path, handler) => register('PUT', path, handler),
    patch: (path, handler) => register('PATCH', path, handler),
    delete: (path, handler) => register('DELETE', path, handler),
    dispatch,
    routes: () => routes.map(({ method, template }) => ({ method, template })),
  };
}
