import { makeChatStreamLoader } from "@nazmul-hawlader/shopify-admin-and-support-chat/routes/api/chat-stream";
import db from "~/db.server";

export const loader = makeChatStreamLoader({
  adminUserDb: db.adminUser,
  shopDb: db.shop,
});
