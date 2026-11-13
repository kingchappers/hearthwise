# ============================================================================
# Sign-up and security alerts
#
# One SNS topic. The API Lambda publishes security events to it (household created, invite accepted, and so on), and the
# Auth0 first-login Action publishes "user_first_seen" using the hand-made access key of the hearthwise-auth0-alerts IAM user
# (infra/initialSetup). Messages carry ids and the event type, never emails or names.
#
# The email subscription is created only when alert_email is set, and stays "pending" until the owner clicks the confirmation
# link AWS sends. Until then, nothing is delivered.
# ============================================================================

resource "aws_sns_topic" "alerts" {
  name = "${var.app_name}-alerts"

  tags = {
    Environment = var.environment
    ManagedBy   = "OpenTofu"
    Application = var.app_name
  }
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email != "" ? 1 : 0
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# The API Lambda may publish to this topic and nothing else.
resource "aws_iam_role_policy" "api_alerts" {
  name = "${var.app_name}-api-alerts"
  role = aws_iam_role.api_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.alerts.arn
      }
    ]
  })
}

output "alerts_topic_arn" {
  value       = aws_sns_topic.alerts.arn
  description = "ARN of the alerts topic. Set it as the ALERT_TOPIC_ARN secret of the Auth0 first-login Action."
}
