---
name: project-overview
description: Stack, architecture, and deployment summary for the stock-alert Shopify app
metadata:
  type: project
---

Shopify app for inventory stock alerts. Merchants get email/Slack notifications when products go low/out-of-stock or restock.

**Stack:** React Router v7 (Remix-style), Prisma + PostgreSQL (Supabase), pg-boss for job queuing (no Redis), nodemailer, @slack/webhook, Fly.io deployment.

**Two processes:** `web` (React Router server) and `worker` (inventory-buffer.worker.ts). Both share the same Docker image; Fly.io runs them as separate VMs using `[processes]` in fly.toml.

**Why:** Worker process handles debounced alert delivery — Shopify fires many webhook events per inventory update; pg-boss collapses them via a 10-second debounce buffer stored in Postgres.

**How to apply:** Understand that sync state is in-memory per web VM (breaks if web scales to >1 machine). Debounce correctness relies on pg_advisory_xact_lock inside a Prisma transaction. The worker must set PROCESS_TYPE=worker env var (done via npm scripts) to suppress autoSeedAdmin.
