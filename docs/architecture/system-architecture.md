# System Architecture

## Overview

Stock Alert is a Shopify embedded application built with Next.js, designed to automate inventory management through real-time monitoring, automatic product visibility control, and intelligent alerting.

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                         │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │              Shopify Admin (Embedded iFrame)             │ │
│  │                                                          │ │
│  │  ┌────────────────────────────────────────────────────┐ │ │
│  │  │         Next.js App (Server-Side Rendered)         │ │ │
│  │  │                                                    │ │ │
│  │  │  • Dashboard    • Products    • Settings          │ │ │
│  │  │  • Billing      • Analytics   • Notifications     │ │ │
│  │  └────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                      APPLICATION LAYER                          │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐           │
│  │    Auth     │  │   Business   │  │  Integration │           │
│  │   Service   │  │    Logic     │  │   Service    │           │
│  │             │  │              │  │              │           │
│  │ • OAuth 2.0 │  │ • Inventory  │  │ • Webhooks   │           │
│  │ • JWT       │  │ • Alerts     │  │ • Shopify API│           │
│  │ • Sessions  │  │ • Billing    │  │ • Email/Slack│           │
│  └─────────────┘  └─────────────┘  └─────────────┘           │
└────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                         DATA LAYER                              │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │                    Supabase (PostgreSQL)                  │ │
│  │                                                          │ │
│  │  Tables:                                                 │ │
│  │  • stores            • inventory_tracking                │ │
│  │  • store_settings    • alert_history                    │ │
│  │  • product_settings  • webhook_events                   │ │
│  │  • billing_records   • setup_progress                   │ │
│  └──────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                          │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ Shopify  │  │   Email  │  │  Slack   │  │  Vercel  │     │
│  │   APIs   │  │   (SMTP) │  │ Webhooks │  │  Hosting │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
└────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Presentation Layer

#### Next.js Application
- **Framework**: Next.js 15 with App Router
- **Rendering**: Server-Side Rendering (SSR) for optimal performance
- **UI Library**: Shopify Polaris for consistent design
- **State Management**: Redux Toolkit for client-side state
- **Styling**: Tailwind CSS for custom components

#### Key Pages
- **Dashboard**: Real-time inventory overview and metrics
- **Products**: Product management and threshold settings
- **Settings**: Global configuration and notification preferences
- **Billing**: Plan management and usage tracking

### 2. Application Layer

#### Authentication Service
- **OAuth 2.0**: Shopify app installation and authorization
- **JWT Tokens**: Session management for embedded app context
- **Security**: HMAC validation for webhook authenticity

#### Business Logic Service
- **Inventory Management**: Track stock levels across all products
- **Alert System**: Intelligent notification dispatching
- **Automation Rules**: Auto-hide/show products based on stock
- **Plan Enforcement**: Product limits and feature gates

#### Integration Service
- **Shopify API**: REST and GraphQL for store operations
- **Webhook Processing**: Real-time inventory updates
- **Notification Channels**: Email (SMTP) and Slack integration

### 3. Data Layer

#### Database Design
- **Provider**: Supabase (PostgreSQL as a service)
- **Architecture**: Relational with foreign key constraints
- **Security**: Row Level Security (RLS) policies
- **Performance**: Indexed queries on critical paths

#### Data Models
- **Store Context**: Store information and authentication
- **Inventory State**: Real-time product stock levels
- **Configuration**: User preferences and thresholds
- **Audit Trail**: Alert history and webhook events

### 4. External Services

#### Shopify Integration
- **Admin API**: Product and inventory management
- **Webhook Subscriptions**: Real-time event notifications
- **Billing API**: Recurring charge management

#### Communication Channels
- **Email Service**: SMTP via Zoho Business Email
- **Slack Integration**: Webhook-based notifications
- **Status Updates**: Real-time alerts and reports

## Data Flow Patterns

### Installation Flow
```
1. Merchant clicks "Install" in Shopify App Store
2. OAuth redirect to Shopify authorization page
3. Merchant approves requested scopes
4. Callback receives authorization code
5. Exchange code for permanent access token
6. Store credentials in database
7. Register webhook subscriptions
8. Sync initial product inventory
9. Redirect to app dashboard
```

### Inventory Update Flow
```
1. Product stock changes in Shopify
2. Webhook fired to our endpoint
3. Validate HMAC signature
4. Parse webhook payload
5. Update inventory_tracking table
6. Check against thresholds
7. Execute automation rules:
   - Hide product if stock = 0
   - Send alert if stock < threshold
   - Show product if restocked
8. Log event for audit trail
```

### Alert Notification Flow
```
1. Threshold breach detected
2. Check alert history (prevent spam)
3. Determine notification channels:
   - Email (all plans)
   - Slack (Pro plan only)
4. Compose alert message
5. Dispatch notifications
6. Log alert in history
7. Update dashboard metrics
```

## Scalability Considerations

### Horizontal Scaling
- **Application Servers**: Multiple Next.js instances behind load balancer
- **Database**: Read replicas for query distribution
- **Caching**: Redis for session and frequently accessed data
- **CDN**: Static asset delivery via Vercel Edge Network

### Performance Optimizations
- **Database Indexing**: On shop_domain, product_id, variant_id
- **Query Batching**: Aggregate multiple operations
- **Lazy Loading**: Progressive data and component loading
- **Background Jobs**: Async processing for heavy operations

### Rate Limiting
- **API Calls**: Respect Shopify API rate limits
- **Webhook Processing**: Queue-based processing
- **Alert Dispatching**: Throttle notifications per store

## Security Architecture

### Authentication Layers
1. **Shopify OAuth**: Initial app installation
2. **Session Tokens**: Embedded app authentication
3. **API Keys**: Service-to-service communication
4. **Webhook Verification**: HMAC signature validation

### Data Protection
- **Encryption at Rest**: Database-level encryption
- **Encryption in Transit**: TLS 1.3 for all connections
- **Access Control**: Principle of least privilege
- **Audit Logging**: Track all critical operations

### Compliance
- **GDPR**: Data privacy and right to deletion
- **PCI**: No payment card data stored
- **Shopify Requirements**: App review guidelines

## Monitoring & Observability

### Application Metrics
- **Performance**: Response times, throughput
- **Availability**: Uptime, error rates
- **Business**: Active stores, alerts sent, revenue

### Infrastructure Metrics
- **Server**: CPU, memory, disk usage
- **Database**: Query performance, connection pool
- **External Services**: API availability, webhook delivery

### Alerting Strategy
- **Critical**: Payment failures, authentication errors
- **Warning**: High latency, approaching limits
- **Info**: New installations, plan changes

## Disaster Recovery

### Backup Strategy
- **Database**: Daily automated backups (30-day retention)
- **Code**: Git version control with tagged releases
- **Configuration**: Encrypted secret management

### Recovery Objectives
- **RTO (Recovery Time)**: < 1 hour
- **RPO (Recovery Point)**: < 1 hour data loss
- **Failover**: Automated with health checks

## Technology Stack

### Frontend
- Next.js 15
- React 19
- TypeScript
- Shopify Polaris
- Tailwind CSS
- Redux Toolkit

### Backend
- Node.js
- Next.js API Routes
- Shopify API SDK
- JWT Authentication

### Database
- PostgreSQL (Supabase)
- Prisma ORM (optional)

### Infrastructure
- Vercel (Hosting)
- GitHub Actions (CI/CD)
- Cloudflare (DNS/CDN)

### Monitoring
- Vercel Analytics
- Sentry (Error Tracking)
- Custom Metrics Dashboard

## Development Workflow

### Environments
1. **Development**: Local with ngrok tunnel
2. **Staging**: Vercel preview deployments
3. **Production**: Vercel production deployment

### CI/CD Pipeline
```
Git Push → GitHub Actions →
├── Lint & Type Check
├── Run Tests
├── Build Application
├── Deploy to Vercel
└── Post-deployment Tests
```

### Code Quality
- ESLint for code standards
- Prettier for formatting
- TypeScript for type safety
- Husky for pre-commit hooks

## Future Enhancements

### Phase 2 Features
- Bulk import/export functionality
- Advanced filtering and search
- Custom alert templates
- Analytics dashboard

### Phase 3 Features
- AI-powered stock predictions
- Multi-location inventory support
- Third-party integrations (ERP, WMS)
- Mobile application

### Technical Improvements
- GraphQL API migration
- Microservices architecture
- Event-driven architecture
- Real-time WebSocket updates