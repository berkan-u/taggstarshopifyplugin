import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

const DEBUG_PREFIX = "[TAGGSTAR_DEBUG] [OrderCopy Proxy]";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log(`${DEBUG_PREFIX} Incoming request: ${request.url}`);

  const { session } = await authenticate.public.appProxy(request);

  if (!session) {
    console.log(`${DEBUG_PREFIX} Authentication failed — no session.`);
    return new Response("Unauthorized", { status: 401 });
  }

  console.log(`${DEBUG_PREFIX} Authenticated. Shop: ${session.shop}`);

  const url = new URL(request.url);
  const orderId = url.searchParams.get("order_id");

  console.log(`${DEBUG_PREFIX} Requested order_id: ${orderId}`);

  if (!orderId) {
    console.log(`${DEBUG_PREFIX} Missing order_id parameter.`);
    return json({ error: "Missing order_id" }, { status: 400 });
  }

  // Find the diagnostic log for this order
  console.log(`${DEBUG_PREFIX} Querying DiagnosticLog for orderId: ${orderId}`);
  const diagnosticLog = await db.diagnosticLog.findUnique({
    where: { orderId: String(orderId) },
  });

  if (!diagnosticLog) {
    console.log(`${DEBUG_PREFIX} No DiagnosticLog found for orderId: ${orderId}`);
    return json({ 
      error: "Log not found", 
      message: "The conversion relay may still be in progress or failed to save. Please refresh in a few seconds." 
    }, { status: 404 });
  }

  console.log(`${DEBUG_PREFIX} DiagnosticLog found. Status: ${diagnosticLog.status}, CreatedAt: ${diagnosticLog.createdAt}`);

  // Return the full diagnostic data
  const result = {
    diagnostic: {
      orderId: diagnosticLog.orderId,
      relayStatus: diagnosticLog.status,
      timestamp: diagnosticLog.createdAt,
      requestPayload: JSON.parse(diagnosticLog.requestPayload),
      taggstarResponse: JSON.parse(diagnosticLog.responseBody),
    }
  };

  console.log(`${DEBUG_PREFIX} Returning diagnostic result:`, JSON.stringify(result));
  return json(result);
};
