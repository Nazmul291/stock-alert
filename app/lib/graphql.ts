export const PRODUCT_METAFIELDS_QUERY = `
  query getProductMetafields($id: ID!) {
    product(id: $id) {
      customThreshold: metafield(namespace: "stock_alert", key: "custom_threshold") { id value }
      autoHide: metafield(namespace: "stock_alert", key: "auto_hide") { id value }
      autoRepublish: metafield(namespace: "stock_alert", key: "auto_republish") { id value }
      pricingRule: metafield(namespace: "stock_alert", key: "pricing_rule") { id value }
    }
  }
`;

// Batch lookup for syncLineCostsToShopify (purchase-order.server.ts), which
// needs each PO line's own product's rule, not just the one product shown
// on product-detail.server.ts's single-product query above.
export const PRODUCTS_PRICING_RULES_QUERY = `
  query getProductsPricingRules($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        metafield(namespace: "stock_alert", key: "pricing_rule") { value }
      }
    }
  }
`;

export const INVENTORY_ITEM_UPDATE_MUTATION = `
  mutation inventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
    inventoryItemUpdate(id: $id, input: $input) {
      inventoryItem { id tracked }
      userErrors { field message }
    }
  }
`;

// Used both to check "is this product tracked yet" (product-detail.server.ts's
// untracked fallback) and to re-derive the authoritative variant list when
// saving Configure tab changes — title/status/image are included so the
// untracked fallback has enough to render without a second query.
export const PRODUCT_INVENTORY_QUERY = `
  query getProductInventory($id: ID!) {
    product(id: $id) {
      id
      title
      status
      featuredMedia { preview { image { url altText } } }
      variants(first: 100) {
        edges {
          node {
            id title sku
            inventoryItem {
              id tracked
              inventoryLevels(first: 50) {
                edges {
                  node {
                    location { id name }
                    quantities(names: ["available"]) { name quantity }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const METAFIELDS_SET_MUTATION = `
  mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

export const METAFIELDS_DELETE_MUTATION = `
  mutation metafieldsDelete($metafields: [MetafieldIdentifierInput!]!) {
    metafieldsDelete(metafields: $metafields) {
      deletedMetafields { key namespace ownerId }
      userErrors { field message }
    }
  }
`;
