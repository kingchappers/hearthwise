# ============================================================================
# Reminder scheduler: opt-in push notifications
#
# Runs once an hour: sends each person's digest and due nudges (if they turned them on) and releases held pushes. A second rule
# runs every five minutes and sends only the calendar reminders people asked for.
# Until a VAPID key pair exists, every run finds nothing to do.
# ============================================================================

locals {
  # Created by hand as a SecureString (SEC-01): the private key never appears in this repository or in state.
  vapid_private_key_parameter = "/hearthwise/vapid-private-key"

  # The key that encrypts stored calendar links (AES-256-GCM), created by hand the same way: it never appears in this repository or in state.
  calendar_key_parameter = "/hearthwise/calendar-key"
}

# Scheduler execution role (INFRA-01): its own table access, and two parameters
resource "aws_iam_role" "push_role" {
  permissions_boundary = local.lambda_boundary_arn
  name                 = "${var.app_name}-push-role"
  description          = "Execution role for the reminder scheduler Lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = { Service = "lambda.amazonaws.com" }
      }
    ]
  })

  tags = {
    Environment = var.environment
    ManagedBy   = "OpenTofu"
  }
}

resource "aws_iam_role_policy_attachment" "push_basic_execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = aws_iam_role.push_role.name
}

# It reads subscribers, members and tasks; claims a digest or a held push (UpdateItem, DeleteItem); and removes a subscription the
# push service reports as gone. It never scans the table (INFRA-01).
resource "aws_iam_role_policy" "push_dynamodb" {
  name = "${var.app_name}-push-dynamodb"
  role = aws_iam_role.push_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
        ]
        Resource = aws_dynamodb_table.hearthwise_data.arn
      }
    ]
  })
}

# The VAPID private key and the calendar key, and only those two parameters (INFRA-01)
resource "aws_iam_role_policy" "push_ssm" {
  name = "${var.app_name}-push-ssm"
  role = aws_iam_role.push_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["ssm:GetParameter"]
        Resource = [
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.vapid_private_key_parameter}",
          "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${local.calendar_key_parameter}",
        ]
      }
    ]
  })
}

data "archive_file" "push_lambda_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../build/push"
  output_path = "${path.module}/push_lambda_function.zip"
}

resource "aws_lambda_function" "push" {
  filename         = data.archive_file.push_lambda_zip.output_path
  function_name    = "${var.app_name}-push"
  role             = aws_iam_role.push_role.arn
  handler          = "index.handler"
  runtime          = "nodejs24.x"
  timeout          = 120
  memory_size      = 512
  source_code_hash = data.archive_file.push_lambda_zip.output_base64sha256

  environment {
    variables = {
      NODE_ENV                    = "production"
      DYNAMODB_TABLE              = aws_dynamodb_table.hearthwise_data.name
      VAPID_PUBLIC_KEY            = var.vapid_public_key
      VAPID_SUBJECT               = var.vapid_subject
      VAPID_PRIVATE_KEY_PARAMETER = local.vapid_private_key_parameter
      CALENDAR_KEY_PARAMETER      = local.calendar_key_parameter
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.push_lambda.name
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "OpenTofu"
  }
}

# On the hour, every hour: a person chooses the hour in their own time zone.
resource "aws_cloudwatch_event_rule" "push_hourly" {
  name                = "${var.app_name}-push-hourly"
  description         = "Runs the reminder scheduler on the hour"
  schedule_expression = "cron(0 * * * ? *)"

  tags = {
    Environment = var.environment
    ManagedBy   = "OpenTofu"
  }
}

resource "aws_cloudwatch_event_target" "push_hourly" {
  rule = aws_cloudwatch_event_rule.push_hourly.name
  arn  = aws_lambda_function.push.arn
}

# Only this rule may invoke the scheduler (INFRA-02)
resource "aws_lambda_permission" "push_eventbridge" {
  statement_id  = "AllowEventBridgeInvokePush"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.push.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.push_hourly.arn
}

# Every five minutes: calendar reminders. The input tells the handler to run only the reminders, so the hourly work (digests and
# nudges) is never done twice.
resource "aws_cloudwatch_event_rule" "push_reminders" {
  name                = "${var.app_name}-push-reminders"
  description         = "Sends the calendar reminders people asked for"
  schedule_expression = "rate(5 minutes)"

  tags = {
    Environment = var.environment
    ManagedBy   = "OpenTofu"
  }
}

resource "aws_cloudwatch_event_target" "push_reminders" {
  rule  = aws_cloudwatch_event_rule.push_reminders.name
  arn   = aws_lambda_function.push.arn
  input = jsonencode({ job = "reminders" })
}

# Only this rule may invoke the reminders, under its own statement (INFRA-02)
resource "aws_lambda_permission" "push_reminders_eventbridge" {
  statement_id  = "AllowEventBridgeInvokePushReminders"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.push.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.push_reminders.arn
}
