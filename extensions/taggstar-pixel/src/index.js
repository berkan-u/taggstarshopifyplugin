import { register } from "@shopify/web-pixels-extension";

register(({ analytics, init, settings }) => {
    const accountNumber = settings.account_number;

    if (!accountNumber) {
        console.warn("Taggstar Pixel: Account Number not configured.");
        return;
    }

    // In strict sandbox there is no document/window — script injection is not
    // possible here. The Taggstar CDN script is loaded by the Theme App Embed.
    // This pixel is responsible only for forwarding conversion events.

    analytics.subscribe("checkout_completed", (event) => {
        const checkout = event.data?.checkout;
        if (!checkout) return;

        const payload = {
            orderId: checkout.order?.id,
            revenue: checkout.totalPrice?.amount,
            currency: checkout.currencyCode,
            locale: init.data?.storefront?.i18n?.locale,
            products: (checkout.lineItems || []).map((item) => ({
                id: item.variant?.product?.id,
                price: item.variant?.price?.amount,
                quantity: item.quantity,
            })),
        };

        // Use fetch() — available in the Web Pixel sandbox — to report the
        // conversion to a server-side endpoint (or directly to Taggstar's API
        // if they support it). Replace the URL below with the real endpoint.
        fetch(`https://cdn.taggstar.com/api/conversion`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ account: accountNumber, ...payload }),
        }).catch(() => {
            // Silently ignore network errors in the pixel sandbox
        });
    });
});
