import {
  AdminSupport,
  makeAdminSupportLoader,
  makeAdminSupportAction,
} from "@nazmulcodes/shopify-admin-and-support-chat/routes/admin/support";
import db from "~/db.server";

type SupportDb = Parameters<typeof makeAdminSupportLoader>[0]["db"];

const opts = { db: db as unknown as SupportDb, sessionSecret: process.env.SESSION_SECRET };
export const loader = makeAdminSupportLoader(opts);
export const action = makeAdminSupportAction(opts);

export default function Support() {
  return <AdminSupport />;
}
