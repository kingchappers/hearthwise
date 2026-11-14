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

describe('sign-up alerts (infra/initialSetup)', () => {
  const setup = read('initialSetup', 'main.tf');
  const deployPolicy = setup.slice(
    setup.indexOf('data "aws_iam_policy_document" "github_iam_policy_document"'),
    setup.indexOf('resource "aws_iam_policy" "github_actions_iam_policy"'),
  );
  const alertUserPolicy = setup.slice(
    setup.indexOf('data "aws_iam_policy_document" "auth0_alerts"'),
    setup.indexOf('resource "aws_iam_user_policy" "auth0_alerts"'),
  );

  it('gives the Auth0 alert user permission to publish to the alerts topic and nothing else', () => {
    expect(alertUserPolicy).toContain('actions   = ["sns:Publish"]');
    expect(alertUserPolicy).toContain('${var.aws_region}:${local.account_id}:${var.app_name}-alerts');
    expect(alertUserPolicy.match(/statement \{/g)).toHaveLength(1);
  });

  it('names the alert user after the app', () => {
    expect(setup).toMatch(/resource "aws_iam_user" "auth0_alerts" \{\s+name\s+= "\$\{var\.app_name\}-auth0-alerts"/);
  });

  it('never creates an access key, so no secret reaches state', () => {
    expect(setup).not.toContain('aws_iam_access_key');
  });

  it('lets the deploy role manage topics named after the app, and nothing wider', () => {
    const sns = statement(setup, 'SnsTopicManagement');
    expect(sns).toContain('arn:aws:sns:${var.aws_region}:${local.account_id}:${var.app_name}-*');
    expect(sns).not.toMatch(/resources\s*=\s*\["\*"\]/);
    expect(sns).not.toMatch(/sns:\*/);
  });

  it('does not let the deploy role create users or write user policies', () => {
    expect(deployPolicy).not.toMatch(/"iam:(CreateUser|PutUserPolicy|AttachUserPolicy|CreateAccessKey)"/);
  });

  it('still lets a Lambda role publish to this app\'s topics, and no others', () => {
    const alerts = statement(setup, 'Alerts');
    expect(alerts).toContain('sns:Publish');
    expect(alerts).toContain('${var.app_name}-*');
  });
});

describe('sign-up alerts (infra)', () => {
  const alerts = read('alerts.tf');
  const variables = read('variables.tf');

  it('names the topic from app_name', () => {
    expect(alerts).toContain('name = "${var.app_name}-alerts"');
  });

  it('subscribes the alert email only when one is set', () => {
    expect(alerts).toMatch(/resource "aws_sns_topic_subscription" "email" \{\s+count\s+= var\.alert_email != "" \? 1 : 0/);
  });

  it('leaves alert_email empty by default', () => {
    const block = variables.slice(variables.indexOf('variable "alert_email"'));
    expect(block.slice(0, block.indexOf('\n}'))).toContain('default     = ""');
  });

  it('hands the API Lambda the topic and lets only its role publish to it', () => {
    const api = read('api-lambda.tf');
    expect(api).toContain('ALERT_TOPIC_ARN = aws_sns_topic.alerts.arn');
    expect(alerts).toMatch(/"sns:Publish"/);
    expect(alerts).toContain('aws_iam_role.api_role.id');
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

describe('push keys and the scheduler (infra)', () => {
  const push = read('push-lambda.tf');
  const api = read('api-lambda.tf');
  const block = (source: string, name: string): string => {
    const start = source.indexOf(`resource "aws_iam_role_policy" "${name}"`);
    if (start < 0) throw new Error(`no policy ${name}`);
    const end = source.indexOf('\nresource ', start + 1);
    return source.slice(start, end < 0 ? undefined : end);
  };

  it('lets the scheduler change only what it must: query, read, claim (update), hold (put) and delete, on the table alone', () => {
    const policy = block(push, 'push_dynamodb');
    for (const action of ['Query', 'GetItem', 'UpdateItem', 'PutItem', 'DeleteItem']) expect(policy).toContain(`"dynamodb:${action}"`);
    expect(policy).not.toMatch(/dynamodb:(Scan|BatchWrite|\*)/);
    expect(policy).toContain('Resource = aws_dynamodb_table.hearthwise_data.arn');
  });

  it('lets the scheduler read the one VAPID parameter and no other', () => {
    const policy = block(push, 'push_ssm');
    expect(policy).toContain('parameter${local.vapid_private_key_parameter}');
    expect(policy).not.toMatch(/parameter\/?\*|Resource\s*=\s*"\*"/);
  });

  it('lets the API read the same one parameter, and hands it the three VAPID settings', () => {
    const policy = block(api, 'api_ssm');
    expect(policy).toContain('ssm:GetParameter');
    expect(policy).toContain('parameter${local.vapid_private_key_parameter}');
    expect(policy).not.toMatch(/parameter\/?\*|Resource\s*=\s*"\*"/);
    for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_SUBJECT', 'VAPID_PRIVATE_KEY_PARAMETER']) expect(api).toContain(name);
  });

  it('keeps the private key out of every variable, output and the repository', () => {
    for (const file of rootFiles) {
      const source = read(file);
      expect(source).not.toMatch(/vapid_private_key\s*=\s*var\./);
      expect(source).not.toMatch(/variable "vapid_private/);
    }
  });
});

describe('the CI workflow', () => {
  const workflow = readFileSync(join(INFRA, '..', '.github', 'workflows', 'yarnBuild.yml'), 'utf8');

  it('gives the public push key to every step that builds the app, so /config.json can offer push', () => {
    const builds = workflow.split('\n    - name: ').filter(step => /^(Build app with Auth0 config|Build the Lambda bundles)/.test(step));
    expect(builds).toHaveLength(2);
    for (const step of builds) expect(step).toContain('VAPID_PUBLIC_KEY: ${{ secrets.VAPID_PUBLIC_KEY }}');
    expect(workflow).not.toMatch(/VAPID_PRIVATE/);
  });

  it('never runs two deploys at the same time, and never cancels one that has started', () => {
    const deploy = workflow.slice(workflow.indexOf('\n  deploy:'));
    expect(deploy).toMatch(/concurrency:\s*\n\s+group: deploy\s*\n\s+cancel-in-progress: false/);
  });

  it('checks the plan for protected deletions after planning and before applying', () => {
    const plan = workflow.indexOf('tofu plan -out=tfplan');
    const check = workflow.indexOf('node ../scripts/check-plan.mjs');
    const apply = workflow.indexOf('tofu apply');
    expect(plan).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(plan);
    expect(apply).toBeGreaterThan(check);
  });

  it('takes the override from a repository variable, not a secret, and never uploads the plan', () => {
    expect(workflow).toContain('ALLOW_DESTRUCTIVE_DEPLOY: ${{ vars.ALLOW_DESTRUCTIVE_DEPLOY }}');
    expect(workflow).not.toContain('upload-artifact');
  });

  it('reads the custom domain from a repository variable, which the plan check protects', () => {
    expect(workflow).toContain('TF_VAR_app_domain: ${{ vars.APP_DOMAIN }}');
  });
});
