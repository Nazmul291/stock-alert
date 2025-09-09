import nodemailer from 'nodemailer';
import { IncomingWebhook } from '@slack/webhook';
import { supabaseAdmin, Store, StoreSettings, AlertHistory } from './supabase';

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
  // Handle product-level tracking where variant might be null
  const variantTitle = variant?.title || 'All Variants';
  const sku = variant?.sku || product?.sku || 'N/A';
  
  const message = `
    Low Stock Alert for ${store.shop_domain}
    
    Product: ${product.title}
    Variant: ${variantTitle}
    SKU: ${sku}
    Current Quantity: ${currentQuantity}
    Threshold: ${threshold}
    
    View Product: https://${store.shop_domain}/admin/products/${product.id}
  `;

  const htmlMessage = `
    <h2>Low Stock Alert for ${store.shop_domain}</h2>
    <p><strong>Product:</strong> ${product.title}</p>
    <p><strong>Variant:</strong> ${variantTitle}</p>
    <p><strong>SKU:</strong> ${sku}</p>
    <p><strong>Current Quantity:</strong> ${currentQuantity}</p>
    <p><strong>Threshold:</strong> ${threshold}</p>
    <p><a href="https://${store.shop_domain}/admin/products/${product.id}">View Product in Shopify Admin</a></p>
  `;

  // Send email notification
  if (settings.email_notifications) {
    const toEmail = settings.notification_email || store.email;
    if (toEmail) {
      try {
        await emailTransporter.sendMail({
          from: process.env.EMAIL_USER,
          to: toEmail,
          subject: `Low Stock Alert: ${product.title}`,
          text: message,
          html: htmlMessage,
        });

        // Log alert in database
        await supabaseAdmin
          .from('alert_history')
          .insert({
            store_id: store.id,
            product_id: product.id,
            variant_id: variant?.id || null,
            alert_type: 'low_stock',
            alert_channel: 'email',
            quantity_at_alert: currentQuantity,
            threshold_at_alert: threshold,
            message: message,
          });
      } catch (error) {
        console.error('Email send error:', error);
      }
    }
  }

  // Send Slack notification (Pro plan only)
  console.log('Slack notification check:', {
    slack_notifications: settings.slack_notifications,
    store_plan: store.plan,
    has_webhook_url: !!settings.slack_webhook_url,
    webhook_url: settings.slack_webhook_url?.substring(0, 50) + '...'
  });
  
  if (settings.slack_notifications && store.plan === 'pro' && settings.slack_webhook_url) {
    console.log('Sending Slack notification...');
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
                url: `https://${store.shop_domain}/admin/products/${product.id}`,
              },
            ],
          },
        ],
      });
      
      console.log('Slack notification sent successfully');

      // Log alert in database
      await supabaseAdmin
        .from('alert_history')
        .insert({
          store_id: store.id,
          product_id: product.id,
          variant_id: variant?.id || null,
          alert_type: 'low_stock',
          alert_channel: 'slack',
          quantity_at_alert: currentQuantity,
          threshold_at_alert: threshold,
          message: message,
        });
    } catch (error) {
      console.error('Slack send error - Full details:', error);
      console.error('Error message:', error instanceof Error ? error.message : 'Unknown error');
    }
  } else {
    console.log('Slack notification skipped - conditions not met');
  }
}

export async function sendOutOfStockAlert(
  store: Store,
  product: any,
  variant: any,
  settings: StoreSettings
) {
  // Handle product-level tracking where variant might be null
  const variantTitle = variant?.title || 'All Variants';
  const sku = variant?.sku || product?.sku || 'N/A';
  
  const message = `
    Out of Stock Alert for ${store.shop_domain}
    
    Product: ${product.title}
    Variant: ${variantTitle}
    SKU: ${sku}
    
    This product has been automatically hidden from your store.
    
    View Product: https://${store.shop_domain}/admin/products/${product.id}
  `;

  const htmlMessage = `
    <h2>Out of Stock Alert for ${store.shop_domain}</h2>
    <p><strong>Product:</strong> ${product.title}</p>
    <p><strong>Variant:</strong> ${variantTitle}</p>
    <p><strong>SKU:</strong> ${sku}</p>
    <p style="color: red;"><strong>This product has been automatically hidden from your store.</strong></p>
    <p><a href="https://${store.shop_domain}/admin/products/${product.id}">View Product in Shopify Admin</a></p>
  `;

  // Send email notification
  if (settings.email_notifications) {
    const toEmail = settings.notification_email || store.email;
    if (toEmail) {
      try {
        await emailTransporter.sendMail({
          from: process.env.EMAIL_USER,
          to: toEmail,
          subject: `Out of Stock: ${product.title}`,
          text: message,
          html: htmlMessage,
        });

        // Log alert in database
        await supabaseAdmin
          .from('alert_history')
          .insert({
            store_id: store.id,
            product_id: product.id,
            variant_id: variant?.id || null,
            alert_type: 'out_of_stock',
            alert_channel: 'email',
            quantity_at_alert: 0,
            message: message,
          });
      } catch (error) {
        console.error('Email send error:', error);
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
                url: `https://${store.shop_domain}/admin/products/${product.id}`,
              },
            ],
          },
        ],
      });

      // Log alert in database
      await supabaseAdmin
        .from('alert_history')
        .insert({
          store_id: store.id,
          product_id: product.id,
          variant_id: variant?.id || null,
          alert_type: 'out_of_stock',
          alert_channel: 'slack',
          quantity_at_alert: 0,
          message: message,
        });
    } catch (error) {
      console.error('Slack send error:', error);
    }
  }
}