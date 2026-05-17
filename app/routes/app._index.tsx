import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { format } from "date-fns";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [tracking, settings, setupProgress, recentAlerts] = await Promise.all([
    prisma.inventoryTracking.findMany({ where: { shop }, select: { currentQuantity: true, isHidden: true, inventoryStatus: true } }),
    prisma.storeSettings.findUnique({ where: { shop } }),
    prisma.setupProgress.findUnique({ where: { shop } }),
    prisma.alertHistory.findMany({ where: { shop }, orderBy: { sentAt: "desc" }, take: 10 }),
  ]);

  const threshold = settings?.lowStockThreshold ?? 5;
  const stats = {
    totalProducts: tracking.length,
    outOfStock: tracking.filter((p) => p.currentQuantity === 0).length,
    lowStock: tracking.filter((p) => p.currentQuantity > 0 && p.currentQuantity <= threshold).length,
    inStock: tracking.filter((p) => p.currentQuantity > threshold).length,
    hidden: tracking.filter((p) => p.isHidden).length,
    deactivated: tracking.filter((p) => p.inventoryStatus === "deactivated").length,
  };

  const storeSession = await prisma.session.findFirst({ where: { shop, isOnline: false } });

  const setupSteps = [
    setupProgress?.appInstalled ?? true,
    setupProgress?.globalSettingsConfigured ?? false,
    setupProgress?.notificationsConfigured ?? false,
  ];
  const progressPct = Math.round((setupSteps.filter(Boolean).length / setupSteps.length) * 100);

  return {
    shop,
    plan: storeSession?.plan ?? "free",
    stats,
    setupProgress,
    progressPct,
    recentAlerts: recentAlerts.map((a) => ({
      id: a.id,
      productTitle: a.productTitle,
      alertType: a.alertType,
      sentAt: a.sentAt.toISOString(),
    })),
    notificationEmail: settings?.notificationEmail ?? null,
  };
};

export default function Dashboard() {
  const { shop, plan, stats, setupProgress, progressPct, recentAlerts, notificationEmail } =
    useLoaderData<typeof loader>();

  return (
    <s-page heading="Dashboard" sub-heading="Monitor your inventory and alerts">
      <s-button slot="primary-action" href="/app/products">
        Manage Products
      </s-button>

      {/* Setup progress */}
      {progressPct < 100 && (
        <s-section heading="Setup Progress">
          <s-paragraph>Complete these steps to start monitoring your inventory automatically.</s-paragraph>
          <div style={{ margin: "12px 0" }}>
            <div style={{ background: "#e5e7eb", borderRadius: 4, height: 8 }}>
              <div style={{ background: "#667eea", borderRadius: 4, height: 8, width: `${progressPct}%`, transition: "width .3s" }} />
            </div>
            <p style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{progressPct}% complete</p>
          </div>
          <s-unordered-list>
            <s-list-item>
              {setupProgress?.appInstalled ? "✅" : "⬜"} App Installed
            </s-list-item>
            <s-list-item>
              {setupProgress?.globalSettingsConfigured ? "✅" : "⬜"} Global Settings Configured
            </s-list-item>
            <s-list-item>
              {setupProgress?.notificationsConfigured ? "✅" : "⬜"} Notifications Set Up
            </s-list-item>
          </s-unordered-list>
        </s-section>
      )}

      {/* Inventory stats */}
      <s-section heading="Inventory Overview">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, margin: "8px 0" }}>
          {[
            { label: "Total", value: stats.totalProducts, color: "#374151" },
            { label: "In Stock", value: stats.inStock, color: "#059669" },
            { label: "Low Stock", value: stats.lowStock, color: "#d97706" },
            { label: "Out of Stock", value: stats.outOfStock, color: "#dc2626" },
            { label: "Hidden", value: stats.hidden, color: "#6b7280" },
            { label: "Deactivated", value: stats.deactivated, color: "#9ca3af" },
          ].map((s) => (
            <div key={s.label} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </s-section>

      {/* Recent alerts */}
      <s-section heading="Recent Alerts">
        {recentAlerts.length === 0 ? (
          <s-paragraph>No alerts yet — alerts will appear here when inventory thresholds are triggered.</s-paragraph>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recentAlerts.map((alert) => (
              <div key={alert.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 6, padding: "10px 14px" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{alert.productTitle ?? "Unknown Product"}</div>
                  <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {alert.alertType === "low_stock" && "Low Stock Alert"}
                    {alert.alertType === "out_of_stock" && "Out of Stock Alert"}
                    {alert.alertType === "restock" && "Back in Stock"}
                  </div>
                </div>
                <span style={{
                  fontSize: 12, padding: "2px 8px", borderRadius: 12, fontWeight: 500,
                  background: alert.alertType === "out_of_stock" ? "#fee2e2" : alert.alertType === "low_stock" ? "#fef3c7" : "#d1fae5",
                  color: alert.alertType === "out_of_stock" ? "#991b1b" : alert.alertType === "low_stock" ? "#92400e" : "#065f46",
                }}>
                  {format(new Date(alert.sentAt), "MMM d, h:mm a")}
                </span>
              </div>
            ))}
          </div>
        )}
      </s-section>

      {/* Store info */}
      <s-section heading="Store Information" slot="aside">
        <s-paragraph><strong>Shop:</strong> {shop}</s-paragraph>
        <s-paragraph>
          <strong>Plan:</strong>{" "}
          <span style={{ background: plan === "pro" ? "#d1fae5" : "#dbeafe", color: plan === "pro" ? "#065f46" : "#1e40af", padding: "1px 8px", borderRadius: 12, fontSize: 12 }}>
            {plan === "pro" ? "Professional" : "Free"}
          </span>
        </s-paragraph>
        {notificationEmail && <s-paragraph><strong>Alert Email:</strong> {notificationEmail}</s-paragraph>}
      </s-section>

      {/* Quick actions */}
      <s-section heading="Quick Actions" slot="aside">
        <s-stack direction="block" gap="base">
          <s-button href="/app/products" variant="primary">Sync Products</s-button>
          <s-button href="/app/settings">Configure Settings</s-button>
          {plan !== "pro" && <s-button href="/app/billing" variant="primary">Upgrade to Pro</s-button>}
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
