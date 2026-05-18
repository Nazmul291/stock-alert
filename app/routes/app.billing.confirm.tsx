import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useEffect } from "react-router";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return {};
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    const { appSubscriptions } = await billing.check({
      plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO],
      isTest: process.env.TEST_PAYMENT === "true",
    });

    const activePlan = appSubscriptions.some((s: any) => s.name === BILLING_PLAN_PRO)
      ? "pro"
      : appSubscriptions.some((s: any) => s.name === BILLING_PLAN_BASIC)
      ? "basic"
      : null;

    if (!activePlan) {
      return { status: "declined" };
    }

    await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: { plan: activePlan as any },
    });

    return { status: "success", plan: activePlan };
  } catch {
    return { status: "error" };
  }
};

export default function BillingConfirmPage() {
  const fetcher = useFetcher<typeof action>();

  // Auto-submit on mount to verify the subscription
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.submit({}, { method: "post" });
    }
  }, []);

  // Redirect on success
  useEffect(() => {
    if (fetcher.data?.status === "success") {
      const timer = setTimeout(() => {
        window.location.href = "/app";
      }, 2000);
      return () => clearTimeout(timer);
    }
    if (fetcher.data?.status === "declined") {
      window.location.href = "/app/billing?declined=1";
    }
  }, [fetcher.data]);

  const isSuccess = fetcher.data?.status === "success";
  const isLoading = !fetcher.data || fetcher.state !== "idle";

  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", padding: 40 }}>
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

        {isSuccess && (
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
      </div>
    </div>
  );
}
