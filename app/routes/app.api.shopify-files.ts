import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

const FILES_QUERY = `#graphql
  query GetImageFiles($cursor: String, $query: String) {
    files(first: 24, after: $cursor, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        ... on MediaImage {
          __typename
          id
          mimeType
          image {
            url
            width
            height
            altText
          }
        }
      }
    }
  }
`;

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/svg+xml", "image/webp"]);

type FileNode = {
  __typename: string;
  id: string;
  mimeType: string | null;
  image: { url: string; width: number | null; height: number | null; altText: string | null } | null;
};
type FilesQueryResponse = {
  data?: {
    files: {
      pageInfo: { hasNextPage: boolean; endCursor: string | null };
      nodes: FileNode[];
    };
  };
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") || null;
  const search = url.searchParams.get("search") || "";

  const queryStr = ["media_type:IMAGE", search ? `filename:*${search}*` : ""].filter(Boolean).join(" ");

  const res = await admin.graphql(FILES_QUERY, { variables: { cursor, query: queryStr } });
  const json: FilesQueryResponse = await res.json();
  const filesData = json.data?.files;

  const nodes = (filesData?.nodes ?? []).filter(
    (n) => n.__typename === "MediaImage" && ALLOWED_MIME.has(n.mimeType ?? ""),
  );

  return Response.json({
    files: nodes.map((n) => ({
      id: n.id,
      url: n.image?.url ?? "",
      width: n.image?.width ?? null,
      height: n.image?.height ?? null,
      altText: n.image?.altText ?? "",
      mimeType: n.mimeType ?? "",
    })),
    hasNextPage: filesData?.pageInfo?.hasNextPage ?? false,
    endCursor: filesData?.pageInfo?.endCursor ?? null,
  });
};
