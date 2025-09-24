## General Development Rules
- always test the remote url before import it
- always reuse the or modify the existing files and component instead of creating new similar component
- always use sementic variable name
- always use meaningfull filename or coponent name
- always use shopify best practice and recoended method
- never use depricated or legacy polarish or appbridge components
- always use .env.local to rtrive any configuration or environment variable
- always put all the docummentation, sumary inside the /docs/ folder
- never assume or guise issue findout the exact issue 
- always work with verifyed source and docuentation
- always adapt the existing files to work with and never change the api routes
- always avoid creating unnecessery files


### Please strictly follow these rules while developing or updating this app:
- Always use descriptive variable and function names.
- Avoid code duplication — reuse existing code where possible.
- Before building a new feature, check if a similar one exists. If it does, extend or modify it instead.
- Follow and adapt the current app architecture.
- Clean up all test files, scripts, and test data after use.
- Never run builds unless explicitly asked.
- Adhere to industry best practices for clean, maintainable, and secure code.
- Strive to achieve more with less code – be concise and efficient.
- Always build reusable components and utility functions if functionality can be abstracted.
- Terminate all background tasks (e.g. polling, workers) if they are no longer needed.

### Shopify App Store Compliance
- Ensure the app meets Shopify's public app requirements. The following guidelines are mandatory for this project:
- Do NOT require desktop software or browser extensions. Everything must work within Shopify.
- Make full use of Shopify’s public APIs (Inventory, Products, Webhooks, Admin APIs, etc.).
- Do not bypass Shopify checkout, manipulate shipping costs, or process payments externally.
- Do not duplicate protected product data from other stores or third parties.
- Avoid overlapping functionality with other apps by the same developer.
- The app must not share merchant data with third parties without Shopify’s prior written consent.
- This app is strictly internal between our app and the merchant — no marketplaces or agency connectors.
- Do not enable any capital funding or loan features.
- Inventory Monitoring App Specifics
- Use the Shopify Inventory APIs to track inventory changes.
- Use webhooks (e.g. inventory_levels/update) to listen for changes efficiently.

### Notifications:
- Send Slack messages via incoming webhook URL provided by merchants.
- Send emails using the platform’s preferred mailer (e.g. SendGrid, Mailgun, or Nodemailer).
- UI should be built using Shopify Polaris or a compatible system to ensure a native Shopify experience.


### Testing & Cleanup
- Use isolated test environments when testing (e.g., .env.test or separate test shop).
- After each feature test:
- Delete any temporary products or inventory items.
- Remove unused test routes, functions, or scripts.
- Ensure logs, background workers, and cron jobs are stopped or cleaned up.

### Architectural Notes
- This is a Next.js frontend with API routes used for lightweight backend logic.
- All code must be modular and maintainable — consider future scaling and extensibility.

### Embedded app checks
- Using the latest App Bridge script loaded from Shopify's CDN
- Using session tokens for user authentication

### How session tokens work
- This section describes the authentication and request flows associated with session tokens, and the lifetime of a session token. It also provides information about implementing both OAuth and session token authentication for embedded apps.

### Authentication flow using a session token
- When your embedded app first loads, it's unauthenticated and serves up the frontend code for your app. Your app renders a user interface skeleton or loading screen to the user.
- After the frontend code has loaded, your app calls a Shopify App Bridge action to get the session token. Your app includes the session token in an authorization header when it makes any HTTPS requests to its backend.

### Request flow using a session token
- The session token is signed using the shared secret between your app and Shopify so that your backend can verify if the request is valid.

### Lifetime of a session token
- The lifetime of a session token is one minute. Session tokens must be fetched using Shopify App Bridge on each request to make sure that stale tokens aren't used.

### OAuth and session tokens
- Session tokens are for authentication, and aren't a replacement for authorization. Learn more about the difference between authentication and authorization.
- Unlike API access tokens, session tokens can't be used to make authenticated requests to Shopify APIs. An API access token is what you use to send requests from your app's backend to Shopify so that you can fetch specific data from the user's shop.
- For example, to make authenticated requests to the GraphQL Admin API, your app must store the access token it receives during the OAuth flow. To contrast, session tokens are used by your app's backend to verify the embedded request coming from your app's frontend.