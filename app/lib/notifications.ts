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
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
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
  try {
    await prisma.alertHistory.create({
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
    });
  } catch (err) {
    console.error('[Notifications] Failed to log alert:', err);
  }
}

export async function sendLowStockAlert(
  store: StoreContext,
  product: { id: string; title: string; sku?: string | null },
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
  });

  if (settings.emailNotifications) {
    const toEmail = settings.notificationEmail || store.email;
    if (toEmail) {
      try {
        await transporter.sendMail({
          from: { name: 'Stock Alert', address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org' },
          to: toEmail,
          subject: template.subject,
          html: template.html,
        });
        await logAlert(store.shop, productId, product.title, 'low_stock', currentQuantity, threshold, toEmail, false);
      } catch (err) {
        console.error('[Notifications] Low stock email failed:', err);
      }
    }
  }

  if (settings.slackNotifications && store.plan === 'pro' && settings.slackWebhookUrl) {
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
      await logAlert(store.shop, productId, product.title, 'low_stock', currentQuantity, threshold, null, true);
    } catch (err) {
      console.error('[Notifications] Low stock Slack failed:', err);
    }
  }
}

export async function sendOutOfStockAlert(
  store: StoreContext,
  product: { id: string; title: string; sku?: string | null },
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
  });

  if (settings.emailNotifications) {
    const toEmail = settings.notificationEmail || store.email;
    if (toEmail) {
      try {
        await transporter.sendMail({
          from: { name: 'Stock Alert', address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org' },
          to: toEmail,
          subject: template.subject,
          html: template.html,
        });
        await logAlert(store.shop, productId, product.title, 'out_of_stock', 0, null, toEmail, false);
      } catch (err) {
        console.error('[Notifications] Out of stock email failed:', err);
      }
    }
  }

  if (settings.slackNotifications && store.plan === 'pro' && settings.slackWebhookUrl) {
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
      await logAlert(store.shop, productId, product.title, 'out_of_stock', 0, null, null, true);
    } catch (err) {
      console.error('[Notifications] Out of stock Slack failed:', err);
    }
  }
}

export async function sendRestockAlert(
  store: StoreContext,
  product: { id: string; title: string; sku?: string | null },
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
  });

  if (settings.emailNotifications) {
    const toEmail = settings.notificationEmail || store.email;
    if (toEmail) {
      try {
        await transporter.sendMail({
          from: { name: 'Stock Alert', address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org' },
          to: toEmail,
          subject: template.subject,
          html: template.html,
        });
        await logAlert(store.shop, productId, product.title, 'restock', currentQuantity, null, toEmail, false);
      } catch (err) {
        console.error('[Notifications] Restock email failed:', err);
      }
    }
  }

  if (settings.slackNotifications && store.plan === 'pro' && settings.slackWebhookUrl) {
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
      await logAlert(store.shop, productId, product.title, 'restock', currentQuantity, null, null, true);
    } catch (err) {
      console.error('[Notifications] Restock Slack failed:', err);
    }
  }
}
