import {
  AdminDashboard,
  makeAdminDashboardLoader,
} from "@nazmul-hawlader/shopify-admin-and-support-chat/routes/admin/dashboard";
import db from "~/db.server";

export const loader = makeAdminDashboardLoader({
  sessionSecret: process.env.SESSION_SECRET,
  getData: async () => ({
    chatStats: {
      openChats:       await db.chatConversation.count({ where: { status: "OPEN" } }),
      totalChats:      await db.chatConversation.count(),
      activeAgents:    await db.adminUser.count({ where: { role: "SUPPORT_AGENT", isActive: true } }),
      totalAdminUsers: await db.adminUser.count(),
    },
    statGroups: [
      {
        title: "Overview",
        stats: [{ label: "Example metric", value: 42, accent: true }],
      },
    ],
  }),
});

export default function Dashboard() {
  return <AdminDashboard />;
}
