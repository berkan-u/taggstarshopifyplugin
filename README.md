# Taggstar Social Proof Shopify Plugin

A Shopify application that integrates Taggstar's social proof messaging into your store. The plugin handles script injection via App Embeds and tracks conversion events using Shopify's Web Pixel API.

## Features

- **Centralized Configuration**: Admin dashboard to manage Taggstar Account Number, Sitekey, and Region (EMEA or US/RoW).
- **Automated Script Injection**: Uses a Theme App Extension (App Embed) to safely inject the Taggstar loader into the store's head.
- **Conversion Tracking**: A Web Pixel extension that forwards `checkout_completed` events to Taggstar's conversion API.
- **Modern Tech Stack**: Built with Shopify Remix, Polaris UI, and Prisma.

## Getting Started

### Prerequisites

- Node.js (>= 20.0.0)
- Shopify CLI
- A Shopify Partner account and a development store

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/berkan-u/taggstarshopifyplugin.git
   cd taggstarshopifyplugin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up the database:
   ```bash
   npm run setup
   ```

4. Start the development server:
   ```bash
   npm run dev -- --store your-dev-store.myshopify.com
   ```

## Configuration

1. In your Shopify Admin, open the **taggstar social proof plugin**.
2. Enter your **Taggstar Account Number** and **Sitekey**.
3. Select your **Region** (EMEA or US/RoW).
4. Click **Save Settings**.

## Enabling the Plugin

To show Taggstar messages on your store, you must enable the App Embed:

1. Go to **Online Store > Themes**.
2. Click **Customize** on your current theme.
3. Select **App embeds** from the left sidebar.
4. Toggle **Taggstar Loader** to **ON**.
5. Click **Save**.

## Tracking

The plugin automatically tracks conversions when a customer completes a checkout. It sends the following data to Taggstar:
- Order ID
- Revenue
- Currency
- Product IDs and Prices

## Development

- `npm run dev`: Start the dev server.
- `npm run deploy`: Deploy the app and extensions to Shopify.
- `npm run prisma`: Run Prisma commands (e.g., `npm run prisma studio`).

## License

MIT
