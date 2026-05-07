## Prompt for LLM — Option 2: Server-side conversion via Taggstar REST API with cookie bridge

---

I am building a Shopify plugin/app that needs to track Taggstar conversion events when an order is placed. 

### Critical constraint — why we use webhooks, not the app pixel

Shopify app pixels run in a Web Worker (no `window`, `document`, or cookies). We originally planned to use the app pixel's `checkout_completed` event to relay order data. However, we discovered that:

**Cart custom attributes set via `/cart/update.js` do NOT appear in the `checkout_completed` Web Pixel event payload.** The `event.data.checkout` object does not include `note_attributes` or `customAttributes` from the cart. These attributes DO persist through to the order as `order.note_attributes`, but they are only accessible via the **Admin API** or the **`orders/create` webhook**.

Therefore, the architecture uses the `orders/create` webhook instead of the app pixel. This is actually simpler — two components instead of three, no app pixel needed.

### The challenge — session/visitor ID continuity

Taggstar's client-side JS tag fires on all storefront pages (PDP, category, search, basket) via GTM. It generates and stores two first-party cookies:

- `_taggstar_vid` — visitor ID (UUID, 90-day rolling expiry)
- `_taggstar_ses` — session ID (UUID, 30-minute rolling expiry)
- `_taggstar_exps` — experiment identifier (UUID, 90-day rolling expiry, only present when an A/B test is running)

For conversion attribution to work, the server-side Create Order API call must include the **same** `visitorId` and `sessionId` that Taggstar's client-side JS set during the browsing session.

Since the webhook fires server-side and has no cookie access, we need a **cookie bridge** — a theme app extension that reads the Taggstar cookies on storefront pages and writes them into Shopify cart attributes. These cart attributes flow through checkout and become `note_attributes` on the order, which the `orders/create` webhook payload includes.

### Architecture overview (revised)

```
1. THEME APP EXTENSION (storefront pages — has cookie access)
   - Reads _taggstar_vid, _taggstar_ses, _taggstar_exps cookies
   - Writes values to Shopify cart attributes via /cart/update.js AJAX API
   - Runs silently on every storefront page
   - Merchant enables it once via Online Store → Themes → Customize → App embeds

2. PLUGIN BACKEND (server — receives webhook, calls Taggstar API)
   - Receives orders/create webhook from Shopify
   - Reads the bridged Taggstar IDs from order.note_attributes
   - Extracts order data (order ID, total price, currency, line items)
   - Calls Taggstar REST API V2 Create Order endpoint

3. APP PIXEL (Web Worker — STILL EXISTS, but NOT used for conversion tracking)
   - The plugin may still register an app pixel for tracking other customer events
     (page_viewed, product_viewed, collection_viewed, cart_viewed,
     product_added_to_cart, search_submitted, etc.)
   - These events don't require window/document — the app pixel can process
     them and send data via fetch() as needed
   - The app pixel simply does NOT handle checkout_completed for the purpose
     of sending conversion data to Taggstar — the webhook handles that instead
   - If the app pixel subscribes to checkout_completed for other purposes
     (e.g. other analytics), that's fine — it just doesn't send to Taggstar's
     Create Order API because it can't access the bridged visitor/session IDs
```

**Conversion data flow (webhook path — this is what we're building):**
Taggstar cookies → theme app extension → cart attributes → checkout → order.note_attributes → orders/create webhook → plugin backend → Taggstar REST API

**Other event tracking (app pixel — may already exist, not part of this build):**
App pixel subscribes to page_viewed, product_viewed, etc. → processes as needed

### Your task

Build the complete implementation for both components.

---

#### Component 1: Theme App Extension — Cookie Bridge

A JavaScript file (loaded as a theme app embed block) that:

1. Reads the following cookies on every storefront page load:
   - `_taggstar_vid` (visitor ID)
   - `_taggstar_ses` (session ID)
   - `_taggstar_exps` (experiment ID — may not exist if no A/B test is running)

2. Writes them to Shopify cart attributes via the AJAX API:
   ```
   POST /cart/update.js
   {
     "attributes": {
       "_taggstar_visitor_id": "<value from _taggstar_vid cookie>",
       "_taggstar_session_id": "<value from _taggstar_ses cookie>",
       "_taggstar_experiment_id": "<value from _taggstar_exps cookie or empty>"
     }
   }
   ```

3. Only syncs when cookie values have changed (don't spam `/cart/update.js` on every page load). Strategy: after syncing, store the synced values in a JS variable. On subsequent page loads within the same session, read the current cart via `GET /cart.js`, compare the attribute values, and only POST if they differ. Alternatively, use a short-lived sessionStorage flag to avoid redundant writes (sessionStorage IS available on the main storefront page — this is NOT the web pixel sandbox).

4. Retries with a delay if Taggstar cookies aren't present yet (GTM may load them asynchronously). Use a polling approach: check every 2 seconds, max 5 retries.

5. Includes console logging (prefixed with `[Taggstar Bridge]`) for debugging during development, with a way to disable logging in production (e.g. a `debug` flag).

Also provide the theme app extension configuration files:
- The Liquid block file (`blocks/taggstar-bridge.liquid`) that registers this as an app embed block
- The necessary entries for the extension's `shopify.extension.toml` configuration

---

#### Component 2: Plugin Backend — Webhook Handler + Taggstar REST API Relay

A server-side implementation (Node.js/Express) that:

##### 2a. Webhook registration and handling

1. Registers for the `orders/create` webhook via the Shopify Admin API (GraphQL `webhookSubscriptionCreate` mutation or REST equivalent).

2. Receives the `orders/create` webhook POST from Shopify.

3. Verifies the webhook signature (HMAC validation) for security.

4. Extracts the bridged Taggstar IDs from `order.note_attributes`:
   - Look for the attribute with `name: "_taggstar_visitor_id"` → this is the `visitorId`
   - Look for the attribute with `name: "_taggstar_session_id"` → this is the `sessionId`
   - Look for the attribute with `name: "_taggstar_experiment_id"` → this is the experiment info (may be empty/absent)

5. If the Taggstar visitor ID or session ID is missing from `note_attributes`, log a warning and skip the Taggstar API call (the cookie bridge may not have been active for this order — e.g. the merchant hadn't enabled the theme app extension yet). Do NOT send the conversion with missing/fabricated IDs.

##### 2b. Taggstar REST API call

6. Looks up the merchant's Taggstar configuration from the database (`customerSiteKey`, `region`).

7. Calls the **Taggstar REST API V2 Create Order** endpoint:

   **Endpoint:** `POST /api/v2/key/{siteKey}/conversion/order`

   **Base URL by region** (merchant selects their region in the plugin UI):
   - EMEA: `https://api.taggstar.com`
   - USA: `https://api.us-east-2.taggstar.com`

   **Request body** (per Taggstar's REST API V2 specification):
   ```json
   {
     "visitor": {
       "id": "<visitorId from note_attributes>",
       "sessionId": "<sessionId from note_attributes>"
     },
     "order": {
       "id": "<order.id or order.order_number as string>",
       "totalPrice": 65.73,
       "orderItems": [
         {
           "id": "043421003241200",
           "unitPrice": 7.99,
           "quantity": 2,
           "category": "accessories"
         }
       ],
       "currency": "GBP"
     }
   }
   ```

   **Field mapping from Shopify webhook to Taggstar API:**
   - `visitor.id` ← `note_attributes` value where `name` = `"_taggstar_visitor_id"`
   - `visitor.sessionId` ← `note_attributes` value where `name` = `"_taggstar_session_id"`
   - `order.id` ← `order.id` (Shopify order ID, as a string)
   - `order.totalPrice` ← `order.total_price` (this is the total actually paid, after discounts/shipping/tax — matches Taggstar's spec: "total price that is actually paid")
   - `order.currency` ← `order.currency`
   - `order.orderItems[].id` ← `line_items[].product_id` (as a string)
   - `order.orderItems[].unitPrice` ← `line_items[].price` (unit price of the line item)
   - `order.orderItems[].quantity` ← `line_items[].quantity`
   - `order.orderItems[].category` ← `line_items[].product_type` (optional, use `'-'` if empty)

   **If the experiment attribute is present and non-empty**, include the experiment object:
   ```json
   "experiment": {
     "id": "<experiment id>",
     "group": "<experiment group>"
   }
   ```
   The `_taggstar_exps` cookie value format may need to be parsed — it could be a single string or a structured value like `experimentId:groupName`. Handle both cases, and if the format is unclear, pass the raw value as the `id` and omit `group` (or set to empty string), and log a warning for investigation.

   **Important notes from the Taggstar API spec:**
   - The `visitor.id` and `visitor.sessionId` must be UUID format
   - Do NOT cache API responses
   - Check `result.success` in the response — do NOT rely on HTTP status code alone (Taggstar can return HTTP 200 with `success: false`)
   - Log the `result.moduleRunId` from every response for debugging/support correlation
   - Authentication headers are NOT required for this implementation

8. Handle errors gracefully:
   - If Taggstar API returns `success: false`, log the `errorMessage` and `moduleRunId`
   - If the Taggstar API is unreachable, implement retry with exponential backoff (max 3 retries, starting at 1 second)
   - Never let a Taggstar API failure affect the merchant's store operations
   - Respond to Shopify's webhook with 200 OK promptly (process the Taggstar API call asynchronously if needed to avoid webhook timeouts)

---

#### Settings and registration flow

Also provide:

- **Webhook registration**: Code to register the `orders/create` webhook when the merchant installs the app or saves their settings.
- **Settings storage**: How the merchant's `customerSiteKey`, `customerAccountNumber`, and `region` (EMEA or US) are stored and retrieved.
- **Settings update flow**: When the merchant changes any setting, update the stored configuration. The webhook and theme app extension don't need to change — they use the latest config from the database at runtime.
- **Uninstall cleanup**: On `app/uninstalled` webhook, clean up the webhook subscription. (If an app pixel exists for other event tracking, that should also be cleaned up — but that's outside the scope of this build.)

---

### Scope clarification

This prompt covers ONLY the conversion/order tracking flow: theme app extension (cookie bridge) + webhook handler + Taggstar REST API relay. The plugin may have other components (app pixel for non-conversion events, theme app extension features for displaying social proof, etc.) that are separate concerns and not part of this implementation. The code produced here should be modular and not interfere with any existing app pixel or other plugin functionality.

---

### Important constraints

- The **app pixel may still exist** in the plugin for tracking non-conversion events (page_viewed, product_viewed, collection_viewed, cart_viewed, product_added_to_cart, search_submitted, etc.). Those are unrelated to this build. **For the conversion/order tracking flow specifically**, the `orders/create` webhook is used instead of the app pixel's `checkout_completed` event, because the webhook has access to `order.note_attributes` (containing the bridged Taggstar IDs) while the app pixel's `checkout_completed` event does not. Do not use the app pixel for sending conversion data to Taggstar's Create Order API.
- The theme app extension runs on **storefront pages only** — it does NOT run on checkout or thank-you pages. That's fine — it bridges cookies to cart attributes before checkout begins. The cookies are set by Taggstar's JS running via GTM on those same storefront pages.
- Cart attributes set via `/cart/update.js` persist through checkout and become `order.note_attributes` on the resulting order. The `orders/create` webhook payload includes `note_attributes`.
- The `_taggstar_ses` cookie has a 30-minute rolling expiry. As long as the shopper proceeds to checkout within 30 minutes of their last page view (when the cookie was last refreshed), the session ID will be valid. This is standard web session behavior and matches Taggstar's own session semantics.
- The Taggstar REST API does NOT require authentication for this implementation (auth is optional and not enabled).
- The merchant chooses their region (EMEA or US) in the plugin UI. Use the correct base URL accordingly.
- All console logging in the theme app extension should be prefixed with `[Taggstar Bridge]` for easy filtering.
- The webhook handler must verify Shopify's HMAC signature for security.

**Output:** Complete, implementation-ready code for both components, plus the webhook registration and settings flow. Include clear comments explaining the data flow at every stage.
