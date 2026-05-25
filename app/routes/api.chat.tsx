import {
  makeChatApiLoader,
  makeChatApiAction,
} from "@nazmul-hawlader/shopify-admin-and-support-chat/routes/api/chat";
import db from "~/db.server";

const opts = {
  db: db as any,
  shopDb: db.shop,
  agentDb: db.adminUser,
  agentOnlineDb: db.adminUser,
  appUrl: process.env.SHOPIFY_APP_URL,
  ai: { accessToken: process.env.AI_ACCESS_TOKEN, baseUrl: process.env.AI_BASE_URL },
};
export const loader = makeChatApiLoader(opts);
export const action = makeChatApiAction(opts);
