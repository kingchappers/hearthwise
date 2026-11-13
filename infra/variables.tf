variable "aws_region" {
  description = "The AWS region to deploy resources in."
  type        = string
  default     = "eu-west-2"
}

variable "state_bucket" {
  description = "The name of the S3 bucket to store Terraform state."
  type        = string
}

variable "app_domain" {
  type        = string
  description = "Custom hostname for the app, such as hearth.example.com. Leave empty to use the API Gateway URL (the api_endpoint output)."
  default     = ""
}

variable "app_name" {
  # No default (matches state_bucket): this names/tags every resource in the
  # stack. A generic placeholder default here would let a local `tofu plan`/`apply`
  # run without TF_VAR_app_name silently target the wrong name and plan to rename
  # and replace the whole stack (Lambda functions, DynamoDB table, IAM roles).
  description = "The name of the application. Every resource name starts with it, and so does the deploy role's permission scope."
  type        = string
}

variable "environment" {
  type    = string
  default = "production"
}

variable "auth0_domain" {
  type        = string
  description = "Auth0 domain"
  sensitive   = true
}

variable "auth0_client_id" {
  type        = string
  description = "Auth0 client ID"
  sensitive   = true
}

variable "auth0_audience" {
  type        = string
  description = "Auth0 API audience identifier"
  sensitive   = true
}

# The public half of the VAPID key pair. Safe to expose in the browser; the private half lives only in SSM Parameter Store.
# Empty until the key pair is created (step 6).
variable "vapid_public_key" {
  type        = string
  description = "VAPID public key for web push. Leave empty until push is set up."
  default     = ""
}

# Who the push services can contact about this sender, as they require.
variable "vapid_subject" {
  type        = string
  description = "VAPID subject: an https or mailto address that identifies this app. Leave empty until push is set up."
  default     = ""
}
