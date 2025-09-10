import nodemailer from 'nodemailer';

const emailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendLowStockEmail(
  toEmail: string,
  productTitle: string,
  currentQuantity: number,
  threshold: number
) {
  const message = `
    Low Stock Alert
    
    Product: ${productTitle}
    Current Quantity: ${currentQuantity}
    Threshold: ${threshold}
  `;

  const htmlMessage = `
    <h2>Low Stock Alert</h2>
    <p><strong>Product:</strong> ${productTitle}</p>
    <p><strong>Current Quantity:</strong> ${currentQuantity}</p>
    <p><strong>Threshold:</strong> ${threshold}</p>
  `;

  try {
    await emailTransporter.sendMail({
      from: process.env.EMAIL_USER,
      to: toEmail,
      subject: currentQuantity === 0 ? `Out of Stock: ${productTitle}` : `Low Stock Alert: ${productTitle}`,
      text: message,
      html: htmlMessage,
    });
    console.log(`Email sent to ${toEmail} for product ${productTitle}`);
  } catch (error) {
    console.error('Email send error:', error);
    throw error;
  }
}