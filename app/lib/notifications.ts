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
import { sendWhatsAppTemplate } from './whatsapp.server';
import { publishEvent } from './broadcast.server';
import { getValidAsanaAccessToken, createAsanaTask, createAsanaSubtask, AsanaApiError } from './asana.server';

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
  whatsappPhoneVerified?: boolean;
  klaviyoEnabled?: boolean;
  klaviyoApiKey?: string | null;
  asanaEnabled?: boolean;
  asanaAccessToken?: string | null;
  asanaWorkspaceGid?: string | null;
}

const ASANA_EVENT_LABELS: Record<'low_stock' | 'out_of_stock' | 'restock', string> = {
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock',
  restock: 'Restock',
};

// Sentinel stored in currentTaskGid while a parent task is being created in
// Asana, so concurrent events for the same shop/eventType can tell "no
// parent yet" apart from "someone's already creating one" (see
// claimAsanaParentTask below). Never a real Asana gid (those are numeric).
const ASANA_PENDING_TASK_GID = '__pending__';
const ASANA_PENDING_STALE_MS = 15_000;

// Atomically claims the right to create today's (or the lifetime) parent
// task for a shop/eventType, so a burst of near-simultaneous events (e.g.
// several products going low-stock in the same sync) can't each read
// currentTaskGid as null and each create their own parent task. The
// conditional updateMany acts as a compare-and-swap: only one concurrent
// caller's WHERE clause can match, since the winner's write immediately
// makes every other caller's WHERE clause stop matching.
async function claimAsanaParentTask(
  shop: string,
  eventType: 'low_stock' | 'out_of_stock' | 'restock',
  mode: 'daily' | 'lifetime',
  today: string,
): Promise<boolean> {
  const staleCutoff = new Date(Date.now() - ASANA_PENDING_STALE_MS);
  const result = await prisma.asanaEventMapping.updateMany({
    where: {
      shop,
      eventType,
      OR: [
        { currentTaskGid: null },
        ...(mode === 'daily' ? [{ currentTaskDate: { not: today } }] : []),
        // Recover if a previous claimant crashed before finishing creation.
        { currentTaskGid: ASANA_PENDING_TASK_GID, updatedAt: { lt: staleCutoff } },
      ],
    },
    data: { currentTaskGid: ASANA_PENDING_TASK_GID, currentTaskDate: mode === 'daily' ? today : null },
  });
  return result.count === 1;
}

// Resolves the shared parent task's gid for "daily"/"lifetime" modes,
// creating it in Asana exactly once even under concurrent callers.
async function getOrCreateAsanaParentTask(
  shop: string,
  eventType: 'low_stock' | 'out_of_stock' | 'restock',
  mode: 'daily' | 'lifetime',
  projectGid: string,
  sectionGid: string | null,
  accessToken: string,
  workspaceGid: string,
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10); // UTC "YYYY-MM-DD"
  const parentName = mode === 'daily'
    ? `${ASANA_EVENT_LABELS[eventType]} - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
    : ASANA_EVENT_LABELS[eventType];

  for (let round = 0; round < 3; round++) {
    const won = await claimAsanaParentTask(shop, eventType, mode, today);
    if (won) {
      try {
        const gid = await createAsanaTask(accessToken, workspaceGid, projectGid, sectionGid, parentName, '');
        await prisma.asanaEventMapping.update({ where: { shop_eventType: { shop, eventType } }, data: { currentTaskGid: gid } });
        return gid;
      } catch (err) {
        // Creation failed — release the claim so the next event can retry
        // instead of being stuck on the pending sentinel forever.
        await prisma.asanaEventMapping.updateMany({
          where: { shop, eventType, currentTaskGid: ASANA_PENDING_TASK_GID },
          data: { currentTaskGid: null, currentTaskDate: null },
        });
        throw err;
      }
    }

    // Someone else is creating it (or already has) — poll briefly for the gid.
    for (let attempt = 0; attempt < 15; attempt++) {
      const row = await prisma.asanaEventMapping.findUnique({ where: { shop_eventType: { shop, eventType } } });
      if (row?.currentTaskGid && row.currentTaskGid !== ASANA_PENDING_TASK_GID) {
        if (mode !== 'daily' || row.currentTaskDate === today) return row.currentTaskGid;
        break; // stale daily task from a previous day — fall through to reclaim
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  throw new Error(`[Asana] Timed out waiting for parent task (shop=${shop}, eventType=${eventType})`);
}

// Looked up directly (matches the existing direct-Prisma convention already
// used in this file — see logAlert's $transaction and
// sendBackInStockNotifications' subscriber lookup below) rather than being
// threaded through SettingsContext, since mappings are per-event, not a flat
// setting. Never throws — a missing/failed mapping just means no task, same
// contract as every other channel here.
//
// taskMode controls how the event lands in Asana:
//  - "multi_task" (default): a standalone task per event, same as always.
//  - "daily": one task per calendar day (UTC) named "<Label> - <date>", with
//    each event appended as a subtask.
//  - "lifetime": one task ever, named "<Label>" (no date), reused forever
//    with each event appended as a subtask.
async function createAsanaTaskForEvent(
  shop: string,
  eventType: 'low_stock' | 'out_of_stock' | 'restock',
  workspaceGid: string,
  name: string,
  notes: string,
): Promise<void> {
  const mapping = await prisma.asanaEventMapping.findUnique({ where: { shop_eventType: { shop, eventType } } });
  if (!mapping) return;

  const accessToken = await getValidAsanaAccessToken(shop);
  if (!accessToken) return;

  if (mapping.taskMode !== 'daily' && mapping.taskMode !== 'lifetime') {
    await createAsanaTask(accessToken, workspaceGid, mapping.projectGid, mapping.sectionGid, name, notes);
    return;
  }
  const mode = mapping.taskMode;

  let parentTaskGid = await getOrCreateAsanaParentTask(shop, eventType, mode, mapping.projectGid, mapping.sectionGid, accessToken, workspaceGid);

  try {
    await createAsanaSubtask(accessToken, parentTaskGid, name, notes);
  } catch (err) {
    // The merchant may have deleted/archived the parent task in Asana out
    // from under us — reset the mapping and recreate it once rather than
    // silently failing every event until someone notices.
    if (!(err instanceof AsanaApiError) || err.status !== 404) throw err;
    await prisma.asanaEventMapping.updateMany({
      where: { shop, eventType, currentTaskGid: parentTaskGid },
      data: { currentTaskGid: null, currentTaskDate: null },
    });
    parentTaskGid = await getOrCreateAsanaParentTask(shop, eventType, mode, mapping.projectGid, mapping.sectionGid, accessToken, workspaceGid);
    await createAsanaSubtask(accessToken, parentTaskGid, name, notes);
  }
}

// Stock alerts are proactive/business-initiated, so WhatsApp requires sending
// through a pre-approved Message Template rather than free text (free text
// only works within 24h of the recipient messaging first). "stock_alert" is
// created once, manually, on Stock Alert's own shared WhatsApp Business
// number — see app/lib/whatsapp.server.ts. Its single BODY component takes 3
// params: title line, detail line, url — same three pieces of content every
// call site below already builds.
function sendWhatsAppMessage(to: string, titleLine: string, detailLine: string, url: string): Promise<void> {
  return sendWhatsAppTemplate(to, "stock_alert", [titleLine, detailLine, url]);
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
    publishEvent(shop, ['alerts', 'dashboard', 'analytics']).catch(() => {});
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

  if (settings.whatsappNotifications && settings.whatsappPhoneVerified && settings.whatsappPhone) {
    try {
      const variantSuffix = variantTitle ? ` (${variantTitle})` : '';
      await sendWhatsAppMessage(
        settings.whatsappPhone,
        '⚠️ Low Stock Alert',
        `${product.title}${variantSuffix} has only ${currentQuantity} units left (threshold: ${threshold}).`,
        adminProductUrl(store.shop, productId, product.variantId),
      );
      console.log(`[Notifications] Low stock WhatsApp sent for ${product.title}`);
    } catch (err) {
      console.error('[Notifications] Low stock WhatsApp failed:', err);
    }
  }

  if (settings.asanaEnabled && settings.asanaAccessToken && settings.asanaWorkspaceGid) {
    try {
      const variantSuffix = variantTitle ? ` (${variantTitle})` : '';
      await createAsanaTaskForEvent(
        store.shop,
        'low_stock',
        settings.asanaWorkspaceGid,
        `Low Stock: ${product.title}${variantSuffix}`,
        `Only ${currentQuantity} units left (threshold: ${threshold}).\n\n${adminProductUrl(store.shop, productId, product.variantId)}`,
      );
    } catch (err) {
      console.error('[Notifications] Low stock Asana task failed:', err);
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

  if (settings.whatsappNotifications && settings.whatsappPhoneVerified && settings.whatsappPhone) {
    try {
      const variantSuffix = variantTitle ? ` (${variantTitle})` : '';
      await sendWhatsAppMessage(
        settings.whatsappPhone,
        '❌ Out of Stock',
        `${product.title}${variantSuffix} is now sold out.`,
        adminProductUrl(store.shop, productId, product.variantId),
      );
    } catch (err) {
      console.error('[Notifications] Out of stock WhatsApp failed:', err);
    }
  }

  if (settings.asanaEnabled && settings.asanaAccessToken && settings.asanaWorkspaceGid) {
    try {
      const variantSuffix = variantTitle ? ` (${variantTitle})` : '';
      await createAsanaTaskForEvent(
        store.shop,
        'out_of_stock',
        settings.asanaWorkspaceGid,
        `Out of Stock: ${product.title}${variantSuffix}`,
        `This product is now sold out.\n\n${adminProductUrl(store.shop, productId, product.variantId)}`,
      );
    } catch (err) {
      console.error('[Notifications] Out of stock Asana task failed:', err);
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

  if (settings.whatsappNotifications && settings.whatsappPhoneVerified && settings.whatsappPhone) {
    try {
      console.log(`[Notifications] Sending WhatsApp test to ${settings.whatsappPhone}`);
      await sendWhatsAppMessage(
        settings.whatsappPhone,
        '✅ Test Notification',
        `Stock Alert is connected for ${storeName}. You'll receive WhatsApp alerts when inventory thresholds are triggered.`,
        `https://${store.shop}/admin`,
      );
      console.log(`[Notifications] WhatsApp test sent OK`);
      result.whatsapp = { sent: true };
    } catch (err) {
      console.error(`[Notifications] WhatsApp test failed:`, err);
      result.whatsapp = { sent: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  } else {
    console.log(`[Notifications] WhatsApp test skipped — enabled:${settings.whatsappNotifications} phone:${!!settings.whatsappPhone} verified:${!!settings.whatsappPhoneVerified}`);
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

  if (settings.whatsappNotifications && settings.whatsappPhoneVerified && settings.whatsappPhone) {
    try {
      const variantSuffix = variantTitle ? ` (${variantTitle})` : '';
      await sendWhatsAppMessage(
        settings.whatsappPhone,
        '🎉 Back in Stock',
        `${product.title}${variantSuffix} is back with ${currentQuantity} units.`,
        adminProductUrl(store.shop, productId, product.variantId),
      );
    } catch (err) {
      console.error('[Notifications] Restock WhatsApp failed:', err);
    }
  }

  if (settings.asanaEnabled && settings.asanaAccessToken && settings.asanaWorkspaceGid) {
    try {
      const variantSuffix = variantTitle ? ` (${variantTitle})` : '';
      await createAsanaTaskForEvent(
        store.shop,
        'restock',
        settings.asanaWorkspaceGid,
        `Restock: ${product.title}${variantSuffix}`,
        `Back in stock with ${currentQuantity} units.\n\n${adminProductUrl(store.shop, productId, product.variantId)}`,
      );
    } catch (err) {
      console.error('[Notifications] Restock Asana task failed:', err);
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
  if (sent > 0) publishEvent(shop, ['back-in-stock']).catch(() => {});
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
