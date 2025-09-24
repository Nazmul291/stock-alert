## Review requirements
These are what we'll review your submission on based on the app capabilities you selected. Make sure they're met before submitting.

Functionality Requirements

  1. Must authenticate immediately after install
  2. Must have UI merchants can interact with
  3. App must be free from user interface errors, bugs, and functional errors
  4. Must have valid SSL certificate with no errors
  5. Must redirect to app UI after install
  6. Must submit as a regular app
  7. Must use session tokens for embedded apps ⚠️ (Current issue)
  8. Must use Shopify APIs after install
  9. Must implement Billing API correctly
  10. Must use Shopify Billing
  11. Must allow changing between pricing plans
  12. Must re-install properly
  13. Data synchronization

  Listing Requirements

  1. Submission must include test credentials
  2. App listing must include all pricing options
  3. Must have icon uploaded to Partner dashboard
  4. Must not have a generic app name
  5. Must not have misleading or inaccurate tags applied
  6. Must not misuse App card subtitle
  7. Must state if it requires Online Store sales channel
  8. Submission must include demo screencast
  9. App name fields must be similar
  10. Centralize all pricing information under Pricing details
  11. Ensure your App details are clear and descriptive

  Embedded Requirements

  1. Must use Shopify App Bridge from OAuth
  2. Apps must not launch Max modal without user interaction or from the app nav
  3. Max modal must not be used for every page in your app
  4. Must ensure app is properly executing unified admin
  5. Must use the latest version of App Bridge

  Key Requirement Not Passing

  "Must use session tokens for embedded apps" - This is the critical requirement that Shopify is still not
  detecting despite our implementation of:
  - TokenManager with automatic refresh
  - useAuthenticatedFetch hook used across all components
  - SessionTokenTester making periodic authenticated requests
  - AppBridgeInit ensuring proper App Bridge initialization
  - Multiple auth verification endpoints

  The issue appears to be that Shopify's automated detection system isn't recognizing our session token
  usage pattern.