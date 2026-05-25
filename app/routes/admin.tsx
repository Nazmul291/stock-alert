import { AdminLayout, makeAdminLayoutLoader } from "@nazmul-hawlader/shopify-admin-and-support-chat/routes/admin/layout";

export const loader = makeAdminLayoutLoader({
  sessionSecret: process.env.SESSION_SECRET,
});

export default function Layout() {
  return <AdminLayout appName="Stock Alert Admin" primaryColor="#5c6ac4" />;
}
