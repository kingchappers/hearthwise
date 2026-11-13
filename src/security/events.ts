// Events someone running the deployment would want to hear about: a new household, an accepted invite, a first sign-in.
// Each goes to the log, and to an SNS topic (one email per event) when ALERT_TOPIC_ARN is set. They carry ids and the event
// type, never an email or a name. An alert that cannot be sent never fails the request that raised it.
export type SecurityEventType = 'household_created' | 'invite_accepted' | 'user_first_seen';

export interface SecurityEvent {
  event: SecurityEventType;
  userId: string;
  householdId?: string;
  at: string;
}

export interface EventDeps {
  log?: (line: string) => void;
  warn?: (line: string) => void;
  publish?: (message: string) => Promise<void>;
}

// Copying field by field, not spreading, is what keeps an extra field (an email, a name) out of the log and the topic.
function payloadOf(event: SecurityEvent): Record<string, string> {
  const payload: Record<string, string> = { event: event.event, userId: event.userId };
  if (event.householdId !== undefined) payload.householdId = event.householdId;
  payload.at = event.at;
  return payload;
}

async function publishToSns(topicArn: string, subject: string, message: string): Promise<void> {
  // Loaded here, so the container (which only logs) never needs the AWS SDK.
  const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
  await new SNSClient({ region: process.env.AWS_REGION }).send(new PublishCommand({ TopicArn: topicArn, Subject: subject, Message: message }));
}

export async function emitSecurityEvent(event: SecurityEvent, deps: EventDeps = {}): Promise<void> {
  const log = deps.log ?? ((line: string) => console.log(line));
  const warn = deps.warn ?? ((line: string) => console.warn(line));
  const payload = payloadOf(event);
  const message = JSON.stringify(payload);

  log(JSON.stringify({ type: 'security_event', ...payload }));

  const topicArn = process.env.ALERT_TOPIC_ARN;
  if (!topicArn) return;

  try {
    const publish = deps.publish ?? ((text: string) => publishToSns(topicArn, `Hearthwise: ${event.event}`, text));
    await publish(message);
  } catch {
    // Only the event type: the failure's own message could carry anything.
    warn(`Security alert for ${event.event} could not be published`);
  }
}
