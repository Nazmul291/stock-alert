import AdminLogout, { makeLogoutAction } from "@nazmulcodes/shopify-admin-and-support-chat/routes/admin/logout";

export const action = makeLogoutAction({ sessionSecret: process.env.SESSION_SECRET });
export default AdminLogout;
