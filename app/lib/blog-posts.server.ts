export type BlogBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] };

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
    if (block.type === "table") {
      return total + [block.headers, ...block.rows].flat().join(" ").split(/\s+/).filter(Boolean).length;
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
  {
    handle: "inventory-triggered-klaviyo-flows",
    title: "Turning Inventory Events Into Revenue: How to Use Restock Alerts in Your Email Marketing",
    description:
      "Low-stock, out-of-stock, and restock events are some of the highest-intent triggers your email program isn't using. Three klaviyo back in stock flow ideas, with subject lines and logic.",
    publishedAt: "2026-07-19",
    updatedAt: "2026-07-19",
    blocks: [
      {
        type: "p",
        text: "Most Shopify merchants running Klaviyo already have the essentials covered — welcome flows, abandoned cart, post-purchase win-back. But there's a category of trigger sitting right next to those that almost nobody builds around: inventory events. Low stock, out of stock, and restock aren't just operational signals for your own team — they're some of the highest-intent triggers available to your email program, and most stores never wire them into a flow at all.",
      },
      {
        type: "p",
        text: "This is **inventory-triggered marketing**: using real-time stock changes as the event that fires an email, instead of relying only on customer behavior like browsing or cart abandonment. It's underused for a simple reason — most Shopify apps treat inventory alerts as an internal notification (a Slack ping to the merchant), not as marketing data that can flow into Klaviyo. Once inventory events are actually available as a **klaviyo back in stock flow** trigger, a handful of email ideas open up that behavioral triggers alone can't replicate.",
      },
      {
        type: "p",
        text: "Below are three flows worth building, with example subject lines and the logic behind each.",
      },
      { type: "h2", text: "Flow 1: The Back-in-Stock Win-Back" },
      {
        type: "p",
        text: "This is the most obvious inventory-triggered flow, and also the one with the highest conversion rate in most stores — because it targets people who already decided to buy and were only stopped by availability.",
      },
      { type: "h3", text: "The Logic" },
      {
        type: "ul",
        items: [
          "**Trigger** — a “Back in Stock” event fires in Klaviyo for a specific product/variant, scoped to the customer who signed up for that restock alert.",
          "**Segment** — anyone who previously triggered a “back-in-stock signup” event for that exact SKU.",
          "**Send** — immediately, or within minutes — this is a race against your own inventory. If the item is a fast seller, delay kills the flow's effectiveness.",
          "**Follow-up** — a second email 24-48 hours later to anyone who opened but didn't purchase, since the item may still be in stock.",
        ],
      },
      { type: "h3", text: "Example Subject Lines" },
      {
        type: "ul",
        items: [
          "“It's back — [Product Name] just restocked”",
          "“You asked, it's here: [Product Name] is back in stock”",
          "“Still want it? [Product Name] just came back — grab it before it's gone again”",
        ],
      },
      {
        type: "p",
        text: "This flow works because it's not a cold email — it's closing a loop the customer opened themselves. That's why it belongs in the “already warm” category of your flow list, right alongside abandoned cart.",
      },
      { type: "h2", text: "Flow 2: Low-Stock Urgency for VIP Segments" },
      {
        type: "p",
        text: "Most merchants send urgency messaging (“only 3 left!”) to everyone, which trains customers to distrust it the moment they see it applied loosely across the store. A better approach: reserve low-stock urgency emails for your VIP or high-LTV segment, tied to products they've actually shown interest in.",
      },
      { type: "h3", text: "The Logic" },
      {
        type: "ul",
        items: [
          "**Trigger** — a “Low Stock” event fires when a tracked product crosses its threshold.",
          "**Segment** — intersect that product's low-stock event with customers who previously viewed, added-to-cart, or purchased that product (or similar products), filtered further to your VIP segment (top X% by lifetime spend, or a specific purchase-based segment).",
          "**Send** — as soon as the threshold is crossed — this flow only works if it beats the stockout, not follows it.",
          "**Suppress** — anyone who already purchased that product recently, so you're not urging a repeat buyer to rebuy something they just bought.",
        ],
      },
      { type: "h3", text: "Example Subject Lines" },
      {
        type: "ul",
        items: [
          "“Almost gone: [Product Name] is running low”",
          "“A heads-up before this sells out again”",
          "“You loved this — it's about to sell out”",
        ],
      },
      {
        type: "p",
        text: "This flow turns your VIPs' existing interest into a reason to act now, instead of blasting scarcity messaging at your entire list and burning trust in the process.",
      },
      { type: "h2", text: "Flow 3: Pre-Order Capture for Out-of-Stock Hits" },
      {
        type: "p",
        text: "When a product goes fully out of stock — not just low — most merchants either do nothing or manually offer a pre-order option to a handful of email subscribers. This can be systematized instead.",
      },
      { type: "h3", text: "The Logic" },
      {
        type: "ul",
        items: [
          "**Trigger** — an “Out of Stock” event fires for a product.",
          "**Segment** — customers who visited or added-to-cart that product in the days leading up to the stockout — the shoppers who were closest to buying when the shelf went empty.",
          "**Send** — within a day of the stockout, while intent is still fresh, offering either a pre-order link (if your supplier and Shopify setup support it) or a “join the restock list” call to action if pre-orders aren't available.",
          "**Escalate** — if the product stays out of stock past a set window (say, two weeks), send a second email either extending the pre-order window or suggesting a similar in-stock alternative — a reasonable substitute is often better than losing the sale entirely.",
        ],
      },
      { type: "h3", text: "Example Subject Lines" },
      {
        type: "ul",
        items: [
          "“[Product Name] sold out — here's how to get it first”",
          "“Missed it? Reserve yours before the next restock”",
          "“Sold out, but not gone — here's what's next”",
        ],
      },
      {
        type: "p",
        text: "This flow captures demand at the moment it's created (the stockout itself) rather than waiting for the customer to come back and check on their own — which, as any merchant who's watched their analytics knows, most of them never do.",
      },
      { type: "h2", text: "Where Stock Alert Fits In" },
      {
        type: "p",
        text: "Building any of these flows depends on inventory events actually reaching Klaviyo in the first place, which most Shopify inventory apps don't support out of the box. Stock Alert sends low-stock, out-of-stock, and back-in-stock events straight into your Klaviyo account as custom events tied to the relevant customer profile — alongside the Slack and email alerts your own team already relies on — so you can build flows and segments off real inventory changes instead of working around the gap.",
      },
      { type: "h2", text: "Start With One Flow" },
      {
        type: "p",
        text: "You don't need to build all three at once. Pick the back-in-stock win-back first — it's the simplest to set up, targets the warmest possible audience, and typically shows results within the first restock cycle. Once that's live, layer in the VIP low-stock flow, and finally the pre-order capture for full out-of-stock hits.",
      },
      {
        type: "p",
        text: "Inventory events are already happening in your store every day, whether or not your email program knows about it. The only real work is connecting the two — and once they're connected, you're marketing off real-time demand signals instead of guessing.",
      },
    ],
  },
  {
    handle: "shopify-flow-inventory-automations",
    title: "5 Shopify Flow Automations Every Merchant Should Set Up for Inventory Management",
    description:
      "Shopify Flow can react to inventory changes automatically — if it has the right triggers. Five concrete shopify flow inventory automation ideas, with trigger, action, and business value for each.",
    publishedAt: "2026-07-20",
    updatedAt: "2026-07-20",
    blocks: [
      {
        type: "p",
        text: "If you're manually reacting to every low-stock alert, every stockout, and every restock — checking Slack, updating tags, pausing ads by hand — you're doing work that Shopify can already do for you. Shopify Flow lets you turn inventory events into automatic actions, no developer required. Most merchants just haven't connected the two yet.",
      },
      { type: "h2", text: "What Is Shopify Flow?" },
      {
        type: "p",
        text: "Shopify Flow is Shopify's built-in automation tool (included on most paid plans) that works on a simple trigger → condition → action model, similar to Zapier but native to your store. You pick a trigger (something that happens in your store), optionally add conditions (only run this if X is true), and then chain one or more actions (send an email, add a tag, update a product, and more).",
      },
      {
        type: "p",
        text: "The missing piece for most merchants has been the trigger side: Flow ships with triggers for orders, customers, and a handful of other events, but not inventory-level events like “this product just went low stock” or “this variant just restocked.” That's where a **shopify flow inventory automation** setup depends on an app that can fire those specific triggers — once low-stock, out-of-stock, and restock events are available to Flow, you can build any of the automations below without writing a single line of code.",
      },
      {
        type: "p",
        text: "Here are five worth setting up first.",
      },
      { type: "h2", text: "1. Auto-Tag Low-Stock Products" },
      {
        type: "p",
        text: "**Trigger:** a product crosses its low-stock threshold. **Action:** add a tag like `low-stock` to the product. **Business value:** tags are the cheapest way to make low-stock products instantly filterable — in your Shopify admin, in a smart collection, or in a saved search your purchasing team checks each morning. Instead of manually scanning inventory reports, everyone on your team can just filter by tag and see exactly what needs reordering, updated automatically as stock changes.",
      },
      { type: "h3", text: "Bonus: Auto-Remove the Tag on Restock" },
      {
        type: "p",
        text: "Pair this with a second Flow triggered on the restock event that removes the same tag — otherwise your `low-stock` tag list slowly fills with products that quietly got restocked weeks ago and never got cleaned up.",
      },
      { type: "h2", text: "2. Notify a Slack Channel Automatically" },
      {
        type: "p",
        text: "**Trigger:** a product goes out of stock. **Action:** post a message to a dedicated Slack channel (e.g. `#inventory-alerts`). **Business value:** this keeps your whole team — not just whoever happens to be watching the Shopify admin — aware of stockouts in real time. A warehouse manager, a customer support lead, and a marketing person all need to know a product just sold out, for different reasons: one needs to reorder, one needs to handle customer questions, and one needs to pause any ads pointing at that product. A single Flow-triggered Slack post reaches all three at once, instead of relying on one person to manually relay the news.",
      },
      { type: "h2", text: "3. Auto-Pause Ad Campaigns Tied to a Sold-Out Product" },
      {
        type: "p",
        text: "**Trigger:** a product's inventory hits zero. **Action:** if your ad platform connects through a Flow-compatible integration (or via a webhook to a tool like Zapier/Make from within the Flow), pause or lower the budget on campaigns tied to that product. **Business value:** this is one of the highest-ROI automations on this list, because it directly stops wasted spend. Every click on an ad for a sold-out product is money spent sending someone to a dead end. A Flow that catches the stockout the moment it happens — rather than whenever a human notices the ad is still running — can save real budget every single month, especially on fast-moving bestsellers that sell out unpredictably.",
      },
      { type: "h2", text: "4. Alert a Purchasing Manager Directly" },
      {
        type: "p",
        text: "**Trigger:** a specific high-priority product (tagged `bestseller`, for example) crosses its low-stock threshold. **Action:** send an email or internal notification directly to your purchasing manager, rather than a general team channel. **Business value:** not every low-stock alert deserves the same urgency. By scoping this Flow to only your highest-priority SKUs (using a condition on tag or collection), you make sure the one person responsible for reordering gets a direct, unmissable signal for the products that matter most — instead of that signal getting buried in a general alerts channel alongside dozens of lower-priority items.",
      },
      { type: "h2", text: "5. Auto-Hide or Republish Products Based on Stock Status" },
      {
        type: "p",
        text: "**Trigger:** a product goes out of stock (to hide) or restocks (to republish). **Action:** update the product's sales channel visibility or publish status accordingly. **Business value:** some merchants prefer to fully unpublish a sold-out product from certain sales channels — like Google Shopping or a specific market — rather than showing it as unavailable. This avoids sending paid or organic traffic to a page that can't convert, and re-publishing automatically on restock means you're not manually toggling visibility every time inventory changes. It's a cleaner alternative to just displaying “Sold Out” and hoping traffic doesn't land there anyway.",
      },
      { type: "h2", text: "Where Stock Alert Fits In" },
      {
        type: "p",
        text: "None of these automations work without a reliable trigger source, and Shopify Flow doesn't natively expose inventory-level events like low-stock, out-of-stock, and restock. Stock Alert fires all three directly into Flow as native triggers, so you can build any of the five automations above (and combine them with Flow's existing conditions and actions) without writing custom code or maintaining a separate integration.",
      },
      { type: "h2", text: "Start With One, Then Layer On More" },
      {
        type: "p",
        text: "You don't need to build all five automations on day one. Start with the Slack notification (#2) since it's the simplest and gives your whole team visibility immediately, then add the auto-tagging (#1) so that visibility becomes filterable and actionable. Once those two are running, the ad-pause and purchasing-manager alerts are natural next steps for anyone running paid traffic or managing a larger catalog.",
      },
      {
        type: "p",
        text: "Shopify Flow already sits inside your admin, unused by most merchants for anything beyond order-based automations. Connecting it to real-time inventory events turns it into a genuine operations layer for your store — one that reacts the moment stock changes, instead of whenever someone happens to notice.",
      },
    ],
  },
  {
    handle: "hide-sold-out-products-auto-republish",
    title: "Should You Hide Sold-Out Products? The Case for Auto-Hide and Auto-Republish",
    description:
      "Weighing whether to hide sold out products shopify merchants face daily — the SEO and signup tradeoffs, and why auto-hide paired with auto-republish beats doing it manually.",
    publishedAt: "2026-07-21",
    updatedAt: "2026-07-21",
    blocks: [
      {
        type: "p",
        text: "It's a question that splits merchant opinion right down the middle: when a product sells out, should it disappear from your store, or stay visible with a “Sold Out” label? There's no universally correct answer — but there is a wrong way to handle it, which is not deciding at all and letting sold-out pages sit exactly as they were the day the last unit sold. Let's walk through both sides of hiding sold-out products on Shopify, and land on an approach that avoids the downsides of each.",
      },
      { type: "h2", text: "The Case for Hiding Sold-Out Products" },
      { type: "h3", text: "A Cleaner, Less Frustrating Storefront" },
      {
        type: "p",
        text: "Nothing undermines a shopper's browsing experience like clicking through a collection page full of products they can't actually buy. If a third of your “Bestsellers” collection is sold out, hiding those products keeps the page focused on what's actually purchasable — which matters most during high-traffic periods like a launch or a sale, when frustrated browsing directly costs conversions.",
      },
      { type: "h3", text: "It Removes a Recurring Trust Problem" },
      {
        type: "p",
        text: "Shoppers who repeatedly land on sold-out pages start to associate a store with unreliability, even if the products themselves are great. Hiding sold-out items is a straightforward way to avoid reinforcing that impression every time someone browses.",
      },
      { type: "h3", text: "It Simplifies Merchandising" },
      {
        type: "p",
        text: "Collections, search results, and even email campaigns look intentional and current when they only surface what's actually available. You're not asking customers to mentally filter out what they can't buy — the storefront does that for them.",
      },
      { type: "h2", text: "The Case Against Hiding Sold-Out Products" },
      { type: "h3", text: "You Lose SEO Value on an Indexed Page" },
      {
        type: "p",
        text: "This is the argument that gets overlooked most often. If a product page has been live for months or years, it's likely accumulated backlinks, organic ranking, and indexed search traffic. Fully unpublishing it — rather than just marking it unavailable — can cause Google to drop that page from its index. If the product comes back in a week, you're not just losing visibility temporarily; you may be starting that page's SEO progress over from a lower baseline once it's reindexed.",
      },
      { type: "h3", text: "You Lose the Back-in-Stock Signup Opportunity" },
      {
        type: "p",
        text: "A sold-out product page is actually one of the highest-intent moments in your funnel — a shopper who's already decided to buy, stopped only by availability. If the page disappears entirely, there's no way to capture that interest. You can't offer a “Notify Me When Available” signup on a page that no longer exists. Hiding the product doesn't just remove clutter — it also removes your best chance at recovering that specific sale later.",
      },
      { type: "h3", text: "It Can Look Like the Product Is Discontinued" },
      {
        type: "p",
        text: "Customers who bookmarked a product page, or who search for the item by name, may assume it's gone for good if it 404s or disappears from search results. Some will simply give up rather than dig for an alternative way to find it.",
      },
      { type: "h2", text: "The Real Problem: “Hide” Often Means “Forgot to Bring Back”" },
      {
        type: "p",
        text: "Even merchants who like the idea of hiding sold-out products often avoid doing it manually, for a good reason: it creates a second manual task at restock time. If unpublishing a product isn't automatically paired with republishing it, products quietly stay hidden long after they're back in stock — sometimes for weeks, silently costing sales on a product that's sitting right there in inventory.",
      },
      {
        type: "p",
        text: "This is where auto-republish changes the calculation entirely. If hiding and republishing are handled by the same automated rule — tied directly to inventory count crossing zero and then crossing back above zero — there's no manual step to forget. The product disappears the moment it sells out and reappears the moment it's restocked, without anyone needing to remember to flip a toggle.",
      },
      { type: "h2", text: "The Recommendation: Hide the Product, Not the Opportunity" },
      {
        type: "p",
        text: "Given both sides, the best approach for most stores isn't a strict either/or. It's this: **hide sold-out products from browsing surfaces (collections, search, navigation), but keep a dedicated back-in-stock signup experience live on the product's own URL** — rather than a blank page or a 404.",
      },
      {
        type: "p",
        text: "This gets you the benefits of both approaches:",
      },
      {
        type: "ul",
        items: [
          "Collections and search stay clean, since sold-out products no longer clutter what shoppers actively browse.",
          "The product's URL stays live and indexable, preserving accumulated SEO value instead of resetting it.",
          "The page still captures intent through a “Notify Me” signup instead of turning away a shopper who found it directly.",
          "Auto-republish means the product returns to normal visibility the instant it's back in stock, with no manual cleanup required.",
        ],
      },
      {
        type: "p",
        text: "In other words: don't choose between hiding sold-out products on Shopify and keeping their SEO and signup value — set it up so you don't have to.",
      },
      { type: "h2", text: "Where Stock Alert Fits In" },
      {
        type: "p",
        text: "Manually tracking which products need to be hidden, and remembering to bring each one back the moment it restocks, doesn't scale past a handful of SKUs. Stock Alert automatically hides sold-out products from your storefront and republishes them the instant inventory is available again — no manual toggling, no products left invisible for weeks after they're back in stock.",
      },
      { type: "h2", text: "Set the Rule Once" },
      {
        type: "p",
        text: "Whether you hide sold-out products or leave them visible with a label is a real decision worth making deliberately — but the “forgot to republish” problem shouldn't be part of that decision at all. Automate the hide-and-republish cycle, keep a signup form live where the product used to be, and you get a cleaner storefront without giving up the SEO equity or the sale you're trying to recover.",
      },
    ],
  },
  {
    handle: "email-alerts-not-enough-slack-whatsapp-inventory",
    title: "Why Email Alerts Aren't Enough: Managing Inventory in Real Time via Slack and WhatsApp",
    description:
      "Email buries urgent inventory alerts and leaves teams blind. Why shopify inventory alerts slack channels for teams and WhatsApp for solo merchants beat an inbox every time.",
    publishedAt: "2026-07-22",
    updatedAt: "2026-07-22",
    blocks: [
      {
        type: "p",
        text: "Email was the default channel for inventory alerts for a good reason: every merchant has one, every app can send to it, and it requires no setup. But email is also where urgent information goes to die. If your low-stock alerts are only showing up in an inbox, you're relying on someone noticing a subject line among dozens of other unread messages — and “notice” is doing a lot of work in that sentence.",
      },
      { type: "h2", text: "The Problem With Email-Only Alerts" },
      { type: "h3", text: "Buried Inboxes" },
      {
        type: "p",
        text: "A low-stock alert sent by email looks exactly like every other automated message in your inbox — a shipping notification, a newsletter, a calendar invite. It has no way to signal urgency beyond a subject line, and it competes for attention with everything else that lands there. On a busy day, an inventory alert can sit unread for hours, sometimes until the next morning.",
      },
      { type: "h3", text: "Delayed Response by Design" },
      {
        type: "p",
        text: "Email is inherently asynchronous. Nobody expects an instant reply to an email, which means nobody treats an inventory alert sent by email as something requiring an instant reaction either — even when the underlying event (a bestseller about to sell out) genuinely does.",
      },
      { type: "h3", text: "No Team Visibility" },
      {
        type: "p",
        text: "This is the biggest structural problem for any store with more than one person involved in operations. An email alert typically goes to one inbox — usually the owner's, or whoever originally set up the app. If that person is out, busy, or simply doesn't check email that day, nobody else on the team even knows a stockout is coming. There's no shared record, no way for a teammate to jump in and reorder, and no accountability for who's supposed to act on it.",
      },
      { type: "h2", text: "The Case for Slack: Real-Time Visibility for Teams" },
      {
        type: "p",
        text: "Slack solves the exact problems email creates, almost by design. It's built around real-time, always-open channels rather than a queue of messages waiting to be triaged.",
      },
      { type: "h3", text: "Alerts Land Where the Team Already Is" },
      {
        type: "p",
        text: "If your team already lives in Slack for day-to-day communication, routing **shopify inventory alerts slack**-side means the alert arrives in the same place people are already paying attention — not a separate inbox someone has to remember to check.",
      },
      { type: "h3", text: "Channel-Based Accountability" },
      {
        type: "p",
        text: "A dedicated `#inventory-alerts` channel creates a shared, visible record that everyone on the team can see — not just whoever the alert happened to be addressed to. If the purchasing lead is out sick, a warehouse manager or a co-founder can see the same alert and act on it. Nobody has to forward an email or hope someone checks their inbox; the information is just there, for anyone who needs it.",
      },
      { type: "h3", text: "Threaded Follow-Up" },
      {
        type: "p",
        text: "Slack lets the team respond directly in a thread — “reordered, ETA 3 days” or “already flagged with supplier” — turning a one-way notification into a running log of what's been done about it. That context is nearly impossible to maintain over individual emails.",
      },
      { type: "h2", text: "The Case for WhatsApp: Built for Solo, Mobile-First Merchants" },
      {
        type: "p",
        text: "Not every merchant runs a team sitting in Slack all day. A huge number of Shopify stores are run by one or two people, often managing the business primarily from a phone. For that operator, WhatsApp is often a better fit than either email or Slack.",
      },
      {
        type: "ul",
        items: [
          "**It's already the primary communication channel.** Many solo merchants and small teams — especially outside North America — run their entire business communication through WhatsApp already, including supplier conversations. An inventory alert arriving in the same app is far more likely to get seen immediately.",
          "**Push notifications actually get noticed.** A WhatsApp message triggers the same attention-grabbing notification as a text from a friend or family member — which is exactly the level of urgency a stockout alert deserves, and email simply doesn't have.",
          "**No extra tool to check.** For someone running a store between other tasks, adding “check a dashboard” or “check a separate app” is friction. A WhatsApp message meets them in the app they're already glancing at throughout the day.",
        ],
      },
      { type: "h2", text: "A Tale of Two Merchants" },
      {
        type: "p",
        text: "**Merchant A** relies on email alerts only. Their bestselling product crosses its low-stock threshold at 9:14 AM on a Tuesday. The alert lands in an inbox already holding 40 unread messages. Merchant A doesn't check that inbox until the next morning, by which point the product has fully sold out — along with a full day of otherwise-recoverable sales, plus the ad spend that kept sending traffic to a page that could no longer convert.",
      },
      {
        type: "p",
        text: "**Merchant B** has the same alert routed to a Slack channel their small team already has open all day. The moment the threshold is crossed, the alert posts, and a teammate sees it within minutes. They pause the product's ad campaign, message the supplier for an expedited restock, and reply in the thread so the rest of the team knows it's handled — all before lunch.",
      },
      {
        type: "p",
        text: "Same event, same product, same threshold. The only difference is where the alert landed — and that difference is the entire gap between a missed sale and a caught one.",
      },
      { type: "h2", text: "Where Stock Alert Fits In" },
      {
        type: "p",
        text: "Stock Alert sends low-stock and out-of-stock alerts through whichever channel actually fits how you work — email, Slack, or WhatsApp — and supports Slack Connect so a whole team can collaborate on inventory alerts in a shared channel rather than routing everything through one person's inbox. You're not locked into one channel either; solo merchants can run WhatsApp alone, while growing teams can add Slack without losing the email option as a backup.",
      },
      { type: "h2", text: "Pick the Channel That Matches How You Actually Work" },
      {
        type: "p",
        text: "Email isn't useless — it's a fine backup and a good audit trail. But treating it as your only inventory alert channel means betting your response time on someone remembering to check an inbox that's competing for attention with everything else. If you run a team, route alerts to a Slack channel everyone can see. If you're running the business mostly from your phone, WhatsApp will get noticed in a way email never will. The right channel isn't about which is “better” in the abstract — it's about which one meets your team where they're already paying attention.",
      },
    ],
  },
  {
    handle: "stock-out-history-inventory-analytics-purchasing",
    title: "What Your Stock-Out History Is Telling You: Using Inventory Analytics to Make Smarter Purchasing Decisions",
    description:
      "Most merchants react to each stockout and move on. Shopify inventory analytics turns your alert history into patterns — repeat offenders, seasonality, supplier reliability — that change how you actually reorder.",
    publishedAt: "2026-07-23",
    updatedAt: "2026-07-23",
    blocks: [
      {
        type: "p",
        text: "Every stockout generates data. Most merchants just never look at it. The alert fires, the product gets reordered (eventually), and the moment moves on — with nothing captured about whether this was the first time that product ran out, or the fifth time this year. That gap is where a lot of avoidable stockouts keep happening: not because merchants aren't reacting to problems, but because they're only ever reacting, never analyzing.",
      },
      { type: "h2", text: "Reacting vs. Analyzing: Two Different Jobs" },
      {
        type: "p",
        text: "Reacting to a stockout means fixing today's problem — reordering the product, apologizing to a customer, maybe pausing an ad. It's necessary, but it's also entirely backward-looking: by the time you're reacting, the sale is already lost.",
      },
      {
        type: "p",
        text: "Analyzing your stockout history is a different job. It's asking what your past stockouts, taken together, are telling you about how to set up your store so fewer of them happen in the first place. **Shopify inventory analytics** — a running record of every low-stock and out-of-stock event, not just the most recent one — is what makes that second job possible. Without it, every stockout is a surprise. With it, patterns start showing up that individual incidents never reveal on their own.",
      },
      { type: "h2", text: "Four Questions Your Stock-Out Data Can Answer" },
      {
        type: "p",
        text: "If you've never looked at your alert history as a data set, here's where to start.",
      },
      { type: "h3", text: "1. Which Products Stock Out Repeatedly?" },
      {
        type: "p",
        text: "A single stockout might be a fluke — a surprise viral moment, an unusually large order. A product that stocks out five times in six months is not a fluke; it's a signal that your reorder point, safety stock, or supplier cadence for that specific SKU is wrong. Looking at frequency, not just the most recent event, is the fastest way to separate one-off surprises from structural problems worth fixing.",
      },
      { type: "h3", text: "2. Are There Seasonal Patterns You're Not Planning Around?" },
      {
        type: "p",
        text: "If a product stocks out every November, that's not twelve independent incidents — it's one predictable pattern that a threshold adjustment or an early reorder could solve permanently. Without a history to look back on, seasonal stockouts feel like they come out of nowhere each year, even though the same event happened at the same time twelve months earlier. A full alert history turns “why does this keep happening in Q4” into an obvious, fixable calendar problem.",
      },
      { type: "h3", text: "3. Which Suppliers Are Actually Reliable?" },
      {
        type: "p",
        text: "Stockout timing tells you something about your suppliers that a delivery spreadsheet alone won't: how often a “restock in 2 weeks” promise turns into three, or five. If products from one supplier consistently stock out despite reorders being placed on time, that's a supplier reliability issue hiding in plain sight — one that only becomes visible when you look at repeated events instead of judging each delay in isolation.",
      },
      { type: "h3", text: "4. Which SKUs Need Higher Safety Stock?" },
      {
        type: "p",
        text: "Not every product deserves the same buffer. Products that repeatedly graze zero — going low, getting reordered just in time, then going low again a few weeks later — are telling you their current safety stock margin is too thin for how they actually sell. This is different from a threshold that's simply set wrong (covered by a proper calculation, as we've written about separately) — it's about which products, even with a reasonable threshold, keep running the buffer down to nothing because real-world demand or lead times are more volatile than expected.",
      },
      { type: "h2", text: "How Tracking This Over Time Changes Purchasing Decisions" },
      {
        type: "p",
        text: "None of these questions can be answered by looking at a single stockout. They only become visible when alert history accumulates into a pattern — which is exactly why most merchants miss them: the information technically exists (in old emails, old Slack messages, scattered inventory reports) but it's never assembled anywhere a person can actually review it as a trend.",
      },
      {
        type: "p",
        text: "Once it is, purchasing decisions start shifting from reactive to structural:",
      },
      {
        type: "ul",
        items: [
          "Instead of reordering the same product for the fifth time this year, you adjust its reorder point once and stop the cycle.",
          "Instead of being surprised every November, you build a seasonal buffer into your ordering calendar ahead of time.",
          "Instead of trusting every supplier equally, you weight your safety stock and lead-time assumptions based on which ones have actually proven reliable.",
          "Instead of a flat safety stock rule across your whole catalog, you concentrate extra buffer on the specific SKUs that have demonstrated they need it.",
        ],
      },
      {
        type: "p",
        text: "The pattern here is consistent: a single stockout tells you what happened. A history of stockouts tells you what to change. The first keeps you busy putting out fires; the second actually reduces how many fires there are to put out.",
      },
      { type: "h2", text: "Where Stock Alert Fits In" },
      {
        type: "p",
        text: "This kind of analysis depends on having the data in the first place, which is often the actual blocker — not a lack of interest in analyzing patterns, but no centralized record to analyze. Stock Alert's analytics dashboard tracks your full alert history, stockout trends per product, and webhook health across your catalog in one place, so instead of piecing together which products keep running out from memory or scattered notifications, you can see the pattern laid out and act on it directly.",
      },
      { type: "h2", text: "Start Looking Backward to Buy Smarter Forward" },
      {
        type: "p",
        text: "Every stockout you've had this year already contains the answer to at least one purchasing decision you haven't made yet — which product needs a higher reorder point, which supplier needs a longer lead-time buffer, which season needs advance planning. The data is already there. The only missing step for most merchants is treating stockout history as something to analyze, not just something to react to and move past.",
      },
      {
        type: "p",
        text: "Next time a product runs low, don't just reorder it and move on — check whether this is the first time, or the fifth. That one question is often the difference between fixing today's problem and finally fixing the pattern behind it.",
      },
    ],
  },
  {
    handle: "how-to-choose-shopify-stock-alert-app-buyers-guide",
    title: "How to Choose the Right Stock Alert App for Your Shopify Store: A Buyer's Guide",
    description:
      "An objective framework for evaluating any inventory alert app — notification channels, threshold flexibility, automation depth, integrations, pricing, and setup — for merchants hunting the best shopify low stock alert app.",
    publishedAt: "2026-07-24",
    updatedAt: "2026-07-24",
    blocks: [
      {
        type: "p",
        text: "Search the Shopify App Store for “low stock alert” and you'll get dozens of results that all look roughly the same from their screenshots: a dashboard, some thresholds, an email notification. Scrolling through five-star reviews doesn't tell you much either, since most reviews are left in the first week of use, long before anyone's tested what happens during a real stockout at scale. If you're trying to find the **best shopify low stock alert app** for your store, the deciding factors aren't visible on the listing page — they're in how each app actually behaves once it's running your inventory alerts day to day.",
      },
      {
        type: "p",
        text: "This guide isn't a ranked list. It's the criteria worth evaluating in any inventory alert app you're considering, so you can judge candidates — including Stock Alert — on what actually matters rather than on screenshots and star ratings.",
      },
      { type: "h2", text: "The Six Criteria That Actually Separate These Apps" },
      {
        type: "p",
        text: "Before comparing specific apps, it helps to know what you're actually comparing. Here's the shortlist that tends to separate the apps that hold up in daily use from the ones that get uninstalled after a month.",
      },
      {
        type: "table",
        headers: ["Criteria", "Why It Matters", "Signs It's Done Well"],
        rows: [
          [
            "Notification channels",
            "If your team doesn't check the one channel an app supports, alerts go unseen",
            "Offers email plus at least one real-time channel (Slack, WhatsApp, SMS) — not email-only",
          ],
          [
            "Threshold flexibility",
            "A single store-wide number under-alerts your bestsellers and over-alerts your slow movers",
            "Supports a sensible global default plus per-product, per-collection, or per-tag overrides",
          ],
          [
            "Automation depth",
            "Manual restock, hide, and republish steps get forgotten eventually",
            "Auto-hides sold-out products and auto-republishes on restock, ideally with native automation triggers like Shopify Flow",
          ],
          [
            "Integrations",
            "Alerts stuck in a silo can't power your marketing or ops workflows",
            "Sends events to tools you already use — email marketing platforms, Slack, outbound webhooks",
          ],
          [
            "Pricing transparency",
            "Usage-based surprises erode trust and blow up your app budget",
            "A clearly published price with a low-cost entry tier and no hidden per-alert fees",
          ],
          [
            "Ease of setup",
            "An app you can't configure in an afternoon won't get maintained",
            "Works with sensible defaults out of the box — no custom code or developer needed",
          ],
        ],
      },
      {
        type: "p",
        text: "Use this table as a checklist while you trial any candidate app, not just the one you end up choosing.",
      },
      { type: "h2", text: "Notification Channels: Where Alerts Actually Get Seen" },
      {
        type: "p",
        text: "An app that only sends email alerts is betting your response time on someone remembering to check an inbox competing with dozens of other messages. Look for an app that supports at least one real-time channel alongside email — Slack for teams who already collaborate there, WhatsApp for solo merchants running the business from a phone. Stock Alert is one example that covers all three, letting you pick whichever channel your team is actually going to notice.",
      },
      { type: "h2", text: "Threshold Flexibility: One Number Rarely Fits a Whole Catalog" },
      {
        type: "p",
        text: "A flat “alert at 5 units” rule works for exactly one kind of product — everything else either gets a warning too late or gets flagged so often you stop trusting it. The apps worth using let you set a global default and then override it per product, per collection, or per tag, so your bestsellers get an early warning while your long-tail SKUs don't clutter your alert history. This is a feature to test directly during a trial, not just read about on a pricing page — try setting an override on a single product and confirm it actually takes effect.",
      },
      { type: "h2", text: "Automation Depth: What Happens Without You" },
      {
        type: "p",
        text: "The best inventory alert apps don't just tell you something happened — they can act on it. Auto-hiding a sold-out product and auto-republishing it the moment it restocks removes an entire category of manual cleanup work. Native triggers into Shopify Flow take this further, letting you build your own no-code automations — tagging products, notifying specific team members, or adjusting other systems — off the same inventory events, without needing a developer. When evaluating an app, ask specifically what it can do without you touching it, not just what it can tell you.",
      },
      { type: "h2", text: "Integrations: Do Alerts Reach the Tools You Already Use?" },
      {
        type: "p",
        text: "An inventory alert that only lives inside the app's own dashboard is limited by design. Look for apps that can push events into places you already work — Klaviyo or another email platform for marketing flows, Slack for team visibility, and outbound webhooks for anything custom (Zapier, Make, or your own internal tools). The value of an inventory event compounds when it can trigger a marketing flow or an operational automation, not just sit in an alert log.",
      },
      { type: "h2", text: "Pricing Transparency: What You See Should Be What You Pay" },
      {
        type: "p",
        text: "Watch for apps that charge based on usage metrics that are hard to predict in advance — per alert sent, per subscriber tracked, or tiered by order volume in ways that aren't clearly explained upfront. A transparent, flat monthly price (Stock Alert, for reference, starts at $3.99/month) makes it easy to budget for and easy to justify, regardless of which app you ultimately choose. If a pricing page requires a calculator to understand, that's worth factoring into your decision.",
      },
      { type: "h2", text: "Ease of Setup: Will You Actually Finish Configuring It?" },
      {
        type: "p",
        text: "Plenty of inventory apps have powerful features that never get used because setup requires more time or technical knowledge than a merchant has available. The strongest signal here is whether an app works reasonably well with its defaults on day one, and lets you layer in customization (thresholds, channels, integrations) incrementally rather than requiring a full configuration pass before it's useful at all.",
      },
      { type: "h2", text: "A Few Questions to Ask Before You Install Anything" },
      {
        type: "p",
        text: "Beyond the six criteria above, a short gut-check before committing to any app:",
      },
      {
        type: "ul",
        items: [
          "Can you test the core alert flow (a real low-stock or out-of-stock event) during a free trial, or only see it described in marketing copy?",
          "Does the app's support team respond quickly if something doesn't fire as expected — this matters more than almost any feature, since inventory alerts are useless if a misconfiguration goes unnoticed?",
          "Will the app still make sense at double your current catalog size, or does it start to strain (in cost or usability) as you scale?",
        ],
      },
      { type: "h2", text: "What to Try First" },
      {
        type: "p",
        text: "If the six criteria above matter to your store — and for most merchants managing more than a handful of SKUs, they do — Stock Alert is a reasonable place to start a trial. It covers real-time email, Slack, and WhatsApp alerts, per-product and per-collection thresholds, auto-hide/auto-republish, Shopify Flow triggers, Klaviyo and webhook integrations, and an analytics dashboard to track it all — at a $3.99/month entry price that makes it low-risk to test against your own catalog rather than someone else's screenshots.",
      },
      {
        type: "p",
        text: "That said, the goal of this guide isn't to tell you Stock Alert is the only option — it's to give you a framework that works regardless of which app you land on. Run any serious candidate through the table above, test the specific features that matter most for how your store actually operates, and choose based on what holds up under a real stockout, not just what looks good in a demo.",
      },
    ],
  },
  {
    handle: "how-to-stop-overselling-shopify",
    title: "How to Stop Overselling on Shopify When Inventory Runs Low",
    description:
      "Refunds, bad reviews, and damaged trust are the real cost of overselling. Learn how to stop overselling shopify with buffer thresholds, real-time low-stock alerts, and auto-hide at zero.",
    publishedAt: "2026-07-25",
    updatedAt: "2026-07-25",
    blocks: [
      {
        type: "p",
        text: "Overselling looks harmless in the moment — a customer places an order, the payment goes through, everything seems fine. Then you go to fulfill it and realize the product sold out an hour ago somewhere else: a wholesale order, a POS sale, a marketplace listing you forgot was still live. Now you owe that customer an apology, a refund, or a long wait for a restock they didn't sign up for.",
      },
      { type: "h2", text: "The Real Cost of Overselling" },
      {
        type: "p",
        text: "A single oversold order rarely stays a single problem. It cascades into a handful of costs that are easy to underestimate until they start piling up.",
      },
      {
        type: "ul",
        items: [
          "**Refunds and cancellations.** Every oversold order you can't fulfill either gets refunded outright or delayed long enough that the customer cancels anyway — either way, you've spent time and (often) payment processing fees on a sale that never happened.",
          "**Bad reviews.** A customer who paid for something you couldn't deliver doesn't usually stay quiet about it. Oversold orders are disproportionately likely to end in a public complaint, precisely because the customer felt like the transaction was already final when it fell apart.",
          "**Damaged trust.** Beyond the one-off complaint, repeat oversold orders train customers to wonder whether your stock counts can be trusted at all — which erodes confidence in every future purchase, not just the one that went wrong.",
          "**Support overhead.** Someone on your team has to catch the oversold order, reach out, process the refund or find a substitute, and manage the customer's frustration — time that a properly synced inventory count would have avoided entirely.",
        ],
      },
      {
        type: "p",
        text: "For merchants selling only through their own Shopify store, this problem is manageable. For merchants selling across POS, wholesale, and marketplaces at the same time, it compounds fast — because the oversold unit was never really “sold twice” on purpose, it was sold twice because no single system knew about both sales in time.",
      },
      { type: "h2", text: "Why Overselling Happens in the First Place" },
      {
        type: "p",
        text: "Overselling is rarely a one-off mistake. It's usually the predictable result of one (or several) of these gaps.",
      },
      { type: "h3", text: "Sync Delays Between Channels" },
      {
        type: "p",
        text: "If you sell on Shopify plus POS, a wholesale channel, or a marketplace like Amazon or Etsy, each platform typically has its own inventory count that syncs back to a central number on a delay — sometimes seconds, sometimes minutes. During that gap, two channels can both believe a unit is available and both let a customer buy it.",
      },
      { type: "h3", text: "Manual Stock Counts" },
      {
        type: "p",
        text: "Some merchants still rely partly on manual stock adjustments — a warehouse count entered at the end of the day, a spreadsheet updated after a wholesale shipment goes out. Any manual step introduces a window where Shopify's number and the real number don't match, and that window is exactly when overselling happens.",
      },
      { type: "h3", text: "No Buffer or Safety Stock" },
      {
        type: "p",
        text: "Selling right down to the last unit with zero buffer leaves no margin for the sync delay or manual-count gap above. If your system says “1 in stock” and it's actually already been sold on another channel, you have no cushion left to absorb that discrepancy.",
      },
      { type: "h3", text: "No Real-Time Alerting" },
      {
        type: "p",
        text: "Without a real-time alert the moment stock gets low, the first time anyone finds out about a tight inventory situation is often when the oversold order already exists. By then, you're managing the aftermath instead of preventing it.",
      },
      { type: "h2", text: "Practical Fixes That Actually Stop Overselling" },
      { type: "h3", text: "Set a Buffer Threshold, Not Zero" },
      {
        type: "p",
        text: "Instead of treating “0 in stock” as your only trigger, set a buffer — a handful of units held back as a cushion against sync delays and count discrepancies. If a product's real stock is tight, treating “2 units left” as effectively sold out gives you room to absorb a same-day sale on another channel without going negative.",
      },
      { type: "h3", text: "Get Real-Time Low-Stock Alerts Before Zero" },
      {
        type: "p",
        text: "The fix for sync delay isn't necessarily faster syncing (which you often don't control on a marketplace's side) — it's getting notified early enough to act manually if needed. A real-time low-stock alert sent the moment a product crosses its threshold gives you a window to double-check other channels, pause a listing, or adjust a wholesale allocation before a customer manages to buy a unit that's already gone.",
      },
      { type: "h3", text: "Auto-Hide at Zero Instead of Relying on Manual Checks" },
      {
        type: "p",
        text: "The last line of defense is making sure a sold-out product actually stops being purchasable the moment it hits zero — automatically, not whenever someone happens to notice and manually unpublish it. If hiding the product from checkout requires a human to catch the stockout first, you've already reintroduced the exact manual-step delay that causes overselling in the first place.",
      },
      { type: "h2", text: "Multi-Channel Sellers: Why the Risk Is Higher" },
      {
        type: "p",
        text: "If you sell exclusively through your own Shopify storefront, Shopify's own inventory tracking is usually accurate enough on its own — one system, one source of truth, updated the moment an order comes in. The risk goes up substantially once you add other channels into the mix.",
      },
      {
        type: "ul",
        items: [
          "**POS** — in-person sales can happen faster than a webhook can propagate, especially during a busy in-store event, creating a brief but real window for a double-sell.",
          "**Wholesale** — bulk orders often get processed through a separate workflow (a purchase order, an invoice, a manual fulfillment), which can lag behind updating the same SKU's online availability.",
          "**Marketplaces** — third-party platforms like Amazon or Etsy sync inventory on their own schedule, which you don't fully control, meaning there's almost always some delay baked into the system by design, not by mistake.",
        ],
      },
      {
        type: "p",
        text: "For multi-channel sellers, a buffer threshold and real-time alerting aren't optional extras — they're the only practical way to compensate for sync delays you can't eliminate outright.",
      },
      { type: "h2", text: "Where Stock Alert Fits In" },
      {
        type: "p",
        text: "Catching an oversold situation before it happens depends on knowing about a low-stock or sold-out product the moment it happens, not after a customer has already placed an order. Stock Alert monitors your inventory in real time, sends instant low-stock alerts via email, Slack, or WhatsApp before a product fully sells out, and automatically hides sold-out products from your storefront the moment they hit zero — closing the exact gap that manual checks and channel sync delays leave open.",
      },
      { type: "h2", text: "Build the Buffer In, Don't Rely on Catching It Later" },
      {
        type: "p",
        text: "Overselling isn't usually a sign of a careless merchant — it's a sign of a system with no buffer and no early warning built in. The fix isn't more manual vigilance; it's setting a threshold that gives you room to react, getting alerted before stock actually hits zero, and making sure a sold-out product stops taking orders automatically instead of waiting for someone to notice.",
      },
      {
        type: "p",
        text: "If you've been treating overselling as an occasional cost of doing business, it's worth treating it instead as a solvable gap — one that a buffer, a real-time alert, and an auto-hide rule can close for good.",
      },
    ],
  },
  {
    handle: "shopify-inventory-alerts-for-beginners",
    title: "Inventory Alerts 101: A Beginner's Guide for New Shopify Store Owners",
    description:
      "New to Shopify? A friendly, jargon-free guide to shopify inventory alerts for beginners — what low-stock and back-in-stock notifications actually are, and what to set up on day one.",
    publishedAt: "2026-07-26",
    updatedAt: "2026-07-26",
    blocks: [
      {
        type: "p",
        text: "Congratulations on launching your store! If you're reading this, you've probably already spent weeks on product photos, descriptions, and getting your first few orders in. Inventory alerts probably haven't crossed your mind yet — and that's completely normal. Most new merchants don't think about this until something goes wrong. This guide is here so you can set things up before that happens, not after.",
      },
      { type: "h2", text: "What Is a “Low Stock Alert,” Really?" },
      {
        type: "p",
        text: "In plain terms: a low stock alert is a notification that tells you when one of your products is running low, so you can reorder or restock before it actually runs out completely.",
      },
      {
        type: "p",
        text: "Here's why this matters even if you only have 10 or 20 products right now. When you're small, you're probably checking your Shopify admin fairly often anyway — so it feels like you'd notice a product running low on your own. But as soon as you get busy (fulfilling orders, answering customer messages, posting on social media), inventory checking is usually the first thing that slips. A low stock alert does that checking for you automatically, in the background, so nothing falls through the cracks just because you had a busy week.",
      },
      { type: "h2", text: "What Is a “Back-in-Stock Notification”?" },
      {
        type: "p",
        text: "This one's for your customers, not for you. A back-in-stock notification lets a customer who finds a sold-out product sign up to be emailed the moment it's available again — instead of just leaving your site and never coming back.",
      },
      {
        type: "p",
        text: "Think about it from a shopper's side: if they land on a product they want and it says “Sold Out” with nothing else on the page, they have no reason to check back later. Most people simply won't remember to. A “Notify Me” button gives them a way to say “I still want this,” and gives you a way to actually reach them again when it's true.",
      },
      {
        type: "p",
        text: "Even with a small catalog, this matters. If you only have 20 products and one of your bestsellers sells out, you don't want to lose every customer who wanted it just because there was no way for them to wait for it.",
      },
      { type: "h2", text: "Why This Matters Even With a Small Catalog" },
      {
        type: "p",
        text: "It's easy to assume alerts and automations are “for bigger stores” — something you'll set up once you have hundreds of products. In practice, the opposite is often true: a small catalog means each individual product carries more weight. If you have 500 SKUs, one stockout is a rounding error. If you have 15 SKUs, one stockout might be 5-10% of your entire catalog going quiet at once — noticeably hurting your sales and your customers' experience.",
      },
      {
        type: "p",
        text: "Setting this up early doesn't cost you anything in effort once it's automated — it's a “set it up once, benefit forever” kind of task, which makes it one of the easiest wins available to a new store.",
      },
      { type: "h2", text: "Day One Setup: What to Configure First" },
      {
        type: "p",
        text: "You don't need to configure everything on day one. Here's the order that actually matters, starting with the highest-impact, lowest-effort steps.",
      },
      { type: "h3", text: "1. Set a Global Low-Stock Threshold" },
      {
        type: "p",
        text: "This is just a single number — like “alert me when any product has 5 units left” — that applies to your whole store. It won't be perfect for every product (some sell faster than others), but it's a reasonable starting point that takes two minutes to set up and immediately covers your entire catalog. You can fine-tune specific products later.",
      },
      { type: "h3", text: "2. Pick Your Notification Channel" },
      {
        type: "p",
        text: "Decide where you actually want to be notified: email, Slack, or WhatsApp. The right answer here isn't “whichever sounds most professional” — it's whichever one you'll actually notice. If you check WhatsApp constantly but let email pile up, choose WhatsApp. The best alert is the one you'll actually see.",
      },
      { type: "h3", text: "3. Turn On the Back-in-Stock Signup Form" },
      {
        type: "p",
        text: "This is a small widget that appears on a sold-out product page, letting customers leave their email to be notified on restock. Turning this on takes a few minutes and starts capturing interest from day one — even before you have your first stockout to test it against.",
      },
      { type: "h3", text: "What Can Wait" },
      {
        type: "p",
        text: "Per-product thresholds, seasonal adjustments, and advanced integrations (like sending events to an email marketing tool) are all genuinely useful — but they're refinements, not requirements. Get the three basics above running first. You can layer in more precision once you have a few months of sales data to actually base those decisions on.",
      },
      { type: "h2", text: "The Most Common Beginner Mistake" },
      {
        type: "p",
        text: "Here's the mistake almost every new merchant makes: waiting until after the first stockout to think about any of this.",
      },
      {
        type: "p",
        text: "It's an understandable pattern — inventory alerting feels like a “problem to solve later,” right up until a bestseller sells out, a customer asks where it went, and you realize you had no system for catching it or reaching that customer again. At that point, you're not just setting up alerts — you're also trying to win back a frustrated customer and figure out how much revenue you already lost.",
      },
      {
        type: "p",
        text: "The good news: this is one of the few things in running a store where being early costs you almost nothing, and being late costs you a real, avoidable loss. Setting it up now, before your first stockout, means the whole system is just quietly running in the background by the time you actually need it.",
      },
      { type: "h2", text: "Getting Started" },
      {
        type: "p",
        text: "If you've never set up anything like this before, don't overthink it. Stock Alert offers a free 30-day trial with plans starting at $3.99/month, and the setup is built for exactly this moment — a new store owner who wants low-stock and out-of-stock alerts (by email, Slack, or WhatsApp), plus back-in-stock notifications for customers, without needing to be an inventory expert to configure it.",
      },
      {
        type: "p",
        text: "Set your global threshold, pick a notification channel, and turn on the signup form. That's genuinely the whole first step — everything else can wait until you actually need it.",
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
