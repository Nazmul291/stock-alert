import type { CSSProperties } from "react";
import { useShopAwareNavigate } from "../../lib/use-shop-aware-navigate";
import { useDashboardStore } from "../../stores/dashboard-store";
import { AlertSparkline } from "./AlertSparkline";
import { WebhookHealthBar } from "./WebhookHealthBar";

export function InventoryOverviewSection() {
  const navigate = useShopAwareNavigate();
  const plan = useDashboardStore((s) => s.data!.plan);
  const stats = useDashboardStore((s) => s.data!.stats);
  const alertsToday = useDashboardStore((s) => s.data!.alertsToday);

  return (
    <s-section heading="Inventory Overview">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 12, margin: "8px 0" }}>
        {[
          { label: "Tracked", value: stats.totalProducts, color: "#374151", href: stats.totalProducts > 0 ? "/app/products?filter=tracked" : null },
          { label: "In Stock", value: stats.inStock, color: "#059669", href: stats.inStock > 0 ? "/app/products?filter=in_stock" : null },
          { label: "Low Stock", value: stats.lowStock, color: "#d97706", href: stats.lowStock > 0 ? "/app/products?filter=low_stock" : null },
          { label: "Out of Stock", value: stats.outOfStock, color: "#dc2626", href: stats.outOfStock > 0 ? "/app/products?filter=out_of_stock" : null },
          { label: "Hidden", value: stats.hidden, color: "#6b7280", href: null },
          { label: "Deactivated", value: stats.deactivated, color: "#9ca3af", href: null },
          // Only relevant on a plan that can actually hit a product cap —
          // Pro/Enterprise merchants have nothing to upgrade for here.
          ...(plan !== "pro" && plan !== "enterprise"
            ? [{ label: "Requires Pro", value: stats.requiresUpgrade, color: "#4338ca", href: stats.requiresUpgrade > 0 ? "/app/billing" : null }]
            : []),
          { label: "Alerts Today", value: alertsToday, color: alertsToday > 0 ? "#d97706" : "#6b7280", href: alertsToday > 0 ? "/app/alert-history" : null },
          { label: "Analytics", value: "→", color: "#4f46e5", href: "/app/analytics" },
        ].map((s) => {
          const inner = (
            <>
              <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>{s.label}</div>
            </>
          );
          const base: CSSProperties = { background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, textAlign: "center" };
          return s.href ? (
            <div key={s.label} role="button" tabIndex={0} onClick={() => navigate(s.href!)}
              style={{ ...base, display: "block", transition: "border-color .15s", cursor: "pointer" }}
              onMouseOver={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
              onMouseOut={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#9ca3af")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e5e7eb")}
              onKeyDown={(e) => e.key === "Enter" && navigate(s.href!)}
            >
              {inner}
            </div>
          ) : (
            <div key={s.label} style={base}>{inner}</div>
          );
        })}
      </div>
      <AlertSparkline />
      <WebhookHealthBar />
    </s-section>
  );
}
