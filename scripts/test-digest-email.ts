/**
 * One-off: sends a sample digest email without touching cron eligibility
 * checks (plan, digestFrequency, lastDigestSentAt, real at-risk products).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/test-digest-email.ts you@example.com
 */

import "dotenv/config";
import { sendDigestEmail } from "../app/lib/notifications.js";

const recipient = process.argv[2];
if (!recipient) {
  console.error("Usage: npx tsx --env-file=.env scripts/test-digest-email.ts <email>");
  process.exit(1);
}

await sendDigestEmail(
  "app-test-basic.myshopify.com",
  [recipient],
  {
    shop: "app-test-basic.myshopify.com",
    frequency: "Daily",
    outOfStock: [
      { productTitle: "Classic Tee", sku: "TEE-001-BLK", currentQuantity: 0, inventoryStatus: "out_of_stock" },
      { productTitle: "Canvas Tote Bag", sku: "TOTE-042", currentQuantity: 0, inventoryStatus: "out_of_stock" },
    ],
    lowStock: [
      { productTitle: "Ceramic Mug", sku: "MUG-010-WHT", currentQuantity: 3, inventoryStatus: "low_stock" },
    ],
  },
);

console.log(`Test digest sent to ${recipient}`);
