import {
  AdminDashboard,
  makeAdminDashboardLoader,
} from "@nazmulcodes/shopify-admin-and-support-chat/routes/admin/dashboard";
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
        stats: [
          { label: "Tracked Products", value: await db.inventoryTracking.count({ where: { monitoringEnabled: true } }), accent: true },
          { label: "Alerts (30d)", value: await db.alertHistory.count({ where: { sentAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }) },
          { label: "Active Stores", value: await db.session.count({ where: { isOnline: false } }) },
        ],
      },
    ],
  }),
});

export default function Dashboard() {
  return <AdminDashboard />;
}
