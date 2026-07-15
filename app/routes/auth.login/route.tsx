import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";

import { login } from "../../shopify.server";
import { loginErrorMessage } from "./error.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  const url = new URL(request.url);
  const hasShopParam = url.searchParams.has("shop");
  return { errors, hasShopParam };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const errors = loginErrorMessage(await login(request));
  return { errors, hasShopParam: false };
};

export default function Auth() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [shop, setShop] = useState("");
  const { errors } = actionData || loaderData;
  const hasShopParam = loaderData.hasShopParam;

  // When no shop param is present, merchants have reached this page outside of
  // the normal App Store install flow. Guide them to install from the App Store.
  if (!hasShopParam && !actionData) {
    return (
      <AppProvider embedded={false}>
        <s-page heading="Stock Alert">
          <s-section heading="Install from the Shopify App Store">
            <p style={{ marginBottom: 16, color: "#374151" }}>
              Stock Alert must be installed through the Shopify App Store. Click the button below to go to the listing, then click <strong>Install</strong>.
            </p>
            <s-button
              variant="primary"
              href="https://apps.shopify.com/stock-alert-4"
              target="_blank"
              // @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type
              suppressHydrationWarning
            >
              Go to App Store listing
            </s-button>
            <p style={{ marginTop: 24, fontSize: 13, color: "#9ca3af" }}>
              Already have a store and want to re-install? Enter your shop domain below.
            </p>
            <Form method="post" style={{ marginTop: 8 }}>
              <s-text-field
                name="shop"
                label="Shop domain"
                details="example.myshopify.com"
                value={shop}
                onChange={(e: { currentTarget: { value: string } }) => setShop(e.currentTarget.value)}
                autocomplete="on"
                error={errors.shop}
              ></s-text-field>
              {/* @ts-expect-error — suppressHydrationWarning is valid at runtime but missing from Button's generated JSX type */}
              <s-button type="submit" suppressHydrationWarning>Log in</s-button>
            </Form>
          </s-section>
        </s-page>
      </AppProvider>
    );
  }

  return (
    <AppProvider embedded={false}>
      <s-page>
        <Form method="post">
          <s-section heading="Log in">
            <s-text-field
              name="shop"
              label="Shop domain"
              details="example.myshopify.com"
              value={shop}
              onChange={(e: { currentTarget: { value: string } }) => setShop(e.currentTarget.value)}
              autocomplete="on"
              error={errors.shop}
            ></s-text-field>
            <s-button type="submit">Log in</s-button>
          </s-section>
        </Form>
      </s-page>
    </AppProvider>
  );
}
