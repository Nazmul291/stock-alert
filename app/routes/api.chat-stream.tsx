import { makeChatStreamLoader } from "@nazmulcodes/shopify-admin-and-support-chat/routes/api/chat-stream";
import db from "~/db.server";

export const loader = makeChatStreamLoader({
  adminUserDb: db.adminUser,
  shopDb: { findUnique: ({ where }: { where: { id: string } }) => db.session.findUnique({ where: { shop: where.id } }) },
});
