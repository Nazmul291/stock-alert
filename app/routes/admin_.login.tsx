import {
  AdminLoginPage,
  makeLoginLoader,
  makeLoginAction,
} from "@nazmul-hawlader/shopify-admin-and-support-chat/routes/admin/login";
import db from "~/db.server";

export const loader = makeLoginLoader({ sessionSecret: process.env.SESSION_SECRET });
export const action = makeLoginAction({ db: db.adminUser, sessionSecret: process.env.SESSION_SECRET });

export default function Login() {
  return <AdminLoginPage appName="Stock Alert Admin" />;
}
