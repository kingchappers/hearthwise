// Usage: node scripts/check-plan.mjs <plan.json>      (plan.json is `tofu show -json <planfile>`)
//
// Run by the deploy job between `tofu plan` and `tofu apply`. It fails the deploy when the plan would delete something that
// cannot be quietly recreated: the DynamoDB table (all the household's data) or the custom domain, its certificate and its
// mapping (the site's address, and a DNS record at the registrar that has to be changed by hand when they are recreated).
// A missing repository variable once made a deploy delete the domain without anyone noticing; this makes that loud.
//
// A deliberate change, such as moving to a new domain, sets the repository variable ALLOW_DESTRUCTIVE_DEPLOY to "true" for
// that one deploy. Only the exact value "true" counts. The plan file holds variable values, so only addresses are ever printed.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const PROTECTED_TYPES = [
  'aws_dynamodb_table',
  'aws_acm_certificate',
  'aws_apigatewayv2_domain_name',
  'aws_apigatewayv2_api_mapping',
];

export function checkPlan(plan, env) {
  if (typeof plan !== 'object' || plan === null) throw new Error('Not a plan: expected a JSON object from `tofu show -json`');
  const changes = plan.resource_changes ?? [];
  if (!Array.isArray(changes)) throw new Error('Not a plan: resource_changes is not a list');

  // A replace is ["delete", "create"], so checking for "delete" covers both a removal and a replacement.
  const blocked = changes
    .filter(change => PROTECTED_TYPES.includes(change.type) && Array.isArray(change.change?.actions) && change.change.actions.includes('delete'))
    .map(change => change.address);

  const overridden = blocked.length > 0 && env.ALLOW_DESTRUCTIVE_DEPLOY === 'true';
  return { ok: blocked.length === 0 || overridden, blocked, overridden };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/check-plan.mjs <plan.json>');
    process.exit(2);
  }
  const result = checkPlan(JSON.parse(readFileSync(file, 'utf8')), process.env);

  if (result.blocked.length === 0) {
    console.log('Plan check: nothing protected would be deleted.');
    return;
  }
  const list = result.blocked.map(address => `  - ${address}`).join('\n');
  if (result.overridden) {
    console.warn(`Plan check: ALLOW_DESTRUCTIVE_DEPLOY is set, so these protected resources will be deleted or replaced:\n${list}`);
    return;
  }
  console.error(
    `Plan check FAILED: this deploy would delete or replace protected resources:\n${list}\n\n`
    + 'If that is not what you meant, a repository variable is probably missing or wrong (for example APP_DOMAIN, which must be a\n'
    + 'repository VARIABLE, not a secret). Nothing has been applied.\n'
    + 'If it is deliberate, set the repository variable ALLOW_DESTRUCTIVE_DEPLOY to "true", re-run the deploy, then remove the variable.',
  );
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
