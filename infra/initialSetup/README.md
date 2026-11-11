# Deploy role setup

OpenTofu configuration that creates the IAM role GitHub Actions assumes to deploy Hearthwise. Run it **once**, by hand, with administrative AWS credentials, before the main stack in `../`.

Hearthwise shares an AWS account with another app. This stack therefore **reads** two things that already exist and never manages them:

- the shared S3 state bucket (`data.aws_s3_bucket`)
- the GitHub OIDC provider (`data.aws_iam_openid_connect_provider`)

## What it creates

- the role `<app_name>-github-actions` (`hearthwise-github-actions`)
- the policy `<app_name>-github-actions-iam-policy`, attached to that role

## How the role is limited

- **Who can assume it:** only workflows from `kingchappers/hearthwise` on `main` or a pull request. The OIDC subject embeds the owner and repository IDs, so a fork or a re-created repository with the same name cannot.
- **What it can touch:** Lambda functions, IAM roles, log groups, DynamoDB tables and EventBridge rules named `<app_name>*`, and the app's own custom domain.
- **State:** read and write only under the `<app_name>/` key prefix of the shared bucket, so it can never read or overwrite the other app's state.
- **Itself:** an explicit deny stops it changing its own role. The role's name starts with `<app_name>-`, which the role statements would otherwise cover.
- **ACM certificates:** it can read any certificate, but can only create or change ones tagged `Application = <app_name>`.

Known limits, because AWS cannot scope these by name: API Gateway APIs, CloudWatch Logs resource policies and log deliveries. The role can reach the other app's resources of those kinds. `docs/DECISIONS.md` records this as an accepted risk.

## Usage

```bash
cd infra/initialSetup
cp terraform.tfvars.example terraform.tfvars   # then edit; it is git-ignored
tofu init -backend-config=backend.hcl
tofu plan
tofu apply
```

The plan must show **only** the role, the policy and the attachment being created. If it shows the state bucket or the OIDC provider, stop.

Then set the repository's deploy role ARN (the `github_actions_role_arn` output) where `.github/workflows/yarnBuild.yml` expects it.

## After the main stack is applied

Check that a PATCH reaches the API Lambda and not the single-page app:

```bash
curl -si -X PATCH "$(tofu -chdir=.. output -raw api_endpoint)api/health" | head -5
```

Expected: a JSON response (`401` or `404`) with `content-type: application/json`. A `200` with `text/html` means the `PATCH /api/{proxy+}` route is missing.
