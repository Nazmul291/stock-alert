import type { HeadersFunction, LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

import { BlogContent } from "../components/blog/BlogContent";
import { getBlogPost, readingMinutes } from "../lib/blog-posts.server";

const APP_NAME = "Stock Alert";
const APP_STORE_URL = "https://apps.shopify.com/stock-alert-4";

export const headers: HeadersFunction = () => ({
  "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
});

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
  const post = getBlogPost(params.handle ?? "");

  if (!post) {
    throw new Response("Not Found", { status: 404 });
  }

  return { appUrl, post, minutes: readingMinutes(post) };
};

export const meta: MetaFunction<typeof loader> = ({ data }) => {
  if (!data) {
    return [{ title: "Post Not Found — Stock Alert" }, { name: "robots", content: "noindex" }];
  }
  const { appUrl, post } = data;
  const url = `${appUrl}/blog/${post.handle}`;
  const title = `${post.title} | Stock Alert`;
  return [
    { title },
    { name: "description", content: post.description },
    { tagName: "link", rel: "canonical", href: url },
    { property: "og:type", content: "article" },
    { property: "og:title", content: post.title },
    { property: "og:description", content: post.description },
    { property: "og:url", content: url },
    { property: "og:image", content: `${appUrl}/logo.png` },
    { property: "article:published_time", content: post.publishedAt },
    { property: "article:modified_time", content: post.updatedAt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: post.title },
    { name: "twitter:description", content: post.description },
    { name: "twitter:image", content: `${appUrl}/logo.png` },
  ];
};

export default function BlogPost() {
  const { appUrl, post, minutes } = useLoaderData<typeof loader>();
  const url = `${appUrl}/blog/${post.handle}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: APP_NAME },
    publisher: {
      "@type": "Organization",
      name: APP_NAME,
      logo: { "@type": "ImageObject", url: `${appUrl}/logo.png` },
    },
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: appUrl },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${appUrl}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  };

  return (
    <article className="sa-blogArticle">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <a className="sa-blogBack" href="/blog">
        ← Back to Blog
      </a>

      <div className="sa-blogArticleHeader">
        <h1>{post.title}</h1>
        <div className="sa-blogMeta">
          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </time>
          {" · "}
          {minutes} min read
        </div>
      </div>

      <div className="sa-blogBody">
        <BlogContent blocks={post.blocks} />
      </div>

      <div className="sa-blogCta">
        <p>Stop losing sales to stockouts — get instant alerts the moment inventory runs low.</p>
        <a className="sa-blogCtaButton" href={APP_STORE_URL} target="_blank" rel="noopener noreferrer">
          Add Stock Alert to Shopify
        </a>
      </div>
    </article>
  );
}

export function ErrorBoundary() {
  return (
    <div className="sa-blogNotFound">
      <h1>Post not found</h1>
      <p>The article you're looking for doesn't exist or may have been moved.</p>
      <a className="sa-blogCtaButton" href="/blog">
        Back to Blog
      </a>
    </div>
  );
}
