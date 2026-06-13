export const PRODUCT_METAFIELDS_QUERY = `
  query getProductMetafields($id: ID!) {
    product(id: $id) {
      customThreshold: metafield(namespace: "stock_alert", key: "custom_threshold") { id value }
      autoHide: metafield(namespace: "stock_alert", key: "auto_hide") { id value }
      autoRepublish: metafield(namespace: "stock_alert", key: "auto_republish") { id value }
    }
  }
`;
