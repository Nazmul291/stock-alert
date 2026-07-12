import { Link } from "react-router";

export function ProductsPagination({ after, prevList, pageInfo, buildUrl }: {
  after: string | null;
  prevList: string[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  buildUrl: (params: Record<string, string | null>) => string;
}) {
  const prevPageAfter = prevList[prevList.length - 1] ?? null;
  const prevPagePrev = prevList.slice(0, -1).join(",") || null;
  const nextPagePrev = [prevList.join(","), after].filter(Boolean).join(",") || null;

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
      <span style={{ fontSize: 13, color: "#6b7280" }}>
        {after ? `Page ${prevList.length + 2}` : "Page 1"}
      </span>
      <div style={{ display: "flex", gap: 8 }}>
        {prevList.length > 1 && (
          <Link
            to={buildUrl({ after: null, prev: null })}
            style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}
          >
            ← First
          </Link>
        )}
        {after && (
          <Link
            to={buildUrl({ after: prevPageAfter, prev: prevPagePrev })}
            style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}
          >
            ← Previous
          </Link>
        )}
        {pageInfo.hasNextPage && pageInfo.endCursor && (
          <Link
            to={buildUrl({ after: pageInfo.endCursor, prev: nextPagePrev })}
            style={{ padding: "4px 12px", border: "1px solid #d1d5db", borderRadius: 6, textDecoration: "none", color: "#374151", fontSize: 14 }}
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}
