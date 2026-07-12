import { Form } from "react-router";
import type { BackInStockData } from "../lib/back-in-stock-data.server";

export function BackInStockProductGroups({ productGroups }: { productGroups: BackInStockData["productGroups"] }) {
  return (
    <div style={{ marginTop: 24 }}>
      <s-section heading="Subscribers by Product">
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          {productGroups.map((g, i) => (
            <div
              key={g.productId}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: i % 2 === 0 ? "#fff" : "#f9fafb",
                borderBottom: i < productGroups.length - 1 ? "1px solid #f3f4f6" : "none",
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#111827" }}>
                  {g.productTitle ?? `Product #${g.productId}`}
                </div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                  ID: {g.productId}
                  {g.expectedRestockDate && (
                    <span style={{ marginLeft: 10, color: "#059669", fontWeight: 500 }}>
                      · Expected back:{" "}
                      {new Date(g.expectedRestockDate + "T00:00:00").toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#4f46e5" }}>{g.count}</span>
                <Form
                  method="post"
                  onSubmit={(e) => {
                    if (!confirm(`Remove all ${g.count} subscriber(s) for this product?`))
                      e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="clear_product" />
                  <input type="hidden" name="productId" value={g.productId} />
                  <button
                    type="submit"
                    style={{
                      fontSize: 12,
                      padding: "3px 10px",
                      borderRadius: 6,
                      border: "1px solid #fca5a5",
                      background: "#fee2e2",
                      color: "#991b1b",
                      cursor: "pointer",
                    }}
                  >
                    Clear
                  </button>
                </Form>
              </div>
            </div>
          ))}
        </div>
      </s-section>
    </div>
  );
}
