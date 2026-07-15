import type { LoaderFunctionArgs } from "react-router";
import { getAllBlogPosts } from "../lib/blog-posts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;

  const pages = [
    "/",
    "/privacy",
    "/terms",
    "/blog",
    ...getAllBlogPosts().map((post) => `/blog/${post.handle}`),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (path) => `  <url>
    <loc>${appUrl}${path}</loc>
  </url>`,
  )
  .join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
};
