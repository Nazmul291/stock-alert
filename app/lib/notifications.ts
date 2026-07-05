import nodemailer from 'nodemailer';
import { IncomingWebhook } from '@slack/webhook';
import prisma from '../db.server';
import {
  getLowStockEmailTemplate,
  getOutOfStockEmailTemplate,
  getRestockEmailTemplate,
  getDigestEmailTemplate,
  getBackInStockCustomerTemplate,
  type DigestEmailData,
  type BrandConfig,
} from './email-templates';
import { fireFlowTrigger } from './flow-trigger.server';
import { sendKlaviyoEvent } from './klaviyo.server';

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
  brandLogoUrl?: string | null;
  brandColor?: string | null;
  brandSenderName?: string | null;
  whatsappNotifications?: boolean;
  whatsappPhone?: string | null;
  whatsappPhoneNumberId?: string | null;
  whatsappAccessToken?: string | null;
  klaviyoEnabled?: boolean;
  klaviyoApiKey?: string | null;
}

async function sendWhatsAppMessage(phoneNumberId: string, accessToken: string, to: string, body: string): Promise<void> {
  const phone = to.replace(/\D/g, "");
  const res = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body } }),
  });
  if (!res.ok) {
    const err: any = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `WhatsApp API error ${res.status}`);
  }
}

// Deep-links to the specific variant's admin page when known, matching
// email-templates.ts's productAdminUrl, so Slack/WhatsApp links land on the
// exact variant instead of the product's default one.
function adminProductUrl(shop: string, productId: string, variantId?: string): string {
  const base = `https://${shop}/admin/products/${productId}`;
  return variantId ? `${base}/variants/${variantId}` : base;
}

function fromAddress(settings: SettingsContext): { name: string; address: string } {
  return {
    name: settings.brandSenderName || 'Stock Alert',
    address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org',
  };
}

function toBrand(settings: SettingsContext): BrandConfig {
  return {
    logoUrl: settings.brandLogoUrl,
    color: settings.brandColor,
    senderName: settings.brandSenderName,
  };
}

async function logAlert(
  shop: string,
  productId: string,
  variantId: string,
  productTitle: string,
  variantTitle: string | null | undefined,
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
          variantId: BigInt(variantId),
          productTitle,
          variantTitle,
          alertType,
          quantityAtAlert,
          thresholdTriggered,
          sentToEmail,
          sentToSlack,
        },
      }),
      // Scoped to this one variant — a product-wide updateMany here would
      // stamp every sibling variant row and defeat the per-variant 24h
      // cooldown check in webhooks.inventory.tsx.
      prisma.inventoryTracking.updateMany({
        where: { shop, variantId: BigInt(variantId) },
        data: { lastAlertSentAt: now, lastAlertType: alertType },
      }),
    ]);
  } catch (err) {
    console.error('[Notifications] Failed to log alert:', err);
  }
}

export async function sendLowStockAlert(
  store: StoreContext,
  product: { id: string; title: string; sku?: string | null; imageUrl?: string | null; variantId?: string },
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
    variantId: product.variantId,
    sku: product.sku,
    currentQuantity,
    threshold,
    variantTitle,
    imageUrl: product.imageUrl,
  }, toBrand(settings));

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
            from: fromAddress(settings),
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
            elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Shopify' }, url: adminProductUrl(store.shop, productId, product.variantId) }],
          },
        ],
      });
      sentToSlack = true;
    } catch (err) {
      console.error('[Notifications] Low stock Slack failed:', err);
    }
  }

  if (settings.whatsappNotifications && settings.whatsappPhone && settings.whatsappPhoneNumberId && settings.whatsappAccessToken) {
    try {
      const variantSuffix = variantTitle ? ` (${variantTitle})` : '';
      await sendWhatsAppMessage(
        settings.whatsappPhoneNumberId,
        settings.whatsappAccessToken,
        settings.whatsappPhone,
        `⚠️ Low Stock Alert\n\n${product.title}${variantSuffix} has only *${currentQuantity} units* left (threshold: ${threshold}).\n\n${adminProductUrl(store.shop, productId, product.variantId)}`,
      );
      console.log(`[Notifications] Low stock WhatsApp sent for ${product.title}`);
    } catch (err) {
      console.error('[Notifications] Low stock WhatsApp failed:', err);
    }
  }

  // Flow is its own independent notification channel — fire it regardless of
  // whether email/Slack are configured or succeeded.
  await fireFlowTrigger(store.shop, 'low-stock', {
    product_id: Number(productId),
    'Product title': product.title,
    'SKU': product.sku ?? '',
    'Current quantity': currentQuantity,
    'Threshold': threshold,
  });

  if (settings.klaviyoEnabled && settings.klaviyoApiKey && store.email) {
    await sendKlaviyoEvent(settings.klaviyoApiKey, 'Low Stock Alert', { email: store.email }, {
      product_id: productId,
      product_title: product.title,
      sku: product.sku ?? '',
      current_quantity: currentQuantity,
      threshold,
    });
  }

  if (sentToEmail || sentToSlack) {
    await logAlert(store.shop, productId, product.variantId ?? productId, product.title, variantTitle, 'low_stock', currentQuantity, threshold, sentToEmail, sentToSlack);
  }
}

export async function sendOutOfStockAlert(
  store: StoreContext,
  product: { id: string; title: string; sku?: string | null; imageUrl?: string | null; variantId?: string },
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
    variantId: product.variantId,
    sku: product.sku,
    variantTitle,
    imageUrl: product.imageUrl,
  }, toBrand(settings));

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
            from: fromAddress(settings),
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
            elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Shopify' }, url: adminProductUrl(store.shop, productId, product.variantId) }],
          },
        ],
      });
      sentToSlack = true;
    } catch (err) {
      console.error('[Notifications] Out of stock Slack failed:', err);
    }
  }

  if (settings.whatsappNotifications && settings.whatsappPhone && settings.whatsappPhoneNumberId && settings.whatsappAccessToken) {
    try {
      const variantSuffix = variantTitle ? ` (${variantTitle})` : '';
      await sendWhatsAppMessage(
        settings.whatsappPhoneNumberId,
        settings.whatsappAccessToken,
        settings.whatsappPhone,
        `❌ Out of Stock\n\n${product.title}${variantSuffix} is now *sold out*.\n\n${adminProductUrl(store.shop, productId, product.variantId)}`,
      );
    } catch (err) {
      console.error('[Notifications] Out of stock WhatsApp failed:', err);
    }
  }

  await fireFlowTrigger(store.shop, 'out-of-stock', {
    product_id: Number(productId),
    'Product title': product.title,
    'SKU': product.sku ?? '',
  });

  if (settings.klaviyoEnabled && settings.klaviyoApiKey && store.email) {
    await sendKlaviyoEvent(settings.klaviyoApiKey, 'Out of Stock Alert', { email: store.email }, {
      product_id: productId,
      product_title: product.title,
      sku: product.sku ?? '',
    });
  }

  if (sentToEmail || sentToSlack) {
    await logAlert(store.shop, productId, product.variantId ?? productId, product.title, variantTitle, 'out_of_stock', 0, null, sentToEmail, sentToSlack);
  }
}

export async function sendTestNotification(
  store: StoreContext,
  settings: SettingsContext,
): Promise<{
  email?: { sent: boolean; to?: string; error?: string };
  slack?: { sent: boolean; error?: string };
  whatsapp?: { sent: boolean; error?: string };
  klaviyo?: { sent: boolean; error?: string };
}> {
  const result: {
    email?: { sent: boolean; to?: string; error?: string };
    slack?: { sent: boolean; error?: string };
    whatsapp?: { sent: boolean; error?: string };
    klaviyo?: { sent: boolean; error?: string };
  } = {};
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
            from: fromAddress(settings),
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

  if (settings.whatsappNotifications && settings.whatsappPhone && settings.whatsappPhoneNumberId && settings.whatsappAccessToken) {
    try {
      console.log(`[Notifications] Sending WhatsApp test to ${settings.whatsappPhone} via Phone Number ID ${settings.whatsappPhoneNumberId}`);
      await sendWhatsAppMessage(
        settings.whatsappPhoneNumberId,
        settings.whatsappAccessToken,
        settings.whatsappPhone,
        `✅ Test — Stock Alert is connected for *${storeName}*. You'll receive WhatsApp alerts when inventory thresholds are triggered.`,
      );
      console.log(`[Notifications] WhatsApp test sent OK`);
      result.whatsapp = { sent: true };
    } catch (err) {
      console.error(`[Notifications] WhatsApp test failed:`, err);
      result.whatsapp = { sent: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  } else {
    console.log(`[Notifications] WhatsApp test skipped — enabled:${settings.whatsappNotifications} phone:${!!settings.whatsappPhone} phoneNumberId:${!!settings.whatsappPhoneNumberId} token:${!!settings.whatsappAccessToken}`);
  }

  if (settings.klaviyoEnabled && settings.klaviyoApiKey) {
    if (store.email) {
      const klaviyoResult = await sendKlaviyoEvent(settings.klaviyoApiKey, 'Test Notification', { email: store.email }, {
        message: `Stock Alert is connected for ${storeName}.`,
      });
      result.klaviyo = klaviyoResult.ok ? { sent: true } : { sent: false, error: klaviyoResult.error };
    } else {
      result.klaviyo = { sent: false, error: 'No store email on file to attach the Klaviyo profile to.' };
    }
  }

  return result;
}

export async function sendRestockAlert(
  store: StoreContext,
  product: { id: string; title: string; sku?: string | null; imageUrl?: string | null; variantId?: string },
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
    variantId: product.variantId,
    sku: product.sku,
    currentQuantity,
    variantTitle,
    imageUrl: product.imageUrl,
  }, toBrand(settings));

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
            from: fromAddress(settings),
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
            elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Shopify' }, url: adminProductUrl(store.shop, productId, product.variantId) }],
          },
        ],
      });
      sentToSlack = true;
    } catch (err) {
      console.error('[Notifications] Restock Slack failed:', err);
    }
  }

  if (settings.whatsappNotifications && settings.whatsappPhone && settings.whatsappPhoneNumberId && settings.whatsappAccessToken) {
    try {
      const variantSuffix = variantTitle ? ` (${variantTitle})` : '';
      await sendWhatsAppMessage(
        settings.whatsappPhoneNumberId,
        settings.whatsappAccessToken,
        settings.whatsappPhone,
        `🎉 Back in Stock\n\n${product.title}${variantSuffix} is back with *${currentQuantity} units*.\n\n${adminProductUrl(store.shop, productId, product.variantId)}`,
      );
    } catch (err) {
      console.error('[Notifications] Restock WhatsApp failed:', err);
    }
  }

  await fireFlowTrigger(store.shop, 'restock', {
    product_id: Number(productId),
    'Product title': product.title,
    'SKU': product.sku ?? '',
    'Current quantity': currentQuantity,
  });

  if (settings.klaviyoEnabled && settings.klaviyoApiKey && store.email) {
    await sendKlaviyoEvent(settings.klaviyoApiKey, 'Restock Alert', { email: store.email }, {
      product_id: productId,
      product_title: product.title,
      sku: product.sku ?? '',
      current_quantity: currentQuantity,
    });
  }

  if (sentToEmail || sentToSlack) {
    await logAlert(store.shop, productId, product.variantId ?? productId, product.title, variantTitle, 'restock', currentQuantity, null, sentToEmail, sentToSlack);
  }
}

export async function sendBackInStockNotifications(
  shop: string,
  productId: string,
  productTitle: string,
  shopDomain: string,
  appUrl: string,
  brand: BrandConfig = {},
  productHandle?: string | null,
  klaviyo?: { enabled: boolean; apiKey: string | null },
): Promise<number> {
  const storeName = (brand.senderName) || shopDomain.replace('.myshopify.com', '');
  const productUrl = productHandle
    ? `https://${shopDomain}/products/${productHandle}`
    : undefined;
  const subscribers = await prisma.backInStockSubscriber.findMany({
    where: { shop, productId: BigInt(productId), notifiedAt: null },
    select: { id: true, email: true, firstName: true },
  });

  if (subscribers.length === 0) return 0;

  let sent = 0;
  for (const sub of subscribers) {
    const unsubscribeUrl = `${appUrl}/api/back-in-stock/unsubscribe?id=${sub.id}`;
    const { subject, html } = getBackInStockCustomerTemplate({
      storeName,
      shopDomain,
      productTitle,
      productId,
      productUrl,
      unsubscribeUrl,
      firstName: sub.firstName ?? null,
    }, brand);
    try {
      await transporter.sendMail({
        from: { name: storeName, address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org' },
        to: sub.email,
        subject,
        html,
      });
      await prisma.backInStockSubscriber.update({
        where: { id: sub.id },
        data: { notifiedAt: new Date() },
      });
      sent++;

      // Customer-facing Klaviyo sync — separate from the merchant's own
      // "Restock Alert" event above; this one is keyed to the subscriber's
      // profile so the merchant can build a real marketing flow/campaign
      // off actual shopper back-in-stock signups.
      if (klaviyo?.enabled && klaviyo.apiKey) {
        await sendKlaviyoEvent(klaviyo.apiKey, 'Back in Stock', { email: sub.email, first_name: sub.firstName ?? undefined }, {
          product_id: productId,
          product_title: productTitle,
          product_url: productUrl ?? '',
        });
      }
    } catch (err) {
      console.error(`[Notifications] Back-in-stock email failed to ${sub.email}:`, err);
    }
  }

  console.log(`[Notifications] Back-in-stock: notified ${sent}/${subscribers.length} subscribers for ${productTitle} (${shop})`);
  return sent;
}

export async function sendDigestEmail(shop: string, recipients: string[], data: DigestEmailData, brand: BrandConfig = {}): Promise<void> {
  const { subject, html } = getDigestEmailTemplate(data, brand);
  const senderName = brand.senderName || 'Stock Alert';
  for (const recipient of recipients) {
    try {
      await transporter.sendMail({
        from: { name: senderName, address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org' },
        to: recipient,
        subject,
        html,
      });
      console.log(`[Notifications] Digest sent to ${recipient} for ${shop}`);
    } catch (err) {
      console.error(`[Notifications] Digest failed to ${recipient} for ${shop}:`, err);
    }
  }
}
