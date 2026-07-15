import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import { getAllBlogPosts, readingMinutes } from "../lib/blog-posts.server";

const TITLE = "Blog — Inventory & Stockout Prevention Tips for Shopify Merchants | Stock Alert";
const DESCRIPTION =
  "Practical guides on Shopify inventory management, stockout prevention, and back-in-stock strategy — from the team behind Stock Alert.";

// Static content — cache aggressively, same rationale as the landing page.
export const headers: HeadersFunction = () => ({
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
});

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  const posts = getAllBlogPosts().map((post) => ({
    handle: post.handle,
    title: post.title,
    description: post.description,
    publishedAt: post.publishedAt,
    minutes: readingMinutes(post),
  }));
  return { appUrl, posts };
};

export const meta: MetaFunction<typeof loader> = ({ loaderData }) => {
  const appUrl = loaderData?.appUrl ?? "https://stock-alert.nazmulcodes.org";
  const url = `${appUrl}/blog`;
  return [
    { title: TITLE },
    { name: "description", content: DESCRIPTION },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:type", content: "website" },
    { property: "og:title", content: TITLE },
    { property: "og:description", content: DESCRIPTION },
    { property: "og:url", content: url },
    { property: "og:image", content: `${appUrl}/logo.png` },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: TITLE },
    { name: "twitter:description", content: DESCRIPTION },
    { name: "twitter:image", content: `${appUrl}/logo.png` },
  ];
};

export default function BlogIndex() {
  const { appUrl, posts } = useLoaderData<typeof loader>();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Stock Alert Blog",
    url: `${appUrl}/blog`,
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      datePublished: post.publishedAt,
      url: `${appUrl}/blog/${post.handle}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <div className="sa-blogHero">
        <h1>Stock Alert Blog</h1>
        <p>Inventory management, stockout prevention, and back-in-stock strategy for Shopify merchants.</p>
      </div>

      <div className="sa-blogList">
        {posts.map((post) => (
          <a key={post.handle} className="sa-blogCard" href={`/blog/${post.handle}`}>
            <h2>{post.title}</h2>
            <p>{post.description}</p>
            <span className="sa-blogCardMeta">
              {new Date(post.publishedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              {" · "}
              {post.minutes} min read
            </span>
          </a>
        ))}
      </div>
    </>
  );
}
