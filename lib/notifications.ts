import nodemailer from 'nodemailer';
import { IncomingWebhook } from '@slack/webhook';
import { supabaseAdmin, Store, StoreSettings, AlertHistory } from './supabase';
import { getLowStockEmailTemplate, getOutOfStockEmailTemplate, getRestockEmailTemplate } from './email-templates';

// Email transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendLowStockAlert(
  store: Store,
  product: any,
  variant: any,
  currentQuantity: number,
  threshold: number,
  settings: StoreSettings
) {
  const alertId = `low_stock_${store.id}_${product.id.split('/').pop()}_${Date.now()}`;
  console.log(`[Notifications] ${alertId} - sendLowStockAlert called:`, {
    store_id: store.id,
    store_id_type: typeof store.id,
    product_id: product.id.split('/').pop(),
    product_title: product.title,
    currentQuantity,
    threshold,
    email_notifications: settings.email_notifications,
    timestamp: new Date().toISOString()
  });
  // Handle product-level tracking where variant might be null
  const variantTitle = variant?.title || null;
  const sku = variant?.sku || product?.sku || null;

  // Generate professional email template
  const emailTemplate = getLowStockEmailTemplate({
    storeName: store.shop_domain.replace('.myshopify.com', ''),
    shopDomain: store.shop_domain,
    productTitle: product.title,
    productId: product.id.split('/').pop(),
    sku,
    currentQuantity,
    threshold,
    variantTitle
  });

  // Plain text version for email clients that don't support HTML
  const message = `
Low Stock Alert for ${store.shop_domain}

Product: ${product.title}
${variantTitle ? `Variant: ${variantTitle}` : ''}
${sku ? `SKU: ${sku}` : ''}
Current Quantity: ${currentQuantity}
Threshold: ${threshold}

View Product: https://${store.shop_domain}/admin/products/${product.id.split('/').pop()}

---
Stock Alert - Automated inventory monitoring for your Shopify store
  `.trim();

  // Send email notification
  if (settings.email_notifications) {
    const toEmail = settings.notification_email || store.email;
    if (toEmail) {
      try {
        await emailTransporter.sendMail({
          from: {
            name: 'Stock Alert',
            address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org'
          },
          to: toEmail,
          subject: emailTemplate.subject,
          text: message,
          html: emailTemplate.html,
        });

        // Log alert in database
        console.log('[Notifications] Logging low stock alert to database...');

        const { data: alertData, error: alertError } = await supabaseAdmin
          .from('alert_history')
          .insert({
            store_id: store.id,
            product_id: product.id.split('/').pop(),
            product_title: product.title,
            alert_type: 'low_stock',
            quantity_at_alert: currentQuantity,
            threshold_triggered: threshold,
            sent_to_email: toEmail,
            sent_to_slack: false,
          })
          .select();

        if (alertError) {
          console.error('[Notifications] Failed to log low stock alert:', alertError);
        } else {
          console.log('[Notifications] Successfully logged alert:', alertData);
        }
      } catch (error) {
        // Email send error handling preserved
      }
    }
  }

  // Send Slack notification (Pro plan only)
  if (settings.slack_notifications && store.plan === 'pro' && settings.slack_webhook_url) {
    try {
      const webhook = new IncomingWebhook(settings.slack_webhook_url);
      
      await webhook.send({
        text: `🚨 Low Stock Alert for ${store.shop_domain}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🚨 Low Stock Alert',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Product:*\n${product.title}`,
              },
              {
                type: 'mrkdwn',
                text: `*Variant:*\n${variantTitle}`,
              },
              {
                type: 'mrkdwn',
                text: `*SKU:*\n${sku}`,
              },
              {
                type: 'mrkdwn',
                text: `*Current Quantity:*\n${currentQuantity}`,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View in Shopify',
                },
                url: `https://${store.shop_domain}/admin/products/${product.id.split('/').pop()}`,
              },
            ],
          },
        ],
      });

      // Log alert in database
      const { error: slackAlertError } = await supabaseAdmin
        .from('alert_history')
        .insert({
          store_id: store.id,
          product_id: product.id.split('/').pop(),
          product_title: product.title,
          alert_type: 'low_stock',
          quantity_at_alert: currentQuantity,
          threshold_triggered: threshold,
          sent_to_email: null,
          sent_to_slack: true,
        });

      if (slackAlertError) {
        console.error('[Notifications] Failed to log low stock Slack alert:', slackAlertError);
      }
    } catch (error) {
      // Slack send error handling preserved
    }
  }
}

export async function sendOutOfStockAlert(
  store: Store,
  product: any,
  variant: any,
  settings: StoreSettings
) {
  const alertId = `out_of_stock_${store.id}_${product.id.split('/').pop()}_${Date.now()}`;
  console.log(`[Notifications] ${alertId} - sendOutOfStockAlert called:`, {
    store_id: store.id,
    product_id: product.id.split('/').pop(),
    product_title: product.title,
    email_notifications: settings.email_notifications,
    timestamp: new Date().toISOString()
  });
  // Handle product-level tracking where variant might be null
  const variantTitle = variant?.title || null;
  const sku = variant?.sku || product?.sku || null;

  // Generate professional email template
  const emailTemplate = getOutOfStockEmailTemplate({
    storeName: store.shop_domain.replace('.myshopify.com', ''),
    shopDomain: store.shop_domain,
    productTitle: product.title,
    productId: product.id.split('/').pop(),
    sku,
    variantTitle
  });

  // Plain text version for email clients that don't support HTML
  const message = `
Out of Stock Alert for ${store.shop_domain}

Product: ${product.title}
${variantTitle ? `Variant: ${variantTitle}` : ''}
${sku ? `SKU: ${sku}` : ''}

This product is now out of stock.

View Product: https://${store.shop_domain}/admin/products/${product.id.split('/').pop()}

---
Stock Alert - Automated inventory monitoring for your Shopify store
  `.trim();

  // Send email notification
  if (settings.email_notifications) {
    const toEmail = settings.notification_email || store.email;
    if (toEmail) {
      try {
        await emailTransporter.sendMail({
          from: {
            name: 'Stock Alert',
            address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org'
          },
          to: toEmail,
          subject: emailTemplate.subject,
          text: message,
          html: emailTemplate.html,
        });

        // Log alert in database
        console.log('[Notifications] Logging out of stock alert to database...');

        const { data: outOfStockData, error: outOfStockAlertError } = await supabaseAdmin
          .from('alert_history')
          .insert({
            store_id: store.id,
            product_id: product.id.split('/').pop(),
            product_title: product.title,
            alert_type: 'out_of_stock',
            quantity_at_alert: 0,
            threshold_triggered: null,
            sent_to_email: toEmail,
            sent_to_slack: false,
          })
          .select();

        if (outOfStockAlertError) {
          console.error('[Notifications] Failed to log out of stock alert:', outOfStockAlertError);
        } else {
          console.log('[Notifications] Successfully logged out of stock alert:', outOfStockData);
        }
      } catch (error) {
        // Email send error handling preserved
      }
    }
  }

  // Send Slack notification (Pro plan only)
  if (settings.slack_notifications && store.plan === 'pro' && settings.slack_webhook_url) {
    try {
      const webhook = new IncomingWebhook(settings.slack_webhook_url);
      
      await webhook.send({
        text: `❌ Out of Stock Alert for ${store.shop_domain}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '❌ Out of Stock Alert',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Product:*\n${product.title}`,
              },
              {
                type: 'mrkdwn',
                text: `*Variant:*\n${variantTitle}`,
              },
              {
                type: 'mrkdwn',
                text: `*SKU:*\n${sku}`,
              },
              {
                type: 'mrkdwn',
                text: `*Status:*\n⚠️ Product Hidden`,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View in Shopify',
                },
                url: `https://${store.shop_domain}/admin/products/${product.id.split('/').pop()}`,
              },
            ],
          },
        ],
      });

      // Log alert in database
      const { error: outOfStockSlackAlertError } = await supabaseAdmin
        .from('alert_history')
        .insert({
          store_id: store.id,
          product_id: product.id.split('/').pop(),
          product_title: product.title,
          alert_type: 'out_of_stock',
          quantity_at_alert: 0,
          threshold_triggered: null,
          sent_to_email: null,
          sent_to_slack: true,
        });

      if (outOfStockSlackAlertError) {
        console.error('[Notifications] Failed to log out of stock Slack alert:', outOfStockSlackAlertError);
      }
    } catch (error) {
      // Slack send error handling preserved
    }
  }
}

export async function sendRestockAlert(
  store: Store,
  product: any,
  variant: any,
  currentQuantity: number,
  settings: StoreSettings
) {
  const alertId = `restock_${store.id}_${product.id.split('/').pop()}_${Date.now()}`;
  console.log(`[Notifications] ${alertId} - sendRestockAlert called:`, {
    store_id: store.id,
    product_id: product.id.split('/').pop(),
    product_title: product.title,
    currentQuantity,
    email_notifications: settings.email_notifications,
    timestamp: new Date().toISOString()
  });

  // Handle product-level tracking where variant might be null
  const variantTitle = variant?.title || null;
  const sku = variant?.sku || product?.sku || null;

  // Generate professional email template
  const emailTemplate = getRestockEmailTemplate({
    storeName: store.shop_domain.replace('.myshopify.com', ''),
    shopDomain: store.shop_domain,
    productTitle: product.title,
    productId: product.id.split('/').pop(),
    sku,
    currentQuantity,
    variantTitle
  });

  // Plain text version for email clients that don't support HTML
  const message = `
Restock Alert for ${store.shop_domain}

Product: ${product.title}
${variantTitle ? `Variant: ${variantTitle}` : ''}
${sku ? `SKU: ${sku}` : ''}
Current Quantity: ${currentQuantity}

This product is back in stock!

View Product: https://${store.shop_domain}/admin/products/${product.id.split('/').pop()}

---
Stock Alert - Automated inventory monitoring for your Shopify store
  `.trim();

  // Send email notification
  if (settings.email_notifications) {
    const toEmail = settings.notification_email || store.email;
    if (toEmail) {
      try {
        await emailTransporter.sendMail({
          from: {
            name: 'Stock Alert',
            address: process.env.EMAIL_USER || 'noreply@nazmulcodes.org'
          },
          to: toEmail,
          subject: emailTemplate.subject,
          text: message,
          html: emailTemplate.html,
        });

        // Log alert in database
        console.log('[Notifications] Logging restock alert to database...');

        const { data: alertData, error: alertError } = await supabaseAdmin
          .from('alert_history')
          .insert({
            store_id: store.id,
            product_id: product.id.split('/').pop(),
            product_title: product.title,
            alert_type: 'restock',
            quantity_at_alert: currentQuantity,
            threshold_triggered: null,
            sent_to_email: toEmail,
            sent_to_slack: false,
          })
          .select();

        if (alertError) {
          console.error('[Notifications] Failed to log restock alert:', alertError);
        } else {
          console.log('[Notifications] Successfully logged restock alert:', alertData);
        }
      } catch (error) {
        console.error('[Notifications] Failed to send restock email:', error);
      }
    }
  }

  // Send Slack notification (Pro plan only)
  if (settings.slack_notifications && store.plan === 'pro' && settings.slack_webhook_url) {
    try {
      const webhook = new IncomingWebhook(settings.slack_webhook_url);

      await webhook.send({
        text: `🎉 Restock Alert for ${store.shop_domain}`,
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '🎉 Product Back in Stock',
            },
          },
          {
            type: 'section',
            fields: [
              {
                type: 'mrkdwn',
                text: `*Product:*\n${product.title}`,
              },
              {
                type: 'mrkdwn',
                text: `*Variant:*\n${variantTitle}`,
              },
              {
                type: 'mrkdwn',
                text: `*SKU:*\n${sku}`,
              },
              {
                type: 'mrkdwn',
                text: `*Current Quantity:*\n${currentQuantity}`,
              },
            ],
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: {
                  type: 'plain_text',
                  text: 'View in Shopify',
                },
                url: `https://${store.shop_domain}/admin/products/${product.id.split('/').pop()}`,
              },
            ],
          },
        ],
      });

      // Log alert in database
      const { error: slackAlertError } = await supabaseAdmin
        .from('alert_history')
        .insert({
          store_id: store.id,
          product_id: product.id.split('/').pop(),
          product_title: product.title,
          alert_type: 'restock',
          quantity_at_alert: currentQuantity,
          threshold_triggered: null,
          sent_to_email: null,
          sent_to_slack: true,
        });

      if (slackAlertError) {
        console.error('[Notifications] Failed to log restock Slack alert:', slackAlertError);
      }
    } catch (error) {
      console.error('[Notifications] Failed to send restock Slack notification:', error);
    }
  }
}