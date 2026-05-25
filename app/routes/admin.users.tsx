import {
  AdminUsers,
  makeAdminUsersLoader,
  makeAdminUsersAction,
} from "@nazmul-hawlader/shopify-admin-and-support-chat/routes/admin/users";
import db from "~/db.server";

const opts = { db: db as any, sessionSecret: process.env.SESSION_SECRET };
export const loader = makeAdminUsersLoader(opts);
export const action = makeAdminUsersAction(opts);

export default function Users() {
  return <AdminUsers />;
}
