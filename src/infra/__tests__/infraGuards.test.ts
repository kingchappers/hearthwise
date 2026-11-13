import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const INFRA = join(__dirname, '..', '..', '..', 'infra');
const read = (...parts: string[]): string => readFileSync(join(INFRA, ...parts), 'utf8');
const rootFiles = readdirSync(INFRA).filter(name => name.endsWith('.tf'));

// The block of a `statement { ... }` whose sid matches, so a rule is checked on the statement it belongs to.
function statement(source: string, sid: string): string {
  const start = source.indexOf(`sid       = "${sid}"`) >= 0 ? source.indexOf(`sid       = "${sid}"`) : source.indexOf(`sid    = "${sid}"`);
  if (start < 0) throw new Error(`no statement with sid ${sid}`);
  const open = source.lastIndexOf('statement {', start);
  const next = source.indexOf('\n  statement {', start);
  const comment = source.indexOf('\n  # ', start);
  const ends = [next, comment].filter(index => index > 0);
  return source.slice(open, ends.length > 0 ? Math.min(...ends) : undefined);
}

describe('the deploy role (infra/initialSetup)', () => {
  const setup = read('initialSetup', 'main.tf');

  it('can only be assumed from main, never from a pull request', () => {
    expect(setup).not.toContain('pull_request');
    expect(setup).toContain('${local.repo_subject}:ref:refs/heads/main');
  });

  it('creates roles only with the permissions boundary attached', () => {
    const create = statement(setup, 'IAMCreateRoleWithBoundary');
    expect(create).toContain('iam:CreateRole');
    expect(create).toContain('iam:PermissionsBoundary');
    expect(create).toContain('aws_iam_policy.lambda_boundary.arn');
  });

  it('is not given CreateRole in any statement without that condition', () => {
    const others = setup.replace(statement(setup, 'IAMCreateRoleWithBoundary'), '');
    expect(others).not.toContain('iam:CreateRole');
  });

  it('is never allowed to change or remove a role boundary', () => {
    expect(setup).not.toMatch(/"iam:(Put|Delete)RolePermissionsBoundary"/);
  });

  it('is denied every change to itself', () => {
    const deny = statement(setup, 'DenyChangesToTheDeployRoleItself');
    expect(deny).toContain('effect    = "Deny"');
    expect(deny).toContain('iam:*');
    expect(deny).toContain('local.deploy_role_arn');
  });

  it('reads and writes state only under its own key prefix', () => {
    expect(statement(setup, 'TerraformStateAccess')).toContain('/${var.app_name}/*');
  });

  it('reads the shared state bucket and OIDC provider and manages neither', () => {
    expect(setup).not.toMatch(/^resource "aws_s3_bucket/m);
    expect(setup).not.toMatch(/^resource "aws_iam_openid_connect_provider/m);
  });

  it('caps what a role it creates can do to this app\'s own resources', () => {
    const boundary = setup.slice(setup.indexOf('data "aws_iam_policy_document" "lambda_boundary"'), setup.indexOf('resource "aws_iam_policy" "lambda_boundary"'));
    expect(boundary).toContain('table/${var.app_name}-*');
    expect(boundary).toContain('parameter/${var.app_name}/*');
    expect(boundary).not.toMatch(/"(iam|sts|s3|lambda|apigateway):\*"/);
    expect(boundary).not.toMatch(/resources\s*=\s*\["\*"\]/);
  });
});

describe('the app stack (infra)', () => {
  const all = rootFiles.map(name => read(name)).join('\n');

  it('puts every Lambda execution role under the permissions boundary', () => {
    for (const role of ['lambda_role', 'api_role', 'push_role']) {
      const block = all.slice(all.indexOf(`resource "aws_iam_role" "${role}"`));
      expect(block.slice(0, block.indexOf('\n}\n'))).toContain('permissions_boundary');
    }
  });

  it('sends PATCH requests to the API Lambda, not the static one', () => {
    expect(read('api-lambda.tf')).toContain('route_key = "PATCH /api/{proxy+}"');
  });

  it('names nothing after the other app in the shared account', () => {
    expect(all.toLowerCase()).not.toMatch(/budget|hoardwise/);
    expect(read('initialSetup', 'main.tf').toLowerCase()).not.toMatch(/budget|hoardwise/);
    expect(read('backend.hcl')).toContain('key    = "hearthwise/terraform.tfstate"');
    expect(read('initialSetup', 'backend.hcl')).toContain('key    = "hearthwise-infra-setup/terraform.tfstate"');
    expect(all).toContain('/hearthwise/vapid-private-key');
  });

  it('locks its state, so two deploys can never write it at once', () => {
    expect(read('backend.hcl')).toContain('use_lockfile = true');
    expect(read('initialSetup', 'backend.hcl')).toContain('use_lockfile = true');
  });

  it('tags the API Gateway API with the app name, so access can be limited by tag later', () => {
    const lambda = read('lambda.tf');
    const api = lambda.slice(lambda.indexOf('resource "aws_apigatewayv2_api" "app"'), lambda.indexOf('# Integration between API Gateway and Lambda'));
    expect(api).toContain('Application = var.app_name');
  });
});

describe('the CI workflow', () => {
  const workflow = readFileSync(join(INFRA, '..', '.github', 'workflows', 'yarnBuild.yml'), 'utf8');

  it('never runs two deploys at the same time, and never cancels one that has started', () => {
    const deploy = workflow.slice(workflow.indexOf('\n  deploy:'));
    expect(deploy).toMatch(/concurrency:\s*\n\s+group: deploy\s*\n\s+cancel-in-progress: false/);
  });
});
