# Deploying Hearthwise

Two ways to run it. Self-hosting (a container on your own machine) is in [`docs/SELF-HOSTING.md`](docs/SELF-HOSTING.md). This page is the AWS route: Lambda, DynamoDB and Auth0, deployed by GitHub Actions from `main`.

Hearthwise shares an AWS account, a state bucket and a GitHub OIDC provider with another app. Every Hearthwise resource name starts with `hearthwise`, and nothing here may touch the other app's resources. Read [`SECURITY.md`](SECURITY.md) before you start.

## 1. Once, by hand: the deploy role

Needs administrative AWS credentials. It reads the shared state bucket and OIDC provider as data sources and manages neither.

```bash
cd infra/initialSetup
cp terraform.tfvars.example terraform.tfvars   # edit: bucket, region, repository IDs. Git-ignored.
tofu init -backend-config=backend.hcl
tofu plan      # only the role, its policy and the attachment. Anything else: stop.
tofu apply
```

Details and the limits of that role: [`infra/initialSetup/README.md`](infra/initialSetup/README.md). Only a workflow on `main` can assume it; a pull request never gets AWS access.

## 2. Once, by hand: Auth0

Follow [`docs/AUTH0.md`](docs/AUTH0.md) (the API, the single-page application, access between them).

Optional first-login alert: install `infra/auth0/first-login.js` as its top comment says. Create the access key for the `hearthwise-auth0-alerts` IAM user **by hand in the AWS console** and paste it straight into the Action's secrets. OpenTofu never creates it, and it must not be stored anywhere else. AWS emails a confirmation link to the alert address; no alert arrives until it is clicked.

## 3. Once, by hand: push keys

```bash
yarn install
scripts/setup-vapid-keys.sh
```

It creates a key pair, puts the private half in SSM (`/hearthwise/vapid-private-key`) and the public half in the repository secret `VAPID_PUBLIC_KEY`. Neither is printed or written to disk. Re-running with `--force` replaces the keys and silently ends reminders on every installed phone, so don't.

### Calendar key

Calendar links are encrypted before they are stored. The key is 32 random bytes in SSM, made once by hand, **before** the deploy that adds this step (until it exists, adding a calendar answers "Calendars are not set up on this server" and nothing else changes):

```bash
aws ssm put-parameter --name /hearthwise/calendar-key --type SecureString --value "$(openssl rand -base64 32)"
```

The value is not printed. Both Lambdas read only this parameter and the push key. Do not run it again with `--overwrite`: a new key makes every stored link unreadable, and each person has to paste their links again. There is no rotation in this phase. In the container the key is `CALENDAR_KEY`, or the file `calendar.key` in the data directory (made on first start, mode 0600); keep it apart from backups, which hold only the encrypted links.

## 4. Repository settings

In GitHub, Settings, Secrets and variables, Actions:

| Name | Kind | Value |
|---|---|---|
| `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE` | secret | from Auth0 |
| `VAPID_PUBLIC_KEY` | secret | set by the script above |
| `ALERT_EMAIL` | variable | where sign-up alerts go (optional) |
| `APP_DOMAIN` | variable | custom domain (optional). A variable, not a secret: the plan check protects it |
| `ALLOW_DESTRUCTIVE_DEPLOY` | variable | leave unset. `true` lets one deploy delete the data table or domain |

The deploy role's ARN (the `github_actions_role_arn` output of step 1) is written in `.github/workflows/yarnBuild.yml` (`role-to-assume`); check it matches your account.

## 5. Deploy

Merging to `main` builds, tests and deploys (`tofu apply`). The deploy fails, by design, if the plan would delete the table or the domain. To run it by hand instead:

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # git-ignored
tofu init -backend-config=backend.hcl
tofu plan -out=tfplan
tofu show -json tfplan > plan.json
node ../scripts/check-plan.mjs plan.json
tofu apply tfplan
```

Never commit or upload `tfplan` or `plan.json`: they can hold secrets.

After the first apply, check a PATCH reaches the API and not the site:

```bash
curl -si -X PATCH "$(tofu output -raw api_endpoint)api/health" | head -5
```

Expected: `401` or `404` with `content-type: application/json`.

## 6. Check it on real phones

Run [`docs/MANUAL-CHECKS.md`](docs/MANUAL-CHECKS.md). Push on an iPhone only works once the app is on the Home Screen.

## Container

Set it up as in [`docs/SELF-HOSTING.md`](docs/SELF-HOSTING.md): first-run setup code, invites, backups. Push keys are made on first start and kept in `vapid.json` in the data directory (mode 0600). Back that file up with the database: a new one ends reminders on every installed phone.
