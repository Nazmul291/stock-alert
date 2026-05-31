import { authenticate } from "../shopify.server";

type AdminClient = Awaited<ReturnType<typeof authenticate.admin>>["admin"];

export async function getIsTestStore(admin: AdminClient): Promise<boolean> {
  if (process.env.TEST_PAYMENT === "true") return true; // force test mode override
  try {
    const res = await admin.graphql(
      `#graphql
      query { shop { plan { partnerDevelopment } } }`,
    );
    const data = await res.json();
    return data.data?.shop?.plan?.partnerDevelopment === true;
  } catch {
    return false;
  }
}
