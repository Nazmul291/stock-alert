import {
  AdminSupport,
  makeAdminSupportLoader,
  makeAdminSupportAction,
} from "@nazmul-hawlader/shopify-admin-and-support-chat/routes/admin/support";
import db from "~/db.server";

const opts = { db: db as any, sessionSecret: process.env.SESSION_SECRET };
export const loader = makeAdminSupportLoader(opts);
export const action = makeAdminSupportAction(opts);

export default function Support() {
  return <AdminSupport />;
}
