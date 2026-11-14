import { describe, expect, it } from 'vitest';
import { checkPlan, PROTECTED_TYPES } from '../../../scripts/check-plan.mjs';

type Action = 'create' | 'update' | 'delete' | 'no-op' | 'read';

function plan(...changes: [string, string, Action[]][]): unknown {
  return { resource_changes: changes.map(([type, address, actions]) => ({ type, address, change: { actions } })) };
}

describe('checkPlan', () => {
  it('lets a plan that only creates and updates through', () => {
    const result = checkPlan(plan(['aws_acm_certificate', 'aws_acm_certificate.app[0]', ['create'] as Action[]], ['aws_lambda_function', 'aws_lambda_function.app', ['update'] as Action[]]), {});
    expect(result).toEqual({ ok: true, blocked: [], overridden: false });
  });

  it.each(PROTECTED_TYPES)('blocks a plan that deletes %s', type => {
    const result = checkPlan(plan([type, `${type}.x`, ['delete']]), {});
    expect(result.ok).toBe(false);
    expect(result.blocked).toEqual([`${type}.x`]);
  });

  it('blocks a replace, because a replace deletes the old one first', () => {
    const result = checkPlan(plan(['aws_dynamodb_table', 'aws_dynamodb_table.hearthwise_data', ['delete', 'create']]), {});
    expect(result.ok).toBe(false);
    expect(result.blocked).toEqual(['aws_dynamodb_table.hearthwise_data']);
  });

  it('blocks the custom domain, its certificate and its mapping when app_domain is emptied', () => {
    const emptied = plan(
      ['aws_apigatewayv2_api_mapping', 'aws_apigatewayv2_api_mapping.app[0]', ['delete']],
      ['aws_apigatewayv2_domain_name', 'aws_apigatewayv2_domain_name.app[0]', ['delete']],
      ['aws_acm_certificate_validation', 'aws_acm_certificate_validation.app[0]', ['delete']],
      ['aws_acm_certificate', 'aws_acm_certificate.app[0]', ['delete']],
    );
    expect(checkPlan(emptied, {}).blocked).toEqual([
      'aws_apigatewayv2_api_mapping.app[0]', 'aws_apigatewayv2_domain_name.app[0]', 'aws_acm_certificate.app[0]',
    ]);
  });

  it('lets a deletion of something that is easy to recreate through', () => {
    const result = checkPlan(plan(['aws_lambda_permission', 'aws_lambda_permission.api_gateway', ['delete', 'create']]), {});
    expect(result.ok).toBe(true);
  });

  it('lets a protected deletion through only when it is explicitly allowed, and says so', () => {
    const deleting = plan(['aws_apigatewayv2_domain_name', 'aws_apigatewayv2_domain_name.app[0]', ['delete', 'create']]);
    expect(checkPlan(deleting, { ALLOW_DESTRUCTIVE_DEPLOY: 'true' })).toEqual({ ok: true, blocked: ['aws_apigatewayv2_domain_name.app[0]'], overridden: true });
  });

  it.each(['', 'yes', '1', 'TRUE', 'false'])('does not treat ALLOW_DESTRUCTIVE_DEPLOY=%j as permission', value => {
    expect(checkPlan(plan(['aws_dynamodb_table', 'aws_dynamodb_table.t', ['delete']]), { ALLOW_DESTRUCTIVE_DEPLOY: value }).ok).toBe(false);
  });

  it('treats a plan with no resource changes as fine, and a malformed plan as an error', () => {
    expect(checkPlan({}, {}).ok).toBe(true);
    expect(() => checkPlan(null, {})).toThrow(/not a plan/i);
    expect(() => checkPlan({ resource_changes: 'nope' }, {})).toThrow(/not a plan/i);
  });

  it('never puts values from the plan in its result: only addresses', () => {
    const withSecrets = { ...(plan(['aws_dynamodb_table', 'aws_dynamodb_table.t', ['delete']]) as object), variables: { auth0_domain: { value: 'secret.example' } } };
    expect(JSON.stringify(checkPlan(withSecrets, {}))).not.toContain('secret.example');
  });
});
