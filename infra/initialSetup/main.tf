terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  # Backend configuration is provided via backend.hcl file
  # Usage: tofu init -backend-config=backend.hcl
  backend "s3" {}
}

provider "aws" {
  region = var.aws_region
}

# Get current AWS account ID for scoped permissions
data "aws_caller_identity" "current" {}

# ============================================================================
# Shared resources that already exist in this AWS account
#
# The state bucket and the GitHub OIDC provider were created for another app in the same account. They are read here and
# never managed: applying this stack cannot create, change or delete either of them.
# ============================================================================

data "aws_s3_bucket" "terraform_state" {
  bucket = var.state_bucket
}

data "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  account_id       = data.aws_caller_identity.current.account_id
  deploy_role_name = "${var.app_name}-github-actions"
  # Built by hand, not read from the role, so the deny below does not depend on the role it protects.
  deploy_role_arn = "arn:aws:iam::${local.account_id}:role/${local.deploy_role_name}"
  repo_subject    = "repo:kingchappers@${var.github_owner_id}/${var.github_repo}@${var.github_repo_id}"
}

# ============================================================================
# Permissions boundary for every Lambda execution role
#
# The deploy role can create roles and write their policies. Without a ceiling, a workflow could give a new role broad
# access and run code under it, reaching anything in the account, including the other app's data. The deploy role may only
# create a role with this boundary attached, and cannot change or remove it, so no role it creates can do more than this.
# Widening what the Lambdas may do (a new AWS service) is a change to this file, applied by hand with administrator credentials.
# ============================================================================

data "aws_iam_policy_document" "lambda_boundary" {
  statement {
    sid     = "Logs"
    effect  = "Allow"
    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [
      "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/aws/lambda/${var.app_name}*:*",
      "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/${var.app_name}/lambda/*:*",
    ]
  }

  statement {
    sid    = "Data"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
      "dynamodb:UpdateItem",
      "dynamodb:ConditionCheckItem",
    ]
    resources = ["arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/${var.app_name}-*"]
  }

  statement {
    sid       = "Parameters"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:${local.account_id}:parameter/${var.app_name}/*"]
  }

  statement {
    sid       = "Alerts"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = ["arn:aws:sns:${var.aws_region}:${local.account_id}:${var.app_name}-*"]
  }
}

resource "aws_iam_policy" "lambda_boundary" {
  name        = "${var.app_name}-lambda-boundary"
  description = "Ceiling for every ${var.app_name} Lambda execution role. A role the deploy role creates cannot do more than this."
  policy      = data.aws_iam_policy_document.lambda_boundary.json

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Application = var.app_name
  }
}

# ============================================================================
# IAM Role for GitHub Actions (INFRA-01)
# ============================================================================

data "aws_iam_policy_document" "assume_role" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github_actions.arn]
    }

    # SECURITY: only workflows running on main in this repository. A pull request is deliberately not trusted: any
    # collaborator can change a pull request's workflow, and this role can deploy. The subject embeds the owner and
    # repository IDs, so a fork, or a new repository that takes this name later, cannot assume the role either.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${local.repo_subject}:ref:refs/heads/main"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "github_actions_role" {
  name               = local.deploy_role_name
  assume_role_policy = data.aws_iam_policy_document.assume_role.json

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Application = var.app_name
  }
}

# ============================================================================
# IAM Policy for GitHub Actions (INFRA-01 - Least Privilege)
#
# Everything is scoped to resources named after app_name, except where AWS cannot scope it by name (noted per statement).
# This role shares an AWS account with another app, so a statement that is wider than the app is called out as a known limit.
# ============================================================================

data "aws_iam_policy_document" "github_iam_policy_document" {
  # Lambda function management
  statement {
    sid    = "LambdaFunctionManagement"
    effect = "Allow"
    actions = [
      "lambda:CreateFunction",
      "lambda:DeleteFunction",
      "lambda:GetFunction",
      "lambda:GetFunctionCodeSigningConfig",
      "lambda:ListVersionsByFunction",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:TagResource",
      "lambda:UntagResource",
    ]
    resources = [
      "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:${var.app_name}",
      "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:${var.app_name}-*",
    ]
  }

  # Lambda permissions management
  statement {
    sid    = "LambdaPermissions"
    effect = "Allow"
    actions = [
      "lambda:AddPermission",
      "lambda:RemovePermission",
      "lambda:GetPolicy",
    ]
    resources = [
      "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:${var.app_name}",
      "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:${var.app_name}-*",
    ]
  }

  # Creating a role needs the boundary. iam:PermissionsBoundary is only present when one is attached, so a CreateRole
  # without it matches nothing and is refused. Changing or removing a boundary later is not granted anywhere.
  statement {
    sid       = "IAMCreateRoleWithBoundary"
    effect    = "Allow"
    actions   = ["iam:CreateRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.app_name}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.lambda_boundary.arn]
    }
  }

  # IAM role management for Lambda execution
  statement {
    sid    = "IAMRoleManagement"
    effect = "Allow"
    actions = [
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:ListAttachedRolePolicies",
      "iam:ListRolePolicies",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:TagRole",
      "iam:UntagRole",
    ]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.app_name}-*"]
  }

  # IAM policy attachment for Lambda execution role
  statement {
    sid    = "IAMPolicyAttachment"
    effect = "Allow"
    actions = [
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
    ]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.app_name}-*"]
    # Only allow attaching AWS managed Lambda execution policy
    condition {
      test     = "ArnEquals"
      variable = "iam:PolicyARN"
      values   = ["arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]
    }
  }

  # Inline role policies on the Lambda execution roles (e.g. DynamoDB data access)
  statement {
    sid    = "IAMInlineRolePolicy"
    effect = "Allow"
    actions = [
      "iam:PutRolePolicy",
      "iam:GetRolePolicy",
      "iam:DeleteRolePolicy",
    ]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.app_name}-*"]
  }

  # PassRole for Lambda to assume execution role
  statement {
    sid       = "PassRoleToLambda"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.app_name}-*"]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  # The deploy role is itself named "<app_name>-github-actions", so it falls inside the "<app_name>-*" role statements
  # above. Without this deny, a workflow run could rewrite its own permissions. A deny always beats an allow.
  statement {
    sid       = "DenyChangesToTheDeployRoleItself"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = [local.deploy_role_arn]
  }

  # API Gateway management (v2 HTTP APIs).
  # KNOWN LIMIT: API and tag ARNs carry generated IDs, not names, so these cannot be scoped to this app's API. The deploy role
  # can therefore change or delete other HTTP APIs in the account, and with lambda:AddPermission could point one at a Hearthwise
  # Lambda. The API is tagged Application = <app_name>: limit these actions by aws:ResourceTag/Application once that has been
  # tested against a real apply (docs/DECISIONS.md). The custom domain names below ARE scoped to this app's own.
  statement {
    sid    = "APIGatewayManagement"
    effect = "Allow"
    actions = [
      "apigateway:DELETE",
      "apigateway:GET",
      "apigateway:PATCH",
      "apigateway:POST",
      "apigateway:PUT",
      "apigateway:TagResource",
      "apigateway:UntagResource",
    ]
    resources = concat(
      [
        "arn:aws:apigateway:${var.aws_region}::/apis",
        "arn:aws:apigateway:${var.aws_region}::/apis/*",
        "arn:aws:apigateway:${var.aws_region}::/v2/apis",
        "arn:aws:apigateway:${var.aws_region}::/v2/apis/*",
        "arn:aws:apigateway:${var.aws_region}::/tags/*",
        "arn:aws:apigateway:${var.aws_region}::/domainnames",
      ],
      # Only the app's own custom domain, and what hangs beneath it (its API mappings)
      flatten([
        for domain in compact([var.custom_domain]) : [
          "arn:aws:apigateway:${var.aws_region}::/domainnames/${domain}",
          "arn:aws:apigateway:${var.aws_region}::/domainnames/${domain}/*",
          "arn:aws:apigateway:${var.aws_region}::/v2/domainnames/${domain}",
          "arn:aws:apigateway:${var.aws_region}::/v2/domainnames/${domain}/*",
        ]
      ])
    )
  }

  # CloudWatch Logs for Lambda and API Gateway (resource-specific)
  statement {
    sid    = "CloudWatchLogsManagement"
    effect = "Allow"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:ListTagsForResource",
      "logs:PutRetentionPolicy",
      "logs:DeleteRetentionPolicy",
      "logs:TagResource",
      "logs:UntagResource",
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/aws/lambda/${var.app_name}*",
      "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/aws/apigateway/${var.app_name}*",
      # Custom-named log groups (/${app_name}/lambda/{static,api,push}), distinct from the AWS-default /aws/lambda/* pattern above.
      "arn:aws:logs:${var.aws_region}:${local.account_id}:log-group:/${var.app_name}/lambda/*",
    ]
  }

  # CloudWatch Logs list operations (require wildcard resource)
  statement {
    sid       = "CloudWatchLogsListOperations"
    effect    = "Allow"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }

  # CloudWatch Logs resource policies for API Gateway.
  # KNOWN LIMIT: these are account-wide and cannot be scoped by name, so the deploy role can also change another app's log policy.
  statement {
    sid    = "CloudWatchLogsResourcePolicy"
    effect = "Allow"
    actions = [
      "logs:PutResourcePolicy",
      "logs:DeleteResourcePolicy",
      "logs:DescribeResourcePolicies",
    ]
    resources = ["*"]
  }

  # CloudWatch Logs delivery (required for API Gateway logging)
  statement {
    sid    = "CloudWatchLogsDelivery"
    effect = "Allow"
    actions = [
      "logs:ListLogDeliveries",
      "logs:GetLogDelivery",
      "logs:CreateLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
    ]
    resources = ["*"]
  }

  # DynamoDB table management for the application data store (INFRA-01)
  # Scoped to the app table; covers create/update/delete plus the describe
  # calls the AWS provider makes on read-back (PITR, TTL, tags).
  statement {
    sid    = "DynamoDBTableManagement"
    effect = "Allow"
    actions = [
      "dynamodb:CreateTable",
      "dynamodb:DeleteTable",
      "dynamodb:DescribeTable",
      "dynamodb:UpdateTable",
      "dynamodb:DescribeContinuousBackups",
      "dynamodb:UpdateContinuousBackups",
      "dynamodb:DescribeTimeToLive",
      "dynamodb:UpdateTimeToLive",
      "dynamodb:ListTagsOfResource",
      "dynamodb:TagResource",
      "dynamodb:UntagResource",
    ]
    resources = ["arn:aws:dynamodb:${var.aws_region}:${local.account_id}:table/${var.app_name}-*"]
  }

  # SNS topic for sign-up and security alerts. Scoped to topics named after the app. sns:TagResource is needed because the topic is tagged.
  statement {
    sid    = "SnsTopicManagement"
    effect = "Allow"
    actions = [
      "sns:CreateTopic",
      "sns:DeleteTopic",
      "sns:GetTopicAttributes",
      "sns:SetTopicAttributes",
      "sns:ListTagsForResource",
      "sns:TagResource",
      "sns:UntagResource",
      "sns:Subscribe",
      "sns:Unsubscribe",
      "sns:GetSubscriptionAttributes",
      "sns:SetSubscriptionAttributes",
    ]
    resources = ["arn:aws:sns:${var.aws_region}:${local.account_id}:${var.app_name}-*"]
  }

  # EventBridge rule that runs the reminder scheduler (INFRA-01)
  # Scoped to rules named after the app. events:TagResource is needed because the rule is tagged.
  statement {
    sid    = "EventBridgeRuleManagement"
    effect = "Allow"
    actions = [
      "events:PutRule",
      "events:DeleteRule",
      "events:DescribeRule",
      "events:EnableRule",
      "events:DisableRule",
      "events:PutTargets",
      "events:RemoveTargets",
      "events:ListTargetsByRule",
      "events:ListTagsForResource",
      "events:TagResource",
      "events:UntagResource",
    ]
    resources = ["arn:aws:events:${var.aws_region}:${local.account_id}:rule/${var.app_name}-*"]
  }

  # The shared state bucket holds another app's state too. Reading and writing is limited to this app's own key prefix
  # (backend.hcl keeps its state under "<app_name>/"), so a workflow run here can never read or overwrite the other app's state.
  # Listing the bucket shows key names only.
  statement {
    sid       = "TerraformStateList"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [data.aws_s3_bucket.terraform_state.arn]
  }

  statement {
    sid    = "TerraformStateAccess"
    effect = "Allow"
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = ["${data.aws_s3_bucket.terraform_state.arn}/${var.app_name}/*"]
  }

  # STS GetCallerIdentity for data sources
  statement {
    sid       = "STSGetCallerIdentity"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }

  # ACM certificates for the optional custom domain. Certificate ARNs carry generated IDs, so they cannot be scoped by name:
  # reading is allowed on every certificate (the provider must read what it manages), but anything that creates or changes
  # one needs the Application tag set to this app's name (infra/lambda.tf tags its certificate that way).
  statement {
    sid    = "AcmRead"
    effect = "Allow"
    actions = [
      "acm:DescribeCertificate",
      "acm:GetCertificate",
      "acm:ListTagsForCertificate",
    ]
    resources = ["arn:aws:acm:${var.aws_region}:${local.account_id}:certificate/*"]
  }

  statement {
    sid       = "AcmList"
    effect    = "Allow"
    actions   = ["acm:ListCertificates"]
    resources = ["*"]
  }

  statement {
    sid    = "AcmRequestTagged"
    effect = "Allow"
    actions = [
      "acm:RequestCertificate",
      "acm:AddTagsToCertificate",
    ]
    resources = ["arn:aws:acm:${var.aws_region}:${local.account_id}:certificate/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestTag/Application"
      values   = [var.app_name]
    }
  }

  statement {
    sid    = "AcmChangeTagged"
    effect = "Allow"
    actions = [
      "acm:DeleteCertificate",
      "acm:RemoveTagsFromCertificate",
      "acm:UpdateCertificateOptions",
    ]
    resources = ["arn:aws:acm:${var.aws_region}:${local.account_id}:certificate/*"]
    condition {
      test     = "StringEquals"
      variable = "aws:ResourceTag/Application"
      values   = [var.app_name]
    }
  }
}

resource "aws_iam_policy" "github_actions_iam_policy" {
  name        = "${var.app_name}-github-actions-iam-policy"
  description = "Scoped policy for GitHub Actions to deploy ${var.app_name} infrastructure"
  policy      = data.aws_iam_policy_document.github_iam_policy_document.json

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Application = var.app_name
  }
}

resource "aws_iam_role_policy_attachment" "github_actions_role_policy_attach" {
  role       = aws_iam_role.github_actions_role.name
  policy_arn = aws_iam_policy.github_actions_iam_policy.arn
}

# ============================================================================
# IAM user for the Auth0 first-login Action
#
# Auth0 cannot assume an AWS role, so its Action publishes with an access key. The user can only publish to the alerts topic.
# OpenTofu creates the user and its policy and never the key: a key created here would sit in state. Create it by hand in the
# AWS console (IAM > Users > this user > Security credentials), paste it into the Action's secrets (infra/auth0/first-login.js),
# and rotate it there.
# ============================================================================

resource "aws_iam_user" "auth0_alerts" {
  name = "${var.app_name}-auth0-alerts"

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Application = var.app_name
  }
}

data "aws_iam_policy_document" "auth0_alerts" {
  statement {
    sid       = "PublishAlerts"
    effect    = "Allow"
    actions   = ["sns:Publish"]
    resources = ["arn:aws:sns:${var.aws_region}:${local.account_id}:${var.app_name}-alerts"]
  }
}

resource "aws_iam_user_policy" "auth0_alerts" {
  name   = "${var.app_name}-auth0-alerts-publish"
  user   = aws_iam_user.auth0_alerts.name
  policy = data.aws_iam_policy_document.auth0_alerts.json
}

# ============================================================================
# Outputs
# ============================================================================

output "github_actions_role_arn" {
  value       = aws_iam_role.github_actions_role.arn
  description = "ARN of the GitHub Actions IAM role"
}

output "oidc_provider_arn" {
  value       = data.aws_iam_openid_connect_provider.github_actions.arn
  description = "ARN of the existing GitHub OIDC provider"
}

output "state_bucket_name" {
  value       = data.aws_s3_bucket.terraform_state.id
  description = "Name of the existing shared Terraform state bucket"
}
