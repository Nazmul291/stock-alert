export interface EmailTemplateData {
  storeName: string;
  shopDomain: string;
  productTitle: string;
  productId: string | number;
  sku?: string | null;
  currentQuantity?: number;
  threshold?: number;
  variantTitle?: string | null;
}

const baseTemplate = (content: string, previewText: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stock Alert</title>
  <style>
    body { margin:0; padding:0; background:#f8f9fa; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif; color:#212529; }
    .wrap { max-width:600px; margin:0 auto; background:#fff; border-radius:8px; box-shadow:0 4px 12px rgba(0,0,0,.1); overflow:hidden; }
    .hdr { background:linear-gradient(135deg,#667eea,#764ba2); padding:32px 24px; text-align:center; color:#fff; font-size:24px; font-weight:700; }
    .body { padding:32px 24px; }
    .card { background:#f8f9fa; border-radius:8px; padding:24px; margin:24px 0; border-left:4px solid #667eea; }
    .card.warn { border-left-color:#ffc107; }
    .card.danger { border-left-color:#dc3545; }
    .card.ok { border-left-color:#28a745; }
    .title { font-size:20px; font-weight:600; margin:0 0 12px; }
    .row { display:flex; padding:4px 0; }
    .lbl { font-weight:600; color:#495057; width:140px; flex-shrink:0; }
    .val { color:#212529; }
    .btn { display:inline-block; background:linear-gradient(135deg,#667eea,#764ba2); color:#fff!important; text-decoration:none; padding:14px 28px; border-radius:6px; font-weight:600; font-size:16px; margin:24px 0; }
    .tip { border-radius:6px; padding:16px; margin-top:24px; font-size:14px; }
    .tip.warn { background:#fff3cd; border:1px solid #ffeaa7; color:#856404; }
    .tip.danger { background:#f8d7da; border:1px solid #f5c6cb; color:#721c24; }
    .tip.ok { background:#d4edda; border:1px solid #c3e6cb; color:#155724; }
    .ftr { background:#f8f9fa; padding:24px; text-align:center; border-top:1px solid #dee2e6; font-size:14px; color:#6c757d; }
    .ftr a { color:#667eea; text-decoration:none; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;max-height:0;overflow:hidden;">${previewText}</div>
  <div class="wrap">
    ${content}
    <div class="ftr">
      This email was sent by <a href="https://stock-alert.nazmulcodes.org">Stock Alert</a><br>
      Automated inventory monitoring for your Shopify store<br>
      <a href="mailto:info@nazmulcodes.org">Support</a>
    </div>
  </div>
</body>
</html>`;

export function getLowStockEmailTemplate(data: EmailTemplateData): { subject: string; html: string } {
  const content = `
    <div class="hdr">⚠️ Stock Alert — Low Stock</div>
    <div class="body">
      <p>One of your products is running low on inventory.</p>
      <div class="card warn">
        <div class="title">${data.productTitle}</div>
        ${data.variantTitle ? `<div class="row"><span class="lbl">Variant:</span><span class="val">${data.variantTitle}</span></div>` : ''}
        ${data.sku ? `<div class="row"><span class="lbl">SKU:</span><span class="val">${data.sku}</span></div>` : ''}
        <div class="row"><span class="lbl">Current Stock:</span><span class="val" style="color:#ffc107;font-weight:600;">${data.currentQuantity} units</span></div>
        <div class="row"><span class="lbl">Threshold:</span><span class="val">${data.threshold} units</span></div>
        <div class="row"><span class="lbl">Store:</span><span class="val">${data.storeName}</span></div>
      </div>
      <div style="text-align:center;">
        <a href="https://${data.shopDomain}/admin/products/${data.productId}" class="btn">📝 Manage Inventory</a>
      </div>
      <div class="tip warn"><strong>💡 Tip:</strong> Consider restocking soon to avoid going out of stock.</div>
    </div>`;
  return {
    subject: `⚠️ Low Stock Alert: ${data.productTitle}`,
    html: baseTemplate(content, `${data.productTitle} is running low (${data.currentQuantity} left)`),
  };
}

export function getOutOfStockEmailTemplate(data: EmailTemplateData): { subject: string; html: string } {
  const content = `
    <div class="hdr">❌ Stock Alert — Out of Stock</div>
    <div class="body">
      <p>One of your products has sold out.</p>
      <div class="card danger">
        <div class="title">${data.productTitle}</div>
        ${data.variantTitle ? `<div class="row"><span class="lbl">Variant:</span><span class="val">${data.variantTitle}</span></div>` : ''}
        ${data.sku ? `<div class="row"><span class="lbl">SKU:</span><span class="val">${data.sku}</span></div>` : ''}
        <div class="row"><span class="lbl">Current Stock:</span><span class="val" style="color:#dc3545;font-weight:600;">0 units</span></div>
        <div class="row"><span class="lbl">Store:</span><span class="val">${data.storeName}</span></div>
      </div>
      <div style="text-align:center;">
        <a href="https://${data.shopDomain}/admin/products/${data.productId}" class="btn">🔄 Restock Product</a>
      </div>
      <div class="tip danger"><strong>🚨 Action Required:</strong> This product is no longer available for purchase. Restock immediately to resume sales.</div>
    </div>`;
  return {
    subject: `❌ Out of Stock: ${data.productTitle}`,
    html: baseTemplate(content, `${data.productTitle} is now out of stock`),
  };
}

export function getRestockEmailTemplate(data: EmailTemplateData): { subject: string; html: string } {
  const content = `
    <div class="hdr">🎉 Stock Alert — Back in Stock</div>
    <div class="body">
      <p>Great news! Your product is available again.</p>
      <div class="card ok">
        <div class="title">${data.productTitle}</div>
        ${data.variantTitle ? `<div class="row"><span class="lbl">Variant:</span><span class="val">${data.variantTitle}</span></div>` : ''}
        ${data.sku ? `<div class="row"><span class="lbl">SKU:</span><span class="val">${data.sku}</span></div>` : ''}
        <div class="row"><span class="lbl">Current Stock:</span><span class="val" style="color:#28a745;font-weight:600;">${data.currentQuantity} units</span></div>
        <div class="row"><span class="lbl">Store:</span><span class="val">${data.storeName}</span></div>
      </div>
      <div style="text-align:center;">
        <a href="https://${data.shopDomain}/admin/products/${data.productId}" class="btn">👀 View Product</a>
      </div>
      <div class="tip ok"><strong>✅ Success:</strong> Customers can now purchase this product again. Consider promoting it to boost sales!</div>
    </div>`;
  return {
    subject: `🎉 Back in Stock: ${data.productTitle}`,
    html: baseTemplate(content, `${data.productTitle} is back in stock (${data.currentQuantity} units available)`),
  };
}
