export interface EmailTemplateData {
  storeName: string;
  shopDomain: string;
  productTitle: string;
  productId: string | number;
  variantId?: string | null;
  sku?: string | null;
  currentQuantity?: number;
  threshold?: number;
  variantTitle?: string | null;
  imageUrl?: string | null;
}

// Deep-links to the specific variant's admin page when known, so merchants
// land exactly where they need to act instead of the product's default
// (first) variant.
function productAdminUrl(data: EmailTemplateData): string {
  const base = `https://${data.shopDomain}/admin/products/${data.productId}`;
  return data.variantId ? `${base}/variants/${data.variantId}` : base;
}

// "Product — Variant" when the alert is for a specific variant, so subject
// lines and preview text are unambiguous for multi-variant products.
function displayTitle(data: EmailTemplateData): string {
  return data.variantTitle ? `${data.productTitle} — ${data.variantTitle}` : data.productTitle;
}

export interface BrandConfig {
  logoUrl?: string | null;
  color?: string | null;
  senderName?: string | null;
}

const DEFAULT_COLOR = '#4f46e5';

function brandBg(color: string | null | undefined): string {
  const c = color || DEFAULT_COLOR;
  return `background:${c};`;
}

function esc(str: string | null | undefined): string {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shell(previewText: string, body: string, brand: BrandConfig = {}): string {
  const accentColor = brand.color || DEFAULT_COLOR;
  const padding = '&nbsp;&zwnj;'.repeat(40);
  return `<!DOCTYPE html>
<html lang="en" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Stock Alert</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(previewText)}${padding}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
  <tr><td style="padding:32px 16px;" align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
      ${body}
      <!-- Footer -->
      <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:24px 32px;text-align:center;font-size:13px;color:#9ca3af;line-height:1.6;">
        Sent by
        <a href="https://stock-alert.nazmulcodes.org" style="color:${accentColor};text-decoration:none;font-weight:500;">Stock Alert</a>
        &nbsp;&middot;&nbsp;
        Automated inventory monitoring for Shopify
        &nbsp;&middot;&nbsp;
        <a href="mailto:info@nazmulcodes.org" style="color:${accentColor};text-decoration:none;">Support</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function header(emoji: string, title: string, subtitle: string, brand: BrandConfig = {}): string {
  const senderLabel = brand.senderName ? esc(brand.senderName) : 'Stock Alert';
  return `
  <tr>
    <td style="${brandBg(brand.color)} padding:28px 32px;">
      ${brand.logoUrl
        ? `<div style="margin-bottom:14px;"><img src="${esc(brand.logoUrl)}" alt="${senderLabel}" height="40" style="max-height:40px;max-width:160px;object-fit:contain;display:block;" /></div>`
        : `<div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">${senderLabel}</div>`
      }
      <div style="font-size:26px;font-weight:800;color:#ffffff;margin-bottom:4px;">${emoji} ${esc(title)}</div>
      <div style="font-size:14px;color:rgba(255,255,255,0.8);">${esc(subtitle)}</div>
    </td>
  </tr>`;
}

function productCard(
  data: EmailTemplateData,
  badge: { text: string; bg: string; color: string },
  stats: Array<{ label: string; value: string; color: string }>,
  ctaLabel: string,
  brand: BrandConfig = {},
): string {
  return `
  <tr>
    <td style="padding:28px 32px 20px;">

      <!-- Product row -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          ${data.imageUrl ? `
          <td width="88" valign="top" style="padding-right:16px;">
            <img src="${esc(data.imageUrl)}" alt="${esc(data.productTitle)}" width="80" height="80"
              style="border-radius:8px;object-fit:cover;border:1px solid #e5e7eb;display:block;" />
          </td>` : ''}
          <td valign="top">
            <div style="font-size:18px;font-weight:700;color:#111827;line-height:1.3;margin-bottom:8px;">${esc(data.productTitle)}</div>
            <span style="display:inline-block;padding:3px 10px;background:${badge.bg};color:${badge.color};font-size:12px;font-weight:600;border-radius:20px;">${badge.text}</span>
          </td>
        </tr>
      </table>

      ${(data.variantTitle || data.sku) ? `
      <!-- Variant details -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        ${data.variantTitle ? `
        <tr>
          <td style="padding:9px 14px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;width:100px;border-bottom:${data.sku ? '1px solid #e5e7eb' : '0'};">Variant</td>
          <td style="padding:9px 14px;font-size:13px;color:#111827;font-weight:600;border-left:1px solid #e5e7eb;border-bottom:${data.sku ? '1px solid #e5e7eb' : '0'};">${esc(data.variantTitle)}</td>
        </tr>` : ''}
        ${data.sku ? `
        <tr>
          <td style="padding:9px 14px;background:#f9fafb;font-size:12px;font-weight:600;color:#6b7280;width:100px;">SKU</td>
          <td style="padding:9px 14px;font-size:13px;color:#111827;font-weight:600;border-left:1px solid #e5e7eb;">${esc(data.sku)}</td>
        </tr>` : ''}
      </table>` : ''}

      <!-- Stats -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <tr>
          ${stats.map((s, i) => `
          <td style="padding:16px 20px;background:#f9fafb;text-align:center;${i < stats.length - 1 ? 'border-right:1px solid #e5e7eb;' : ''}">
            <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">${esc(s.label)}</div>
            <div style="font-size:30px;font-weight:800;color:${s.color};line-height:1;">${esc(s.value)}</div>
          </td>`).join('')}
        </tr>
      </table>

      <div style="font-size:13px;color:#6b7280;margin-bottom:22px;">
        Store: <strong style="color:#374151;">${esc(data.storeName)}</strong>
      </div>

      <!-- CTA -->
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr>
          <td style="border-radius:8px;${brandBg(brand.color)}">
            <a href="${productAdminUrl(data)}"
              style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;line-height:1;">
              ${esc(ctaLabel)} &rarr;
            </a>
          </td>
        </tr>
      </table>

    </td>
  </tr>`;
}

function tip(text: string, bg: string, borderColor: string, color: string): string {
  return `
  <tr>
    <td style="padding:0 32px 28px;">
      <div style="background:${bg};border-left:4px solid ${borderColor};border-radius:0 6px 6px 0;padding:12px 16px;font-size:14px;color:${color};line-height:1.5;">
        ${text}
      </div>
    </td>
  </tr>`;
}

export function getLowStockEmailTemplate(data: EmailTemplateData, brand: BrandConfig = {}): { subject: string; html: string } {
  return {
    subject: `⚠️ Low Stock: ${displayTitle(data)} (${data.currentQuantity} left)`,
    html: shell(
      `${displayTitle(data)} is running low — ${data.currentQuantity} units remaining`,
      `${header('⚠️', 'Low Stock Alert', `${displayTitle(data)} needs your attention`, brand)}
       ${productCard(
         data,
         { text: '⚠️ Low Stock', bg: '#fef3c7', color: '#92400e' },
         [
           { label: 'Current Stock', value: String(data.currentQuantity ?? 0), color: '#d97706' },
           { label: 'Threshold', value: String(data.threshold ?? 0), color: '#374151' },
         ],
         'Manage Inventory',
         brand,
       )}
       ${tip('<strong>Restock soon</strong> — this product will sell out before the next delivery window if not replenished.', '#fffbeb', '#f59e0b', '#92400e')}`,
      brand,
    ),
  };
}

export function getOutOfStockEmailTemplate(data: EmailTemplateData, brand: BrandConfig = {}): { subject: string; html: string } {
  return {
    subject: `❌ Out of Stock: ${displayTitle(data)}`,
    html: shell(
      `${displayTitle(data)} is now out of stock`,
      `${header('❌', 'Out of Stock', `${displayTitle(data)} has sold out`, brand)}
       ${productCard(
         data,
         { text: '❌ Sold Out', bg: '#fee2e2', color: '#991b1b' },
         [{ label: 'Current Stock', value: '0', color: '#dc2626' }],
         'Restock Product',
         brand,
       )}
       ${tip('<strong>Action required</strong> — customers cannot purchase this product until inventory is restored.', '#fef2f2', '#dc2626', '#991b1b')}`,
      brand,
    ),
  };
}

export function getRestockEmailTemplate(data: EmailTemplateData, brand: BrandConfig = {}): { subject: string; html: string } {
  return {
    subject: `🎉 Back in Stock: ${displayTitle(data)} (${data.currentQuantity} units)`,
    html: shell(
      `${displayTitle(data)} is back in stock — ${data.currentQuantity} units available`,
      `${header('🎉', 'Back in Stock', `${displayTitle(data)} is available again`, brand)}
       ${productCard(
         data,
         { text: '✅ In Stock', bg: '#d1fae5', color: '#065f46' },
         [{ label: 'Available Now', value: String(data.currentQuantity ?? 0), color: '#059669' }],
         'View Product',
         brand,
       )}
       ${tip('<strong>Great news!</strong> — customers can now purchase this product again. Consider promoting it to boost sales.', '#f0fdf4', '#059669', '#065f46')}`,
      brand,
    ),
  };
}

export interface BackInStockCustomerData {
  storeName: string;
  shopDomain: string;
  productTitle: string;
  productId: string;
  productUrl?: string | null;
  imageUrl?: string | null;
  unsubscribeUrl: string;
  firstName?: string | null;
}

export function getBackInStockCustomerTemplate(data: BackInStockCustomerData, brand: BrandConfig = {}): { subject: string; html: string } {
  const productUrl = data.productUrl ?? `https://${data.shopDomain}/products/${data.productId}`;
  const greeting = data.firstName ? `Hi ${esc(data.firstName)},` : 'Good news!';
  return {
    subject: `🎉 Back in stock: ${data.productTitle}`,
    html: shell(
      `${data.productTitle} is back in stock at ${data.storeName} — grab it before it sells out again`,
      `${header('🎉', 'Back in Stock!', `${data.productTitle} is available again at ${data.storeName}`, brand)}
      <tr>
        <td style="padding:28px 32px 20px;">
          <div style="font-size:18px;font-weight:600;color:#111827;margin-bottom:16px;">${greeting}</div>
          ${data.imageUrl ? `
          <div style="text-align:center;margin-bottom:20px;">
            <img src="${esc(data.imageUrl)}" alt="${esc(data.productTitle)}" width="180" height="180"
              style="border-radius:10px;object-fit:cover;border:1px solid #e5e7eb;" />
          </div>` : ''}
          <div style="font-size:20px;font-weight:700;color:#111827;margin-bottom:8px;">${esc(data.productTitle)}</div>
          <div style="font-size:14px;color:#6b7280;margin-bottom:24px;">
            You signed up to be notified when this item returned to <strong>${esc(data.storeName)}</strong>. It's back — but it may sell out again quickly.
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="border-radius:8px;${brandBg(brand.color)}">
                <a href="${esc(productUrl)}"
                  style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;line-height:1;">
                  Shop Now &rarr;
                </a>
              </td>
            </tr>
          </table>
          <p style="font-size:12px;color:#9ca3af;margin:0;">
            You're receiving this because you signed up for a back-in-stock notification.
            <a href="${esc(data.unsubscribeUrl)}" style="color:#9ca3af;">Unsubscribe</a>
          </p>
        </td>
      </tr>`,
      brand,
    ),
  };
}

export interface DigestProduct {
  productTitle: string | null;
  sku: string | null;
  currentQuantity: number;
  inventoryStatus: string;
}

export interface DigestEmailData {
  shop: string;
  frequency: 'Daily' | 'Weekly';
  outOfStock: DigestProduct[];
  lowStock: DigestProduct[];
}

export function getDigestEmailTemplate(data: DigestEmailData, brand: BrandConfig = {}): { subject: string; html: string } {
  const storeName = data.shop.replace('.myshopify.com', '');
  const totalAtRisk = data.outOfStock.length + data.lowStock.length;

  const productRow = (p: DigestProduct, isOut: boolean) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;">
        <div style="font-weight:600;font-size:14px;color:#111827;">${esc(p.productTitle ?? 'Unknown')}</div>
        ${p.sku ? `<div style="font-size:12px;color:#9ca3af;margin-top:1px;">SKU: ${esc(p.sku)}</div>` : ''}
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;">
        <span style="font-size:14px;font-weight:700;color:${isOut ? '#dc2626' : '#d97706'};">${p.currentQuantity}</span>
        <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:10px;background:${isOut ? '#fee2e2' : '#fef3c7'};color:${isOut ? '#991b1b' : '#92400e'};font-size:11px;font-weight:600;">${isOut ? 'Out of Stock' : 'Low Stock'}</span>
      </td>
    </tr>`;

  const rows = [
    ...data.outOfStock.map(p => productRow(p, true)),
    ...data.lowStock.map(p => productRow(p, false)),
  ].join('');

  const body = `
    ${header('📦', `${data.frequency} Inventory Digest`, `${totalAtRisk} product${totalAtRisk !== 1 ? 's' : ''} need${totalAtRisk === 1 ? 's' : ''} attention — ${storeName}`, brand)}
    <tr>
      <td style="padding:24px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:16px 20px;background:#f9fafb;text-align:center;border-right:1px solid #e5e7eb;">
              <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Out of Stock</div>
              <div style="font-size:30px;font-weight:800;color:#dc2626;line-height:1;">${data.outOfStock.length}</div>
            </td>
            <td style="padding:16px 20px;background:#f9fafb;text-align:center;">
              <div style="font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">Low Stock</div>
              <div style="font-size:30px;font-weight:800;color:#d97706;line-height:1;">${data.lowStock.length}</div>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;">
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;">Product</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;">Stock</th>
          </tr>
          ${rows}
        </table>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
          <tr>
            <td style="border-radius:8px;${brandBg(brand.color)}">
              <a href="https://admin.shopify.com/store/${storeName}/apps/${process.env.SHOPIFY_API_KEY}/app/products?filter=out_of_stock"
                style="display:inline-block;padding:13px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;line-height:1;">
                View At-Risk Products &rarr;
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;

  return {
    subject: `📦 ${data.frequency} Digest: ${totalAtRisk} product${totalAtRisk !== 1 ? 's' : ''} need${totalAtRisk === 1 ? 's' : ''} attention`,
    html: shell(`${totalAtRisk} products need attention — ${storeName}`, body, brand),
  };
}

export interface PurchaseOrderEmailLine {
  productTitle: string | null;
  variantTitle: string | null;
  sku: string | null;
  quantityOrdered: number;
  unitCost: number | null;
}

export interface PurchaseOrderEmailData {
  poNumber: number;
  supplierName: string;
  storeName: string;
  lines: PurchaseOrderEmailLine[];
  totalCost: number | null;
}

export function getPurchaseOrderEmailTemplate(data: PurchaseOrderEmailData, brand: BrandConfig = {}): { subject: string; html: string } {
  const lineRow = (l: PurchaseOrderEmailLine) => `
    <tr>
      <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;">
        <div style="font-weight:600;font-size:14px;color:#111827;">${esc(l.productTitle ?? 'Unknown')}${l.variantTitle ? ` — ${esc(l.variantTitle)}` : ''}</div>
        ${l.sku ? `<div style="font-size:12px;color:#9ca3af;margin-top:1px;">SKU: ${esc(l.sku)}</div>` : ''}
      </td>
      <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;font-size:14px;color:#111827;">${l.quantityOrdered}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;font-size:14px;color:#111827;">${l.unitCost != null ? `$${l.unitCost.toFixed(2)}` : '—'}</td>
      <td style="padding:10px 16px;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap;font-size:14px;font-weight:600;color:#111827;">${l.unitCost != null ? `$${(l.unitCost * l.quantityOrdered).toFixed(2)}` : '—'}</td>
    </tr>`;

  const rows = data.lines.map(lineRow).join('');

  const body = `
    ${header('📋', `Purchase Order #${data.poNumber}`, `From ${data.storeName}`, brand)}
    <tr>
      <td style="padding:24px 32px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <tr style="background:#f9fafb;">
            <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;">Product</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;">Qty</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;">Unit Cost</th>
            <th style="padding:10px 16px;text-align:right;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.06em;border-bottom:1px solid #e5e7eb;">Line Total</th>
          </tr>
          ${rows}
        </table>
        <p style="margin:0 0 24px;text-align:right;font-size:16px;font-weight:700;color:#111827;">
          Total: ${data.totalCost != null ? `$${data.totalCost.toFixed(2)}` : '—'}
        </p>
      </td>
    </tr>`;

  return {
    subject: `Purchase Order #${data.poNumber} from ${data.storeName}`,
    html: shell(`Purchase Order #${data.poNumber} from ${data.storeName}`, body, brand),
  };
}
