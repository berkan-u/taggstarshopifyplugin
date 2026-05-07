import { register } from "@shopify/web-pixels-extension";

console.log("Taggstar Pixel Debug: SCRIPT FILE EVALUATED AT TOP LEVEL");

register(({ analytics, settings, browser, init }) => {
    console.info("Taggstar Pixel Debug: register() callback starting...");
    console.info("Taggstar Pixel Debug: Init Data:", JSON.stringify(init));

    const accountNumber = settings.account_number;
    const sitekey = settings.siteKey || settings.sitekey;
    const region = settings.region || "emea";
    const enableConversion = settings.enable_conversion === "true";

    if (!accountNumber || !sitekey) {
        console.warn("Taggstar Pixel Debug: ABORTING - Account Number or Sitekey missing.");
        return;
    }

    // --- OMNI-LOGGING: Catch everything for debugging ---
    analytics.subscribe("all_events", (event) => {
        console.log("Taggstar Pixel Debug: [OMNI] Event Received:", event.name);
    });

    // Client-Side XHR Tracking for Checkout Completed
    analytics.subscribe("checkout_completed", (event) => {
        console.info("Taggstar Pixel Debug: checkout_completed event triggered.");

        const checkout = event.data?.checkout;
        if (!checkout) {
            console.warn("Taggstar Pixel Debug: No checkout context found.");
            return;
        }

        // Extract cookies bridged into attributes
        const attributes = checkout.attributes || [];
        let visitorId = null;
        let sessionId = null;

        attributes.forEach(attr => {
            if (attr.key === "_taggstar_visitor_id") visitorId = attr.value;
            if (attr.key === "_taggstar_session_id") sessionId = attr.value;
        });

        if (!visitorId || !sessionId) {
            console.warn("Taggstar Pixel Debug: XHR ABORTED - Visitor ID or Session ID missing from checkout attributes.");
            return;
        }

        // Extract secure Order ID instead of Checkout ID
        const rawOrderId = checkout.order?.id;
        const orderId = rawOrderId ? rawOrderId.replace("gid://shopify/Order/", "") : String(event.id);

        const revenue = parseFloat(checkout.totalPrice?.amount || 0.0);
        const currency = checkout.currencyCode || checkout.totalPrice?.currencyCode || "GBP";

        // Structure the Taggstar Nested Payload (V2) - EXACTLY as per latest screenshot
        const taggstarPayload = {
            visitor: {
                id: visitorId,
                sessionId: sessionId
            },
            order: {
                id: orderId,
                totalPrice: revenue,
                currency: currency,
                orderItems: (checkout.lineItems || []).map(item => {
                    const productIdObj = item.variant?.product?.id;
                    const productId = productIdObj ? String(productIdObj).replace("gid://shopify/Product/", "") : (item.title || "unknown");
                    
                    return {
                        id: productId,
                        quantity: item.quantity || 1,
                        unitPrice: String(parseFloat(item.finalLinePrice?.amount || item.price?.amount || 0.0).toFixed(1))
                    };
                })
            }
        };

        // Determine Taggstar Direct Endpoint
        const taggstarBaseUrl = region === "us" ? "https://api.us-east-2.taggstar.com" : "https://api.taggstar.com";
        const taggstarEndpoint = `${taggstarBaseUrl}/api/v2/key/${sitekey}/conversion/order`;

        const authEnabled = settings.auth_enabled === "true";

        const tryProxyFallback = () => {
            const appUrl = settings?.appUrl;
            const pixelSecret = settings?.pixelSecret;

            if (!appUrl || !pixelSecret) {
                console.warn("Taggstar Pixel Debug: Proxy URL or Pixel Secret missing. Cannot fallback.");
                return;
            }

            const normalizedAppUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
            const proxyEndpoint = `${normalizedAppUrl}/api/conversion`;
            
            console.info(`Taggstar Pixel Debug: FALLING BACK to REST Proxy -> ${proxyEndpoint}`);
            
            fetch(proxyEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-taggstar-pixel-secret": pixelSecret },
                body: JSON.stringify(taggstarPayload),
                keepalive: true
            }).then(res => res.text()).then(text => {
                console.info("Taggstar Pixel Debug: Proxy Response:", text);
            }).catch(err => {
                console.error("Taggstar Pixel Debug: Proxy Fallback Failed", err);
            });
        };

        // Strategy: If Auth is disabled, TRY DIRECT XHR FIRST. If it fails or Auth is enabled, use Proxy.
        if (!authEnabled) {
            console.info(`Taggstar Pixel Debug: Attempting DIRECT XHR to Taggstar -> ${taggstarEndpoint}`);
            
            fetch(taggstarEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(taggstarPayload),
                keepalive: true
            }).then(res => {
                if (res.ok) {
                    console.info("Taggstar Pixel Debug: Direct XHR Success!");
                } else {
                    console.warn(`Taggstar Pixel Debug: Direct XHR returned ${res.status}. Falling back...`);
                    tryProxyFallback();
                }
            }).catch(err => {
                console.warn("Taggstar Pixel Debug: Direct XHR Exception (likely CORS or Sandbox). Falling back...", err);
                tryProxyFallback();
            });
        } else {
            console.info("Taggstar Pixel Debug: Auth is enabled. Routing directly to Proxy.");
            tryProxyFallback();
        }
    });
});
