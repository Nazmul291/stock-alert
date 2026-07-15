import type { LoaderFunctionArgs } from "react-router";
import { getAllBlogPosts } from "../lib/blog-posts.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const appUrl = process.env.SHOPIFY_APP_URL || url.origin;

  const pages: { path: string; lastmod?: string }[] = [
    { path: "/" },
    { path: "/privacy" },
    { path: "/terms" },
    { path: "/blog" },
    ...getAllBlogPosts().map((post) => ({ path: `/blog/${post.handle}`, lastmod: post.updatedAt })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    ({ path, lastmod }) => `  <url>
    <loc>${appUrl}${path}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ""}
  </url>`,
  )
  .join("\n")}
</urlset>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml" },
  });
};
