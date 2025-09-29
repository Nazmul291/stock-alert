/**
 * Professional Email Templates for Stock Alert App
 * Production-ready HTML templates with branding and CTA buttons
 */

export interface EmailTemplateData {
  storeName: string;
  shopDomain: string;
  productTitle: string;
  productId: string | number;
  sku?: string;
  currentQuantity?: number;
  threshold?: number;
  variantTitle?: string;
  customBranding?: {
    appName?: string;
    logoUrl?: string;
    primaryColor?: string;
  };
}

// Base email template with consistent styling
const getBaseTemplate = (content: string, previewText: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>Stock Alert</title>
    <!--[if mso]>
    <noscript>
        <xml>
            <o:OfficeDocumentSettings>
                <o:PixelsPerInch>96</o:PixelsPerInch>
            </o:OfficeDocumentSettings>
        </xml>
    </noscript>
    <![endif]-->
    <style>
        /* Reset and base styles */
        body, table, td, p, a, li, blockquote { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; }

        /* Base styles */
        body {
            margin: 0 !important;
            padding: 0 !important;
            background-color: #f8f9fa;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
            line-height: 1.6;
            color: #212529;
        }

        .email-container {
            max-width: 600px;
            margin: 0 auto;
            background-color: #ffffff;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
            overflow: hidden;
        }

        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 32px 24px;
            text-align: center;
        }

        .logo {
            color: #ffffff;
            font-size: 28px;
            font-weight: 700;
            margin: 0;
            text-decoration: none;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }

        .logo-icon {
            width: 40px;
            height: 40px;
            border-radius: 8px;
        }

        .content {
            padding: 32px 24px;
        }

        .alert-icon {
            font-size: 48px;
            margin-bottom: 16px;
            display: block;
        }

        .alert-title {
            font-size: 24px;
            font-weight: 600;
            margin: 0 0 8px 0;
            color: #212529;
        }

        .alert-subtitle {
            font-size: 16px;
            color: #6c757d;
            margin: 0 0 24px 0;
        }

        .product-card {
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 24px;
            margin: 24px 0;
            border-left: 4px solid #667eea;
        }

        .product-title {
            font-size: 20px;
            font-weight: 600;
            margin: 0 0 16px 0;
            color: #212529;
        }

        .product-details {
            display: table;
            width: 100%;
        }

        .product-detail {
            display: table-row;
            margin-bottom: 8px;
        }

        .detail-label {
            display: table-cell;
            font-weight: 600;
            color: #495057;
            padding-right: 16px;
            padding-bottom: 8px;
            vertical-align: top;
            width: 120px;
        }

        .detail-value {
            display: table-cell;
            color: #212529;
            padding-bottom: 8px;
            vertical-align: top;
        }

        .cta-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff !important;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 16px;
            text-align: center;
            margin: 24px 0;
            border: none;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
        }

        .cta-button:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }

        .footer {
            background-color: #f8f9fa;
            padding: 24px;
            text-align: center;
            border-top: 1px solid #dee2e6;
        }

        .footer-text {
            font-size: 14px;
            color: #6c757d;
            margin: 0;
            line-height: 1.5;
        }

        .footer-link {
            color: #667eea;
            text-decoration: none;
        }

        /* Alert-specific colors */
        .alert-low-stock .product-card { border-left-color: #ffc107; }
        .alert-out-of-stock .product-card { border-left-color: #dc3545; }
        .alert-restock .product-card { border-left-color: #28a745; }

        /* Responsive */
        @media only screen and (max-width: 600px) {
            .email-container { margin: 0; border-radius: 0; }
            .content, .header, .footer { padding: 24px 16px; }
            .product-card { padding: 16px; margin: 16px 0; }
            .alert-title { font-size: 20px; }
            .product-title { font-size: 18px; }
            .cta-button { display: block; text-align: center; }
        }
    </style>
</head>
<body>
    <div style="display: none; font-size: 1px; color: #fefefe; line-height: 1px; font-family: Arial, sans-serif; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
        ${previewText}
    </div>
    <div class="email-container">
        ${content}
        <div class="footer">
            <p class="footer-text">
                This email was sent by <a href="https://stock-alert.nazmulcodes.org" class="footer-link">Stock Alert</a><br>
                Automated inventory monitoring for your Shopify store<br>
                <a href="mailto:info@nazmulcodes.org" class="footer-link">Support</a>
            </p>
        </div>
    </div>
</body>
</html>
`;

export const getLowStockEmailTemplate = (data: EmailTemplateData): { subject: string; html: string } => {
  const previewText = `${data.productTitle} is running low (${data.currentQuantity} left)`;

  const content = `
    <div class="header">
        <h1 class="logo">
            <img src="https://dev.nazmulcodes.org/logo.png" alt="Stock Alert" class="logo-icon" />
            Stock Alert
        </h1>
    </div>
    <div class="content alert-low-stock">
        <div style="text-align: center;">
            <span class="alert-icon">⚠️</span>
            <h2 class="alert-title">Low Stock Alert</h2>
            <p class="alert-subtitle">One of your products is running low on inventory</p>
        </div>

        <div class="product-card">
            <h3 class="product-title">${data.productTitle}</h3>
            <div class="product-details">
                ${data.variantTitle ? `
                <div class="product-detail">
                    <div class="detail-label">Variant:</div>
                    <div class="detail-value">${data.variantTitle}</div>
                </div>
                ` : ''}
                ${data.sku ? `
                <div class="product-detail">
                    <div class="detail-label">SKU:</div>
                    <div class="detail-value">${data.sku}</div>
                </div>
                ` : ''}
                <div class="product-detail">
                    <div class="detail-label">Current Stock:</div>
                    <div class="detail-value" style="color: #ffc107; font-weight: 600;">${data.currentQuantity} units</div>
                </div>
                <div class="product-detail">
                    <div class="detail-label">Alert Threshold:</div>
                    <div class="detail-value">${data.threshold} units</div>
                </div>
                <div class="product-detail">
                    <div class="detail-label">Store:</div>
                    <div class="detail-value">${data.storeName}</div>
                </div>
            </div>
        </div>

        <div style="text-align: center;">
            <a href="https://${data.shopDomain}/admin/products/${data.productId}" class="cta-button">
                📝 Manage Product Inventory
            </a>
            <br>
            <a href="https://${data.shopDomain}/admin/products/${data.productId}" style="color: #667eea; text-decoration: none; font-size: 14px;">
                or click here to view product details
            </a>
        </div>

        <div style="background-color: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 16px; margin-top: 24px;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
                <strong>💡 Tip:</strong> Consider restocking this product soon to avoid going out of stock and potentially losing sales.
            </p>
        </div>
    </div>
  `;

  return {
    subject: `⚠️ Low Stock Alert: ${data.productTitle}`,
    html: getBaseTemplate(content, previewText)
  };
};

export const getOutOfStockEmailTemplate = (data: EmailTemplateData): { subject: string; html: string } => {
  const previewText = `${data.productTitle} is now out of stock`;

  const content = `
    <div class="header">
        <h1 class="logo">
            <img src="https://dev.nazmulcodes.org/logo.png" alt="Stock Alert" class="logo-icon" />
            Stock Alert
        </h1>
    </div>
    <div class="content alert-out-of-stock">
        <div style="text-align: center;">
            <span class="alert-icon">❌</span>
            <h2 class="alert-title">Out of Stock Alert</h2>
            <p class="alert-subtitle">One of your products has sold out</p>
        </div>

        <div class="product-card">
            <h3 class="product-title">${data.productTitle}</h3>
            <div class="product-details">
                ${data.variantTitle ? `
                <div class="product-detail">
                    <div class="detail-label">Variant:</div>
                    <div class="detail-value">${data.variantTitle}</div>
                </div>
                ` : ''}
                ${data.sku ? `
                <div class="product-detail">
                    <div class="detail-label">SKU:</div>
                    <div class="detail-value">${data.sku}</div>
                </div>
                ` : ''}
                <div class="product-detail">
                    <div class="detail-label">Current Stock:</div>
                    <div class="detail-value" style="color: #dc3545; font-weight: 600;">0 units</div>
                </div>
                <div class="product-detail">
                    <div class="detail-label">Store:</div>
                    <div class="detail-value">${data.storeName}</div>
                </div>
            </div>
        </div>

        <div style="text-align: center;">
            <a href="https://${data.shopDomain}/admin/products/${data.productId}" class="cta-button">
                🔄 Restock Product
            </a>
            <br>
            <a href="https://${data.shopDomain}/admin/products/${data.productId}" style="color: #667eea; text-decoration: none; font-size: 14px;">
                or click here to view product details
            </a>
        </div>

        <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 6px; padding: 16px; margin-top: 24px;">
            <p style="margin: 0; color: #721c24; font-size: 14px;">
                <strong>🚨 Action Required:</strong> This product is no longer available for purchase. Consider restocking immediately to resume sales.
            </p>
        </div>
    </div>
  `;

  return {
    subject: `❌ Out of Stock: ${data.productTitle}`,
    html: getBaseTemplate(content, previewText)
  };
};

export const getRestockEmailTemplate = (data: EmailTemplateData): { subject: string; html: string } => {
  const previewText = `${data.productTitle} is back in stock (${data.currentQuantity} units available)`;

  const content = `
    <div class="header">
        <h1 class="logo">
            <img src="https://dev.nazmulcodes.org/logo.png" alt="Stock Alert" class="logo-icon" />
            Stock Alert
        </h1>
    </div>
    <div class="content alert-restock">
        <div style="text-align: center;">
            <span class="alert-icon">🎉</span>
            <h2 class="alert-title">Back in Stock!</h2>
            <p class="alert-subtitle">Great news! Your product is available again</p>
        </div>

        <div class="product-card">
            <h3 class="product-title">${data.productTitle}</h3>
            <div class="product-details">
                ${data.variantTitle ? `
                <div class="product-detail">
                    <div class="detail-label">Variant:</div>
                    <div class="detail-value">${data.variantTitle}</div>
                </div>
                ` : ''}
                ${data.sku ? `
                <div class="product-detail">
                    <div class="detail-label">SKU:</div>
                    <div class="detail-value">${data.sku}</div>
                </div>
                ` : ''}
                <div class="product-detail">
                    <div class="detail-label">Current Stock:</div>
                    <div class="detail-value" style="color: #28a745; font-weight: 600;">${data.currentQuantity} units</div>
                </div>
                <div class="product-detail">
                    <div class="detail-label">Store:</div>
                    <div class="detail-value">${data.storeName}</div>
                </div>
            </div>
        </div>

        <div style="text-align: center;">
            <a href="https://${data.shopDomain}/admin/products/${data.productId}" class="cta-button">
                👀 View Product Details
            </a>
            <br>
            <a href="https://${data.shopDomain}/admin/products/${data.productId}" style="color: #667eea; text-decoration: none; font-size: 14px;">
                or click here to manage inventory
            </a>
        </div>

        <div style="background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 6px; padding: 16px; margin-top: 24px;">
            <p style="margin: 0; color: #155724; font-size: 14px;">
                <strong>✅ Success:</strong> Your customers can now purchase this product again. Consider promoting it to boost sales!
            </p>
        </div>
    </div>
  `;

  return {
    subject: `🎉 Back in Stock: ${data.productTitle}`,
    html: getBaseTemplate(content, previewText)
  };
};