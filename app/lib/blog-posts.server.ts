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
  {
    handle: "back-in-stock-notifications-recover-lost-sales",
    title: "Back-in-Stock Notifications: The Underrated Feature That Recovers Lost Sales",
    description:
      "Sold-out pages don't have to be dead ends. See why customers rarely come back on their own, and how a shopify back in stock notification system turns high-intent shoppers into recovered sales.",
    publishedAt: "2026-07-17",
    updatedAt: "2026-07-17",
    blocks: [
      {
        type: "p",
        text: "A customer lands on your product page ready to buy. Wrong size, wrong color, doesn't matter — the item is sold out, and there's nothing on the page inviting them to do anything but leave. So they leave.",
      },
      {
        type: "p",
        text: "Most Shopify merchants treat this moment as a lost cause. It isn't. It's actually one of the highest-intent moments in your entire funnel — a shopper who already decided to buy is standing at your door, and the only thing missing is a way for them to raise their hand. A **shopify back in stock notification** system turns that dead end into a queued-up sale. Here's why it works, and how to set it up so it actually converts.",
      },
      { type: "h2", text: "Why Shoppers Don't Come Back On Their Own" },
      {
        type: "p",
        text: "It's tempting to assume interested customers will just check back later. In practice, almost none of them do.",
      },
      {
        type: "p",
        text: "Think about your own shopping behavior: how many out-of-stock product pages have you bookmarked, or set a calendar reminder to revisit? Almost none. The moment a shopper hits “sold out,” their buying momentum breaks, and momentum is fragile. They don't file your product away for later — they open a new tab, search the same product on a competitor's site, or simply forget the idea entirely.",
      },
      {
        type: "p",
        text: "A few things make this worse:",
      },
      {
        type: "ul",
        items: [
          "There's no natural trigger to remind them. Unlike an abandoned cart (which can be nudged with an email a few hours later), a sold-out page visit often isn't tracked or followed up on at all.",
          "Attention is the scarcest resource in ecommerce. If a shopper found your product through an ad, an influencer post, or a search result, that context — and their motivation — evaporates the second they close the tab.",
          "Every day the product stays unavailable is a day a competitor's ad, email, or organic listing might catch that same shopper first.",
        ],
      },
      {
        type: "p",
        text: "Without a mechanism to close the loop, an out-of-stock page isn't a pause in the sale. It's the end of it.",
      },
      { type: "h2", text: "The Psychology of “Notify Me” Signups" },
      {
        type: "p",
        text: "This is what makes back-in-stock signups so effective: they capture intent at the exact peak moment, before it decays.",
      },
      {
        type: "p",
        text: "When someone hits “sold out” and immediately sees a “Notify Me When Available” option, three psychological things happen at once:",
      },
      {
        type: "ol",
        items: [
          "**It validates the decision they already made.** They don't have to re-decide whether they want the product — they already did that. The form just asks them to wait, not to reconsider.",
          "**It's a low-friction micro-commitment.** Typing an email address takes five seconds and feels almost inconsequential compared to a purchase — which is exactly why conversion on these forms tends to be high relative to almost any other on-site signup.",
          "**It creates a personal restock event.** A generic “back in stock” social post competes with everything else in someone's feed. A direct notification, sent specifically because they asked for it, doesn't have to compete with anything — it lands in their inbox as a message meant just for them, at the moment they're most likely to act on it.",
        ],
      },
      {
        type: "p",
        text: "In short, “Notify Me” doesn't ask a shopper to want your product. It asks them to hold onto a want they already have. That's a much easier ask — and it's why these signups convert to actual purchases at a meaningfully higher rate than most other email capture methods on a store.",
      },
      { type: "h2", text: "Where to Place Signup Forms for Maximum Conversion" },
      {
        type: "p",
        text: "A back-in-stock form only works if shoppers actually see it at the right moment. Placement matters as much as the feature itself.",
      },
      { type: "h3", text: "On the Product Page Itself" },
      {
        type: "p",
        text: "This is non-negotiable. The moment “Add to Cart” becomes unavailable, a “Notify Me When Available” form should appear in that same visual space — not buried in a tab, not below the fold. The shopper's eyes are already on that button; replace it, don't relocate the ask.",
      },
      { type: "h3", text: "Per-Variant, Not Just Per-Product" },
      {
        type: "p",
        text: "If a product has ten variants and only the size Large is sold out, don't just mark the whole product unavailable — let shoppers sign up for the specific variant they wanted. A blanket “email me” on a mostly-in-stock product creates noise and sends irrelevant restock alerts to people who never wanted that particular variant.",
      },
      { type: "h3", text: "Collection and Search Pages" },
      {
        type: "p",
        text: "Sold-out items still show up in collection grids and search results. A small “Notify Me” badge or tag on the product card — instead of a plain “Sold Out” label — keeps that page from being a dead end for shoppers who never even clicked through.",
      },
      { type: "h3", text: "Confirm the Signup Immediately" },
      {
        type: "p",
        text: "A short confirmation (“We'll email you the second this is back”) reduces the anxiety of “did that actually work?” and reinforces that the shopper made a smart move by signing up instead of leaving.",
      },
      { type: "h2", text: "Manual Restocking Communication vs. Automated Notifications" },
      {
        type: "p",
        text: "Plenty of merchants still handle restocks the old way: post on Instagram, send a blast email to the full list, hope the right people see it. It's better than nothing, but it has real limits compared to an automated shopify back in stock notification system.",
      },
      {
        type: "ul",
        items: [
          "**Reach** — a manual social post or blast email only reaches people currently following or subscribed and online at that moment; automated alerts reach every shopper who specifically asked for that product.",
          "**Relevance** — a blast sends the same message to everyone regardless of interest; automated alerts go only to people who wanted that exact item.",
          "**Timing** — manual posts go out whenever you remember to post; automated alerts fire instantly, the moment inventory updates.",
          "**Effort** — manual communication takes fresh work every single restock; automated alerts are set up once and run on their own.",
          "**Signal strength** — a blast competes with everything else in a feed or inbox; a personal restock alert arrives as an expected, high-signal message.",
        ],
      },
      {
        type: "p",
        text: "The gap isn't small. A blast email might reach thousands of inboxes and convert a handful of buyers. A targeted back-in-stock alert reaches a much smaller list — but it's a list of people who already decided to buy, which is why it routinely converts at a far higher rate per message sent.",
      },
      { type: "h2", text: "Where Stock Alert Fits In" },
      {
        type: "p",
        text: "Manually tracking which customers wanted which sold-out variant — and remembering to email each one the second it restocks — isn't realistic once you're managing more than a handful of SKUs. Stock Alert handles this automatically: it adds a signup widget to your sold-out product pages, tracks per-variant interest, and fires an instant email the moment that item is back in stock, with no manual list-building or blast emails required.",
      },
      { type: "h2", text: "Turn Your Sold-Out Pages Into a Sales Channel" },
      {
        type: "p",
        text: "Every sold-out product page that doesn't offer a way to reconnect is a sale you're actively choosing to lose. The fix isn't complicated — it's a form in the right place, at the right moment, connected to an automatic message when the moment comes back around.",
      },
      {
        type: "p",
        text: "If you've never added back-in-stock signups to your store, this is the highest-leverage, lowest-effort feature you're not using yet. Add it to your sold-out pages today, and start turning “we'll never know how many sales we missed” into a number you can actually recover.",
      },
    ],
  },
  {
    handle: "right-low-stock-threshold-per-product",
    title: "How to Set the Right Low-Stock Threshold for Every Product in Your Shopify Store",
    description:
      "A single 'low stock at 5 units' rule fails most of your catalog. Learn the factors, a simple formula, and worked examples for setting a proper shopify low stock alert threshold per product.",
    publishedAt: "2026-07-18",
    updatedAt: "2026-07-18",
    blocks: [
      {
        type: "p",
        text: "If you've set a single “alert me when stock hits 5 units” rule for your entire catalog, you've probably already been burned by it — either a bestseller sold out before the alert gave you time to react, or a slow mover sat at “low stock” for months without ever actually running out. A flat threshold feels simple, but it quietly fails almost every product it's supposed to protect. Getting a proper **shopify low stock alert threshold** in place means treating it as a per-product calculation, not a store-wide setting.",
      },
      { type: "h2", text: "Why “Low Stock at 5 Units” Doesn't Work for Your Whole Catalog" },
      {
        type: "p",
        text: "A single threshold assumes every product behaves the same way. In reality, your catalog is full of products with wildly different sales speeds, supplier relationships, and price points — and a rule built for one breaks for the rest.",
      },
      {
        type: "p",
        text: "Consider what a flat “5 units” threshold actually means for two different products:",
      },
      {
        type: "ul",
        items: [
          "A bestseller selling 20 units a day blows past 5 units in a matter of hours. By the time the alert fires, you may already be out of stock — the warning arrives too late to do anything useful.",
          "A slow-moving product selling 1 unit a month sits at “low stock” for weeks, training you to ignore the alert entirely. When every alert looks the same, you stop trusting any of them.",
        ],
      },
      {
        type: "p",
        text: "Both outcomes defeat the purpose of having alerts at all. The first misses the window to reorder. The second creates so much noise that real warnings get lost in it. A useful threshold has to reflect how fast a specific product actually moves — not a number that felt reasonable when you set it once and forgot about it.",
      },
      { type: "h2", text: "The Factors That Should Actually Set Your Threshold" },
      {
        type: "p",
        text: "Instead of one number for everything, base each product's threshold on a handful of factors that genuinely differ across your catalog.",
      },
      { type: "h3", text: "Sales Velocity" },
      {
        type: "p",
        text: "This is the single biggest driver. A product that sells 10 units a day needs a much higher unit threshold than one that sells 1 unit a week — not because it's more “important,” but because it burns through inventory faster and needs more runway to react.",
      },
      { type: "h3", text: "Supplier Lead Time" },
      {
        type: "p",
        text: "If your supplier can restock in 3 days, you don't need much buffer. If it takes 6 weeks to get a container across an ocean, your threshold needs to account for weeks of sales, not days. Lead time is often the most overlooked factor — merchants set thresholds based on how the product sells, but forget how long it takes to actually fix a shortage once the alert fires.",
      },
      { type: "h3", text: "Seasonality" },
      {
        type: "p",
        text: "A product's velocity isn't constant. A swimwear line that sells slowly in October and rapidly in June needs a threshold that flexes with the season, or at minimum, a manual review before your peak period starts. Applying a January threshold to a June sales rate guarantees you'll get blindsided.",
      },
      { type: "h3", text: "Price Point and Margin" },
      {
        type: "p",
        text: "High-margin, high-ticket items usually justify a more conservative (higher) threshold, since a single missed sale is expensive and customers researching a big purchase are less likely to wait around for a restock. Lower-margin, low-price items can tolerate a tighter threshold since the cost of an occasional stockout is smaller relative to the effort of managing tighter inventory buffers on every SKU.",
      },
      { type: "h2", text: "A Simple Formula You Can Use" },
      {
        type: "p",
        text: "You don't need an inventory science degree to get a reasonable number. This formula gets you most of the way there:",
      },
      {
        type: "p",
        text: "**Threshold = (Average Daily Sales × Supplier Lead Time in Days) + Safety Buffer**",
      },
      {
        type: "ul",
        items: [
          "**Average Daily Sales** — pull your last 30-60 days of sales for the product and divide by the number of days. Use a shorter, more recent window for seasonal products.",
          "**Supplier Lead Time** — how many days it actually takes from placing a reorder to having stock available to sell, not just the shipping time — include your own processing and receiving delays.",
          "**Safety Buffer** — an extra cushion (commonly 20-50% of the calculated amount) to absorb demand spikes, supplier delays, or the time it takes you to notice the alert and act on it.",
        ],
      },
      {
        type: "p",
        text: "The result is a threshold that gives you enough runway to reorder before you actually run out — not a round number that happens to look tidy.",
      },
      { type: "h2", text: "Example: Three Products, Three Different Thresholds" },
      {
        type: "p",
        text: "Here's how the formula plays out across products with different profiles:",
      },
      {
        type: "ul",
        items: [
          "**Bestselling t-shirt** — sells 15 units/day, 5-day supplier lead time, moderate buffer. Threshold = (15 × 5) + 25% ≈ 95 units. High velocity demands a high unit threshold, even though it looks like a lot of stock sitting on the shelf.",
          "**Mid-tier accessory** — sells 3 units/day, 10-day lead time, standard buffer. Threshold = (3 × 10) + 30% ≈ 40 units. Slower sales, but a longer lead time still requires meaningful runway.",
          "**Niche/slow-moving item** — sells 0.3 units/day, 14-day lead time, smaller buffer. Threshold = (0.3 × 14) + 20% ≈ 5 units. Low velocity means a low threshold is genuinely appropriate here — this is the one product where “alert at 5” was actually right all along.",
        ],
      },
      {
        type: "p",
        text: "Notice that the three thresholds span nearly a 20x range. That's the whole point: a single store-wide number can only ever be correct for one of these products, and wrong for the other two.",
      },
      { type: "h2", text: "Where Stock Alert Fits In" },
      {
        type: "p",
        text: "Calculating and updating a threshold like this for every SKU by hand doesn't scale past a handful of products. Stock Alert lets you set a sensible global default for your store, then override it per product, per collection, or per tag — so your bestsellers get an early warning while slow movers don't clutter your alerts, all through real-time email and Slack notifications the moment any of those thresholds are crossed.",
      },
      { type: "h2", text: "Set It Once, Trust It Every Time" },
      {
        type: "p",
        text: "The goal of a low-stock threshold isn't to pick a number that looks safe — it's to give yourself enough time to act before a product actually runs out. That time window is different for every product in your catalog, which means your thresholds should be too.",
      },
      {
        type: "p",
        text: "Start with your top 10-20 bestsellers, run them through the formula above, and set thresholds that reflect how each one actually sells. You'll spend a little more time up front, but you'll end up with alerts you can actually trust — instead of ones you've learned to ignore.",
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
