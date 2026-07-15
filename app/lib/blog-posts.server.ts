export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

export interface BlogPost {
  handle: string;
  title: string;
  description: string;
  publishedAt: string;
  updatedAt: string;
  blocks: BlogBlock[];
}

function countWords(blocks: BlogBlock[]): number {
  return blocks.reduce((total, block) => {
    if (block.type === "ul" || block.type === "ol") {
      return total + block.items.join(" ").split(/\s+/).filter(Boolean).length;
    }
    return total + block.text.split(/\s+/).filter(Boolean).length;
  }, 0);
}

export function readingMinutes(post: BlogPost): number {
  return Math.max(1, Math.round(countWords(post.blocks) / 200));
}

const posts: BlogPost[] = [
  {
    handle: "hidden-cost-of-stockouts",
    title: "The Hidden Cost of Stockouts: How Much Revenue Are You Losing to Out-of-Stock Products?",
    description:
      "Stockouts quietly drain Shopify revenue through lost sales, damaged trust, SEO drops, and wasted ad spend. Learn the real cost and a practical shopify stockout prevention checklist.",
    publishedAt: "2026-07-16",
    updatedAt: "2026-07-16",
    blocks: [
      {
        type: "p",
        text: "It's 11:47 PM. A customer has been scrolling your Shopify store for twenty minutes, comparing colors, reading reviews, finally talking themselves into the purchase. They click “Add to Cart” on the exact size and shade they want.",
      },
      {
        type: "p",
        text: "“Out of stock.” No backup option, no “notify me” button, nothing. They close the tab. Maybe they check a competitor's site next. Maybe they forget about you entirely. Either way, that sale — and possibly that customer, for good — just walked away silently, and you probably won't even know it happened until you're digging through analytics weeks later wondering why conversion rates dipped.",
      },
      {
        type: "p",
        text: "This scenario plays out thousands of times a day across Shopify stores, and most merchants have no idea how much it's actually costing them.",
      },
      { type: "h2", text: "What Stockouts Really Cost Retailers" },
      {
        type: "p",
        text: "Out-of-stock products aren't just a minor inconvenience — they're a measurable revenue leak.",
      },
      {
        type: "ul",
        items: [
          "Retail industry research (including studies from IHL Group) has estimated that stockouts cost retailers hundreds of billions of dollars in lost sales globally each year across all channels.",
          "Multiple retail analytics firms have found that a large share of shoppers — often cited around 70% — will simply switch to a competitor's store rather than wait or ask for a substitute when they hit an out-of-stock item online.",
          "It's reasonable to estimate that a store averaging even a 5-10% stockout rate on popular SKUs could be losing a comparable percentage of potential revenue from those specific products — though the exact number depends heavily on your traffic, margins, and how loyal your customers are.",
        ],
      },
      {
        type: "p",
        text: "We want to be transparent here: the first two figures are drawn from broader retail industry research, not Shopify-specific data, and the third is a reasonable estimate rather than a hard statistic. But the direction is consistent across every study on the topic — stockouts quietly bleed revenue, and most merchants underestimate by how much because the loss never shows up as a line item. It shows up as a sale that never happened.",
      },
      { type: "h2", text: "The Ripple Effects Go Way Beyond the Missed Sale" },
      {
        type: "p",
        text: "The immediate lost sale is just the beginning. Stockouts trigger a chain reaction that touches almost every part of your store's performance.",
      },
      { type: "h3", text: "Lost Sales (Obvious, But Bigger Than You Think)" },
      {
        type: "p",
        text: "Every out-of-stock product page is a dead end in your sales funnel. If that product was being actively promoted — via email, social, or paid ads — you're driving traffic straight into a wall.",
      },
      { type: "h3", text: "Erosion of Customer Trust" },
      {
        type: "p",
        text: "Shoppers who hit repeated stockouts on your store start to associate your brand with unreliability. This is especially damaging for repeat customers and subscribers who came back specifically for a product they loved, only to find it perpetually unavailable. Trust, once chipped away, is expensive to rebuild.",
      },
      { type: "h3", text: "SEO Ranking Drops" },
      {
        type: "p",
        text: "This is the one merchants overlook most often. Search engines — and Google in particular — pay attention to page experience and content relevance. A product page that's frequently “out of stock” can:",
      },
      {
        type: "ul",
        items: [
          "Lose organic ranking position over time, especially if Google detects the page consistently fails to fulfill user intent.",
          "Get devalued in Google Shopping and Merchant Center if inventory data isn't synced properly, sometimes resulting in listings being suppressed entirely.",
          "Accumulate a poor engagement signal (high bounce rate, low time-on-page) when visitors land on a dead product page and immediately leave.",
        ],
      },
      {
        type: "p",
        text: "If that page took months to rank, a few weeks of being empty can undo a meaningful chunk of that progress.",
      },
      { type: "h3", text: "Wasted Ad Spend" },
      {
        type: "p",
        text: "This one stings the most because it's so avoidable. If you're running Google Shopping, Meta ads, or retargeting campaigns pointed at a product that goes out of stock, you're paying for clicks that land on a dead end. Best case, the customer bounces. Worst case, Google or Meta flags the poor landing page experience and starts charging you more per click across your account.",
      },
      { type: "h2", text: "A Practical Stockout Prevention Checklist" },
      {
        type: "p",
        text: "Here's what you can start doing today — no complex systems required, just consistent habits.",
      },
      {
        type: "ol",
        items: [
          "**Set low-stock thresholds for every product, not just bestsellers.** Slow movers still cause damage when they're the item a customer specifically wants.",
          "**Get alerted the moment stock drops low — not after it hits zero.** A same-day heads-up gives you time to reorder or pause ads before the shelf goes empty.",
          "**Turn on back-in-stock notifications for customers.** If someone can't buy today, let them raise their hand to buy the moment it's restocked. This alone recovers a meaningful chunk of “lost” demand.",
          "**Pause ads automatically (or manually) on out-of-stock products.** Don't pay to send traffic to a page that can't convert.",
          "**Audit out-of-stock pages weekly.** Check whether they're still indexed, still ranking, and whether you need a redirect, a waitlist, or a restock ETA message.",
          "**Review supplier lead times against your sales velocity.** If a product regularly sells out before your reorder arrives, your reorder point is wrong — fix the threshold, not just the order.",
          "**Don't rely on manually checking Shopify admin.** By the time you notice inventory is low by scrolling through your product list, it's often too late.",
        ],
      },
      { type: "h2", text: "Where a Tool Like Stock Alert Fits In" },
      {
        type: "p",
        text: "Manually checking stock levels across dozens or hundreds of SKUs isn't realistic for most Shopify merchants — which is why real-time monitoring matters so much for shopify stockout prevention. Stock Alert watches your inventory continuously and sends instant email, Slack, or WhatsApp alerts the moment a product runs low or sells out, plus automatic back-in-stock notifications so customers can re-engage the second an item is available again. Plans start at $3.99/month, making it an easy way to close this revenue gap without adding to your daily workload.",
      },
      { type: "h2", text: "Stop Losing Sales You'll Never See in Your Analytics" },
      {
        type: "p",
        text: "The frustrating part about stockout losses is that they're invisible in most reporting — you can't easily pull a report titled “revenue lost to empty shelves.” But the impact is real, and it compounds across lost sales, damaged trust, SEO setbacks, and wasted ad spend every single month you don't have a system in place.",
      },
      {
        type: "p",
        text: "The fix doesn't have to be complicated. Start with the checklist above, and consider putting real-time monitoring in place so you're never the last to know your bestseller just sold out. Your customers — and your ad budget — will thank you.",
      },
    ],
  },
];

export function getAllBlogPosts(): BlogPost[] {
  return [...posts].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function getBlogPost(handle: string): BlogPost | undefined {
  return posts.find((post) => post.handle === handle);
}
