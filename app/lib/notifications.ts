import nodemailer from 'nodemailer';
import { IncomingWebhook } from '@slack/webhook';
import prisma from '../db.server';
import {
  getLowStockEmailTemplate,
  getOutOfStockEmailTemplate,
  getRestockEmailTemplate,
} from './email-templates';

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '465'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

interface StoreContext {
  shop: string;
  plan: string | null;
  email: string | null;
}

interface SettingsContext {
  emailNotifications: boolean;
  slackNotifications: boolean;
  notificationEmail: string | null;
  slackWebhookUrl: string | null;
}

async function logAlert(
  shop: string,
  productId: string,
  productTitle: string,
  alertType: 'low_stock' | 'out_of_stock' | 'restock',
  quantityAtAlert: number | null,
  thresholdTriggered: number | null,
  sentToEmail: string | null,
  sentToSlack: boolean,
) {
  const now = new Date();
  try {
    await prisma.$transaction([
      prisma.alertHistory.create({
        data: {
          shop,
          productId: BigInt(productId),
          productTitle,
          alertType,
          quantityAtAlert,
          thresholdTriggered,
          sentToEmail,
          sentToSlack,
        },
      }),
      prisma.inventoryTracking.updateMany({
        where: { shop, productId: BigInt(productId) },
        data: { lastAlertSentAt: now, lastAlertType: alertType },
      }),
    ]);
  } catch (err) {
    console.error('[Notifications] Failed to log alert:', err);
  }
}

export async function sendLowStockAlert(
  store: StoreContext,
  product: { id: string; title: string; sku?: string | null; imageUrl?: string | null },
  currentQuantity: number,
  threshold: number,
  settings: SettingsContext,
  variantTitle?: string | null,
) {
  const productId = product.id.includes('/') ? product.id.split('/').pop()! : product.id;
  const storeName = store.shop.replace('.myshopify.com', '');
  const template = getLowStockEmailTemplate({
    storeName,
    shopDomain: store.shop,
    productTitle: product.title,
    productId,
    sku: product.sku,
    currentQuantity,
    threshold,
    variantTitle,
    imageUrl: product.imageUrl,
  });

  let sentToEmail: string | null = null;
  let sentToSlack = false;

  if (settings.emailNotifications) {
    const rawEmail = settings.notificationEmail || store.email;
    if (rawEmail) {
      const recipients = rawEmail.split(",").map((e) => e.trim()).filter(Boolean);
      const succeeded: string[] = [];
      for (const recipient of recipients) {
        console.log(`[Notifications] Sending low stock email to ${recipient} for product ${product.title}`);
        try {
          await transporter.sendMail({
            from: { name: 'Stock Alert', address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org' },
            to: recipient,
            subject: template.subject,
            html: template.html,
          });
          console.log(`[Notifications] Low stock email sent OK to ${recipient}`);
          succeeded.push(recipient);
        } catch (err) {
          console.error(`[Notifications] Low stock email failed to ${recipient}:`, err);
        }
      }
      if (succeeded.length > 0) sentToEmail = succeeded.join(", ");
    } else {
      console.warn(`[Notifications] Low stock alert skipped — no recipient email set for ${store.shop}. Set a notification email in Settings.`);
    }
  } else {
    console.log(`[Notifications] Email notifications disabled for ${store.shop} — skipping low stock email`);
  }

  if (settings.slackNotifications && settings.slackWebhookUrl) {
    try {
      const webhook = new IncomingWebhook(settings.slackWebhookUrl);
      await webhook.send({
        text: `⚠️ Low Stock: ${product.title} (${currentQuantity} remaining) — ${store.shop}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '⚠️ Low Stock Alert' } },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Product:*\n${product.title}` },
              { type: 'mrkdwn', text: `*Current Stock:*\n${currentQuantity} units` },
              { type: 'mrkdwn', text: `*Threshold:*\n${threshold} units` },
              { type: 'mrkdwn', text: `*Store:*\n${storeName}` },
            ],
          },
          {
            type: 'actions',
            elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Shopify' }, url: `https://${store.shop}/admin/products/${productId}` }],
          },
        ],
      });
      sentToSlack = true;
    } catch (err) {
      console.error('[Notifications] Low stock Slack failed:', err);
    }
  }

  if (sentToEmail || sentToSlack) {
    await logAlert(store.shop, productId, product.title, 'low_stock', currentQuantity, threshold, sentToEmail, sentToSlack);
  }
}

export async function sendOutOfStockAlert(
  store: StoreContext,
  product: { id: string; title: string; sku?: string | null; imageUrl?: string | null },
  settings: SettingsContext,
  variantTitle?: string | null,
) {
  const productId = product.id.includes('/') ? product.id.split('/').pop()! : product.id;
  const storeName = store.shop.replace('.myshopify.com', '');
  const template = getOutOfStockEmailTemplate({
    storeName,
    shopDomain: store.shop,
    productTitle: product.title,
    productId,
    sku: product.sku,
    variantTitle,
    imageUrl: product.imageUrl,
  });

  let sentToEmail: string | null = null;
  let sentToSlack = false;

  if (settings.emailNotifications) {
    const rawEmail = settings.notificationEmail || store.email;
    if (rawEmail) {
      const recipients = rawEmail.split(",").map((e) => e.trim()).filter(Boolean);
      const succeeded: string[] = [];
      for (const recipient of recipients) {
        try {
          await transporter.sendMail({
            from: { name: 'Stock Alert', address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org' },
            to: recipient,
            subject: template.subject,
            html: template.html,
          });
          succeeded.push(recipient);
        } catch (err) {
          console.error(`[Notifications] Out of stock email failed to ${recipient}:`, err);
        }
      }
      if (succeeded.length > 0) sentToEmail = succeeded.join(", ");
    }
  }

  if (settings.slackNotifications && settings.slackWebhookUrl) {
    try {
      const webhook = new IncomingWebhook(settings.slackWebhookUrl);
      await webhook.send({
        text: `❌ Out of Stock: ${product.title} — ${store.shop}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '❌ Out of Stock Alert' } },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Product:*\n${product.title}` },
              { type: 'mrkdwn', text: `*Status:*\n⚠️ Sold Out` },
              { type: 'mrkdwn', text: `*Store:*\n${storeName}` },
            ],
          },
          {
            type: 'actions',
            elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Shopify' }, url: `https://${store.shop}/admin/products/${productId}` }],
          },
        ],
      });
      sentToSlack = true;
    } catch (err) {
      console.error('[Notifications] Out of stock Slack failed:', err);
    }
  }

  if (sentToEmail || sentToSlack) {
    await logAlert(store.shop, productId, product.title, 'out_of_stock', 0, null, sentToEmail, sentToSlack);
  }
}

export async function sendTestNotification(
  store: StoreContext,
  settings: SettingsContext,
): Promise<{ email?: { sent: boolean; to?: string; error?: string }; slack?: { sent: boolean; error?: string } }> {
  const result: { email?: { sent: boolean; to?: string; error?: string }; slack?: { sent: boolean; error?: string } } = {};
  const storeName = store.shop.replace('.myshopify.com', '');

  if (settings.emailNotifications) {
    const rawEmail = settings.notificationEmail || store.email;
    if (rawEmail) {
      const recipients = rawEmail.split(',').map((e) => e.trim()).filter(Boolean);
      const succeeded: string[] = [];
      const failed: string[] = [];
      for (const recipient of recipients) {
        try {
          await transporter.sendMail({
            from: { name: 'Stock Alert', address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org' },
            to: recipient,
            subject: `[Test] Stock Alert is connected — ${storeName}`,
            html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;">
                <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:24px;border-radius:8px 8px 0 0;text-align:center;color:#fff;font-size:20px;font-weight:700;">
                  Stock Alert — Test Notification
                </div>
                <div style="padding:28px 24px;border:1px solid #e5e7eb;border-top:0;border-radius:0 0 8px 8px;">
                  <p style="margin:0 0 12px;font-size:15px;color:#111827;">Your email notifications are working correctly.</p>
                  <p style="margin:0;font-size:14px;color:#6b7280;">
                    Real alerts will be sent to <strong>${recipient}</strong> when inventory thresholds are triggered for <strong>${storeName}</strong>.
                  </p>
                </div>
              </div>`,
          });
          succeeded.push(recipient);
        } catch (err) {
          failed.push(recipient);
        }
      }
      if (succeeded.length > 0) {
        result.email = { sent: true, to: succeeded.join(', ') };
      } else {
        result.email = { sent: false, error: `Failed to send to: ${failed.join(', ')}` };
      }
    } else {
      result.email = { sent: false, error: 'No recipient email configured. Add a notification email in Settings.' };
    }
  }

  if (settings.slackNotifications && settings.slackWebhookUrl) {
    try {
      const webhook = new IncomingWebhook(settings.slackWebhookUrl);
      await webhook.send({
        text: `[Test] Stock Alert is connected — ${storeName}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: 'Stock Alert — Test Notification' } },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Your Slack notifications are working correctly.\nReal alerts for *${storeName}* will appear in this channel when inventory thresholds are triggered.`,
            },
          },
        ],
      });
      result.slack = { sent: true };
    } catch (err) {
      result.slack = { sent: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }

  return result;
}

export async function sendRestockAlert(
  store: StoreContext,
  product: { id: string; title: string; sku?: string | null; imageUrl?: string | null },
  currentQuantity: number,
  settings: SettingsContext,
  variantTitle?: string | null,
) {
  const productId = product.id.includes('/') ? product.id.split('/').pop()! : product.id;
  const storeName = store.shop.replace('.myshopify.com', '');
  const template = getRestockEmailTemplate({
    storeName,
    shopDomain: store.shop,
    productTitle: product.title,
    productId,
    sku: product.sku,
    currentQuantity,
    variantTitle,
    imageUrl: product.imageUrl,
  });

  let sentToEmail: string | null = null;
  let sentToSlack = false;

  if (settings.emailNotifications) {
    const rawEmail = settings.notificationEmail || store.email;
    if (rawEmail) {
      const recipients = rawEmail.split(",").map((e) => e.trim()).filter(Boolean);
      const succeeded: string[] = [];
      for (const recipient of recipients) {
        try {
          await transporter.sendMail({
            from: { name: 'Stock Alert', address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org' },
            to: recipient,
            subject: template.subject,
            html: template.html,
          });
          succeeded.push(recipient);
        } catch (err) {
          console.error(`[Notifications] Restock email failed to ${recipient}:`, err);
        }
      }
      if (succeeded.length > 0) sentToEmail = succeeded.join(", ");
    }
  }

  if (settings.slackNotifications && settings.slackWebhookUrl) {
    try {
      const webhook = new IncomingWebhook(settings.slackWebhookUrl);
      await webhook.send({
        text: `🎉 Back in Stock: ${product.title} (${currentQuantity} units) — ${store.shop}`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: '🎉 Back in Stock' } },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Product:*\n${product.title}` },
              { type: 'mrkdwn', text: `*Current Stock:*\n${currentQuantity} units` },
              { type: 'mrkdwn', text: `*Store:*\n${storeName}` },
            ],
          },
          {
            type: 'actions',
            elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Shopify' }, url: `https://${store.shop}/admin/products/${productId}` }],
          },
        ],
      });
      sentToSlack = true;
    } catch (err) {
      console.error('[Notifications] Restock Slack failed:', err);
    }
  }

  if (sentToEmail || sentToSlack) {
    await logAlert(store.shop, productId, product.title, 'restock', currentQuantity, null, sentToEmail, sentToSlack);
  }
}
