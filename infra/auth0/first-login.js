/**
 * Auth0 post-login Action: tells the owner when someone signs in to Hearthwise for the first time.
 *
 * It publishes { event: 'user_first_seen', userId, at } to the SNS alerts topic. The message never carries an email or a
 * name. A failed publish is logged and swallowed: a login must never fail because an alert did.
 *
 * Install by hand (Auth0 dashboard > Actions > Library > Build Custom, trigger "Login / Post Login"), then add it to the
 * Login flow:
 *   1. Dependency: @aws-sdk/client-sns (any recent 3.x).
 *   2. Secrets:
 *        AWS_REGION             the topic's region, for example eu-west-2
 *        ALERT_TOPIC_ARN        the alerts_topic_arn output of the main stack
 *        AWS_ACCESS_KEY_ID      } an access key created by hand in the AWS console for the IAM user
 *        AWS_SECRET_ACCESS_KEY  } hearthwise-auth0-alerts (infra/initialSetup). It can only publish to the alerts topic.
 *   3. Paste this file's contents, then Deploy.
 *
 * `createHandler` takes the publish function so the logic can be tested without AWS (src/infra/__tests__/firstLogin.test.ts).
 */

exports.createHandler = (publish) => async (event) => {
  if (event.stats?.logins_count !== 1) return;
  const message = JSON.stringify({
    event: 'user_first_seen',
    userId: event.user.user_id,
    at: new Date().toISOString(),
  });
  try {
    await publish(message);
  } catch (error) {
    console.warn(`first-login alert not sent: ${error instanceof Error ? error.message : String(error)}`);
  }
};

exports.onExecutePostLogin = async (event, api) => {
  const publish = async (message) => {
    const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');
    const client = new SNSClient({
      region: event.secrets.AWS_REGION,
      credentials: {
        accessKeyId: event.secrets.AWS_ACCESS_KEY_ID,
        secretAccessKey: event.secrets.AWS_SECRET_ACCESS_KEY,
      },
    });
    await client.send(new PublishCommand({ TopicArn: event.secrets.ALERT_TOPIC_ARN, Message: message }));
  };
  await exports.createHandler(publish)(event, api);
};
