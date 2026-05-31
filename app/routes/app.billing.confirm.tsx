import { useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useFetcher, useNavigate } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";
import prisma from "../db.server";
import { getIsTestStore } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const isTest = await getIsTestStore(admin);

  try {
    const { appSubscriptions } = await billing.check({
      plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
      isTest,
    });

    const activePlan = appSubscriptions.some((s: any) => s.name === BILLING_PLAN_PRO)
      ? "pro"
      : appSubscriptions.some((s: any) => s.name === BILLING_PLAN_BASIC)
      ? "basic"
      : null;

    if (!activePlan) {
      return { status: "declined", message: "No active subscription found. You may have declined the charge, or approval is still pending. Please return to the billing page and select a plan to continue." };
    }

    await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: { plan: activePlan as any },
    });

    return { status: "success", plan: activePlan };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[BillingConfirm] billing.check failed:", message);
    return { status: "error", message };
  }
};

export default function BillingConfirmPage() {
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  // Auto-submit on mount to verify the subscription
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.submit({}, { method: "post" });
    }
  }, []);

  // Redirect on success
  useEffect(() => {
    if (fetcher.data?.status === "success") {
      const timer = setTimeout(() => navigate("/app"), 2000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.data, navigate]);

  const status = fetcher.data?.status;
  const isLoading = !fetcher.data || fetcher.state !== "idle";

  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 40, maxWidth: 420 }}>
        {isLoading && (
          <>
            <div style={{
              width: 56, height: 56, border: "4px solid #e1e3e5", borderTopColor: "#008060",
              borderRadius: "50%", margin: "0 auto 20px",
              animation: "spin 0.8s linear infinite",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#111827", margin: "0 0 6px" }}>Confirming your subscription…</p>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Please wait a moment.</p>
          </>
        )}

        {status === "success" && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", background: "#008060",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px", fontSize: 28, color: "#fff",
            }}>
              ✓
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 6px" }}>You're all set!</p>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>Redirecting you to the dashboard…</p>
          </>
        )}

        {(status === "declined" || status === "error") && (
          <>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", background: "#fee2e2",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px", fontSize: 28, color: "#dc2626",
            }}>
              ✕
            </div>
            <p style={{ fontSize: 18, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
              {status === "declined" ? "Payment not confirmed" : "Something went wrong"}
            </p>
            <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 6px" }}>
              {fetcher.data?.message ?? "We couldn't verify your subscription."}
            </p>
            {status === "error" && (
              <p style={{ fontSize: 12, color: "#9ca3af", margin: "0 0 20px", fontFamily: "monospace", background: "#f3f4f6", padding: "8px 12px", borderRadius: 6, textAlign: "left" }}>
                {fetcher.data?.message}
              </p>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
              <button onClick={() => navigate("/app/billing")}
                style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "#008060", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                Choose a plan
              </button>
              {status === "error" && (
                <button onClick={() => fetcher.submit({}, { method: "post" })}
                  style={{ padding: "8px 18px", borderRadius: 6, border: "1px solid #d1d5db", background: "#fff", cursor: "pointer", fontSize: 14 }}>
                  Retry check
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
