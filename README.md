# Taggstar Conversion Tracking for Shopify

Welcome to the official Taggstar Social Proof integration for Shopify. This app enables merchants to seamlessly integrate Taggstar's powerful social proof messaging and conversion tracking into their Shopify storefronts.

This application is built with a **multi-tenant architecture**, meaning a single hosted instance of this app can serve multiple Shopify merchants simultaneously. Each merchant's configuration is securely isolated.

---

## 🚀 What This App Does

1. **Main Purpose - Robust Conversion Tracking**: Implements a highly reliable, hybrid tracking system to capture checkout events and attribute them to the correct visitor, even within Shopify's restrictive Web Pixel sandbox.
2. **(Optional) Automated Script Injection**: Uses Shopify's Theme App Extensions (App Embeds) to safely inject the Taggstar JavaScript loader into the storefront without modifying core theme files.
3. **(Optional) Customizable Visibility**: Allows merchants to selectively enable Taggstar messaging on Category (PLP), Product (PDP), and Basket (Cart) pages directly from the app dashboard.

---

## 📦 For Merchants: How to Install & Configure

If you are a merchant looking to add Taggstar to your store, follow these simple steps:

### 1. Install the App
Click the secure installation link provided by your Taggstar Account Manager. Follow the Shopify prompts to install the app on your store.

### 2. Configure Your Taggstar Settings
Once installed, you will be redirected to the Taggstar app dashboard within your Shopify admin:
- Enter your **Taggstar Account Number**.
- Enter your **Sitekey**.
- Select your **Region** (EMEA or US/RoW).
- Select which pages you want the Taggstar script to load on (Category, Product Display, or Basket).
- Click **Save Settings**.

### 3. Enable the App Embed
To make the script active on your live storefront:
1. In your Shopify Admin, go to **Online Store > Themes**.
2. Click **Customize** on your active theme.
3. On the left sidebar, click the **App embeds** icon (usually looks like a block or puzzle piece).
4. Find **Taggstar Loader** and toggle it to **ON**.
5. Click **Save** in the top right corner.

*That's it! Taggstar is now running on your store and tracking conversions automatically.*

---

## 🛠️ For Developers & Taggstar Technical Team

This section details the underlying architecture and how to deploy the application.

### Technical Architecture

The application is built using **Shopify Remix**, **Polaris UI**, and **Prisma ORM**.

#### Multi-Tenant Data Isolation
The app uses **Shopify Metafields** to securely store merchant credentials (such as their specific `Account Number` and `Sitekey`) directly on their store (`shop` domain). When a merchant configures the app, their specific credentials are automatically injected into their storefront and Web Pixel.

The app's own database (PostgreSQL via Prisma) is used purely for **Shopify Authentication Session Management** and the **Cookie/Webhook Bridge** logic to ensure conversions are accurately attributed.

#### Hybrid Conversion Tracking
To bypass ad-blockers and Shopify's strict Web Pixel sandbox, the app uses a **Hybrid "XHR-First" Strategy** for conversion tracking:
1. **Direct XHR**: The Web Pixel first attempts a direct `fetch` from the customer's browser to the Taggstar Public API using the V2 Nested API format.
2. **REST Proxy Fallback**: If the direct request is blocked (e.g., by CORS), it automatically routes the payload through a secure backend Remix Proxy (`/api/conversion`).
3. **Webhook Fallback**: As a final safety net, a Shopify `orders/create` webhook ensures no conversion is missed.

### 🛑 Deployment Instructions (AWS) - For Taggstar Internal Technical Team Only

To host this application for multiple clients, you must deploy it to a persistent server. We recommend **AWS App Runner** and **AWS RDS (PostgreSQL)**.

1. **Database Setup**: Provision a PostgreSQL database. Ensure you have the connection string.
2. **App Environment Variables**: Configure the following environment variables in your hosting provider. *(Note: You can find `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` in your Shopify Partner Dashboard under Apps > Your App Name > API keys. For local development, these are located in the `.env` file).*
   - `SHOPIFY_API_KEY`: Your Shopify Partner App Client ID.
   - `SHOPIFY_API_SECRET`: Your Shopify Partner App Client Secret.
   - `SCOPES`: `read_customer_events,read_orders,read_pixels,write_pixels,write_products`
   - `DATABASE_URL`: Your PostgreSQL connection string.
3. **Build and Start**: The standard Node.js start command for this Remix app is:
   ```bash
   npm run setup # Runs Prisma migrations
   npm run start # Starts the production server
   ```
4. **Update App URLs**: Once deployed, update the **App URL** and **Allowed redirection URL(s)** in your Shopify Partner Dashboard to match your new production domain.

### Technology Stack

*   **Framework:** Shopify App Framework built on **Remix** (a full-stack web framework).
*   **Languages:** **TypeScript** (for type-safe backend logic) and **JavaScript** (for the Web Pixel and frontend logic).
*   **Templating:** **Liquid** (Shopify's templating language, used for the Theme App Embed).
*   **Frontend Library:** **React.js**.
*   **Design System:** **Shopify Polaris** (Shopify's official UI library).
*   **Backend & Server:** **Node.js** with **Vite** (build tool).
*   **API Architecture:** RESTful APIs (via Remix routes) and Shopify Webhooks (`orders/create`).
*   **Database ORM:** **Prisma**.
*   **Database:** **SQLite** (Development) / **PostgreSQL** (Production).
*   **Merchant Credentials:** Stored securely inside **Shopify Metafields**.
*   **Shopify Extensions:** **Theme App Extension** (`app-embed.liquid`) and **Web Pixel Extension** (`taggstar-pixel`).

## License

MIT
