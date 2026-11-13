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

# Every Lambda execution role is created under this boundary, which infra/initialSetup creates. The deploy role cannot create a
# role without it.
locals {
  lambda_boundary_arn = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:policy/${var.app_name}-lambda-boundary"
}
