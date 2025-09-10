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
    
    console.log('Slack notification sent successfully');
  } catch (error) {
    console.error('Slack send error:', error);
    throw error;
  }
}