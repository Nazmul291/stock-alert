---
name: project-audit-improvements
description: Audit findings from June 2026 and which were implemented
metadata:
  type: project
---

Full audit done 2026-06-13. All items below were implemented in the same session.

**Security**
- `/api/sync-stream` was unauthenticated — now verifies shop exists in our session table before streaming.

**Performance**
- Dashboard loader had a sequential `storeSession` query after the main `Promise.all` — moved it into the batch.

**Bugs fixed**
- `getBoss()` singleton leaked rejected promise on init failure — added `.catch` that clears `_initPromise` for retry.
- Auto-hide/auto-republish GraphQL mutations didn't check `userErrors` — now logs errors and skips the DB update on Shopify error.
- Settings "Reset" UI said "settings" were deleted but they weren't — fixed description text.
- `plan-limits.ts` listed Slack as a Basic feature but billing UI showed it as Pro-only — aligned both to Pro-only; added UI enforcement in settings page.
- Redundant `@@index([shop, productId])` on InventoryTracking (duplicate of the unique index) — removed; migration created.
- Admin dashboard had hardcoded "Example metric: 42" placeholder — replaced with real stats.

**Architecture**
- Duplicate SSE stream logic in `app._index.tsx` and `app.products.tsx` — extracted to `app/hooks/use-sync-stream.ts`.
- `autoSeedAdmin` was called in the worker process — now guarded by `PROCESS_TYPE !== "worker"`.
- `syncState` Map entries accumulated forever — added 10-minute TTL eviction on a 5-minute interval.

**New feature**
- Added `webhooks.app.subscriptions_update.tsx` + registered `app_subscriptions/update` in shopify.app.toml — plan now downgrades to basic immediately when Shopify subscription lapses/cancels/expires.

**Infrastructure**
- `.dockerignore` was minimal — added `.git`, `.env`, `existing-data/`, `.shopify/`, `.claude/`, `.react-router/`.
- Worker VM memory bumped from 256MB → 512MB in fly.toml.
- Worker now calls `process.exit(1)` on pg-boss `error` event so Fly.io restarts it automatically.
- `PROCESS_TYPE=worker` set via npm scripts (`dev:worker`, `start:worker`) — also set at top of worker file as a fallback.

**Why:** Audit-driven improvements to security, reliability, and correctness. No new user-facing features beyond plan enforcement.

**How to apply:** Remember that `syncState` is still in-memory (single-VM limitation). If web ever scales to >1 machine, replace with a Redis pub/sub or DB-polling approach.
