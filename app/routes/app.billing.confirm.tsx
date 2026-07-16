import { useEffect } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs, HeadersFunction } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, BILLING_PLAN_BASIC, BILLING_PLAN_PRO, BILLING_PLAN_ENTERPRISE } from "../shopify.server";
import prisma from "../db.server";
import type { Plan } from "@prisma/client";
import { getIsTestStore } from "../services/billing.server";
import { invalidateShopCache } from "../lib/shop-cache.server";
import { invalidateBillingCache } from "../services/billing.server";
import { useShopAwareNavigate } from "../lib/use-shop-aware-navigate";
import { BillingConfirmStatus } from "../components/billing/BillingConfirmStatus";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const intendedPlan = url.searchParams.get("intendedPlan");
  return {
    intendedPlan:
      intendedPlan === "basic" || intendedPlan === "pro" || intendedPlan === "enterprise" ? intendedPlan : null,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { billing, admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const isTest = await getIsTestStore(admin, shop);
  const form = await request.formData();
  const intendedPlan = form.get("intendedPlan") as string | null;

  try {
    const { appSubscriptions } = await billing.check({
      plans: [BILLING_PLAN_BASIC, BILLING_PLAN_PRO, BILLING_PLAN_ENTERPRISE],
      isTest,
    });

    if (appSubscriptions.length === 0) {
      return { status: "declined", message: "No active subscription found. You may have declined the charge, or approval is still pending. Please return to the billing page and select a plan to continue." };
    }

    // Normally there's exactly one active subscription. But since the old
    // plan is only cancelled here (not before redirecting to Shopify's
    // approval screen — see app.billing._index.tsx), a merchant switching
    // plans can briefly have both the old and the just-approved new one
    // active at once. Prefer whichever one matches what they just chose;
    // fall back to Enterprise > Pro > Basic (highest tier first) if that's
    // ambiguous (e.g. this page reloaded without the query param).
    const intendedName =
      intendedPlan === "enterprise"
        ? BILLING_PLAN_ENTERPRISE
        : intendedPlan === "pro"
        ? BILLING_PLAN_PRO
        : intendedPlan === "basic"
        ? BILLING_PLAN_BASIC
        : null;
    const confirmed =
      appSubscriptions.find((s) => s.name === intendedName) ??
      appSubscriptions.find((s) => s.name === BILLING_PLAN_ENTERPRISE) ??
      appSubscriptions.find((s) => s.name === BILLING_PLAN_PRO) ??
      appSubscriptions.find((s) => s.name === BILLING_PLAN_BASIC);

    if (!confirmed) {
      return { status: "declined", message: "No active subscription found. You may have declined the charge, or approval is still pending. Please return to the billing page and select a plan to continue." };
    }

    const activePlan: Plan =
      confirmed.name === BILLING_PLAN_ENTERPRISE ? "enterprise" : confirmed.name === BILLING_PLAN_PRO ? "pro" : "basic";

    // Cancel any other still-active subscription (the one this plan switch
    // was meant to replace) now that the new one is confirmed active.
    await Promise.all(
      appSubscriptions
        .filter((s) => s.id !== confirmed.id)
        .map((s) => billing.cancel({ subscriptionId: s.id, isTest, prorate: false }).catch(() => {})),
    );

    await prisma.session.updateMany({
      where: { shop, isOnline: false },
      data: { plan: activePlan },
    });
    // Evict both cache layers so the next /app load sees hasActivePayment=true.
    // invalidateShopCache covers Redis + shop-cache memoryFallback;
    // invalidateBillingCache covers billing.server.ts's separate in-process memCache.
    invalidateShopCache(shop);
    invalidateBillingCache(shop);

    return { status: "success", plan: activePlan };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[BillingConfirm] billing.check failed:", message);
    return { status: "error", message };
  }
};

export default function BillingConfirmPage() {
  const { intendedPlan } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useShopAwareNavigate();

  // Auto-submit on mount to verify the subscription
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.submit({ intendedPlan: intendedPlan ?? "" }, { method: "post" });
    }
  }, []);

  // Redirect on success
  useEffect(() => {
    if (fetcher.data?.status === "success") {
      const timer = setTimeout(() => navigate("/app"), 2000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.data, navigate]);

  const isLoading = !fetcher.data || fetcher.state !== "idle";
  const status: "loading" | "success" | "declined" | "error" =
    isLoading ? "loading" : fetcher.data?.status === "success" ? "success" : fetcher.data?.status === "declined" ? "declined" : "error";

  return (
    <div style={{ minHeight: "100vh", background: "#f6f6f7", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <BillingConfirmStatus
        status={status}
        message={fetcher.data?.message}
        onChoosePlan={() => navigate("/app/billing")}
        onRetry={() => fetcher.submit({ intendedPlan: intendedPlan ?? "" }, { method: "post" })}
      />
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => boundary.headers(headersArgs);
