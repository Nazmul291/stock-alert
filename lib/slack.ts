import { IncomingWebhook } from '@slack/webhook';

export async function sendSlackNotification(
  webhookUrl: string,
  message: string
) {
  try {
    const webhook = new IncomingWebhook(webhookUrl);
    
    await webhook.send({
      text: message,
    });
  } catch (error) {
    // Slack send error handling preserved
    throw error;
  }
}