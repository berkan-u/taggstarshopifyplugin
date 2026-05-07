async function test(name, baseUrl, payloadObj) {
  const siteKey = 'demopseu';
  const shop = 'taggstarplugindev.myshopify.com';
  const payload = JSON.stringify(payloadObj);
  const endpoint = `${baseUrl}/api/v2/key/${siteKey}/conversion/order`;

  const headers = {
    'Content-Type': 'application/json',
    'Origin': `https://${shop}`,
    'Referer': `https://${shop}/`,
    'User-Agent': 'Mozilla/5.0'
  };

  const res = await fetch(endpoint, { method: 'POST', headers, body: payload });
  console.log(`${name} (${baseUrl}) -> ${res.status} ${await res.text()}`);
}

async function run() {
  const payload = {
    visitor: { id: "test", sessionId: "test" },
    order: { id: "test-" + Date.now(), totalPrice: 50, currency: "USD", orderItems: [] }
  };

  await test("Nested", "https://api.us-east-2.taggstar.com", payload);
}
run();
