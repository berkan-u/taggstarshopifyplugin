import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  BlockStack,
  TextField,
  FormLayout,
  Select,
  Checkbox,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import customStyles from "../styles/custom.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: customStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const config = await prisma.configuration.findUnique({
    where: { shop: session.shop },
  });

  return json({
    accountNumber: config?.accountNumber || "",
    siteKey: config?.siteKey || "",
    region: config?.region || "emea",
    authEnabled: config?.authEnabled || false,
    accessKey: config?.accessKey || "",
    secretKey: config?.secretKey || "",
    pixelSecret: config?.pixelSecret || "",
    enableCategory: config?.enableCategory || false,
    enablePDP: config?.enablePDP || false,
    enableBasket: config?.enableBasket || false,
    enableConversion: config?.enableConversion || false,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const logPath = path.join(process.cwd(), "taggstar_server.log");
  const log = (msg: string) => fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

  log("============== TAGGSTAR ACTION START ==============");
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  log(`Taggstar App Diagnostic: Shop: ${session.shop}, ClientID: ${process.env.SHOPIFY_API_KEY || "Unknown"}`);

  const accountNumber = String(formData.get("accountNumber") || "");
  const siteKey = String(formData.get("siteKey") || "");
  const region = String(formData.get("region") || "emea");
  const authEnabled = formData.get("authEnabled") === "true";
  const accessKey = String(formData.get("accessKey") || "");
  const secretKey = String(formData.get("secretKey") || "");
  const enableCategory = formData.get("enableCategory") === "true";
  const enablePDP = formData.get("enablePDP") === "true";
  const enableBasket = formData.get("enableBasket") === "true";
  const enableConversion = formData.get("enableConversion") === "true";

  // Auto-generate a pixelSecret if one doesn't already exist for this shop
  // This secret is used by the Web Pixel to authenticate with /api/conversion
  const existingConfig = await prisma.configuration.findUnique({ where: { shop: session.shop } });
  const pixelSecret = existingConfig?.pixelSecret || crypto.randomBytes(32).toString("hex");

  // The app URL is the current tunnel/production URL (used by the pixel to know where to POST)
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  log(`[APP_INDEX] pixelSecret=${pixelSecret.substring(0, 8)}... appUrl=${appUrl}`);

  await prisma.configuration.upsert({
    where: { shop: session.shop },
    update: { accountNumber, siteKey, region, authEnabled, accessKey, secretKey, pixelSecret, enableCategory, enablePDP, enableBasket, enableConversion },
    create: { shop: session.shop, accountNumber, siteKey, region, authEnabled, accessKey, secretKey, pixelSecret, enableCategory, enablePDP, enableBasket, enableConversion },
  });

  const shopQuery = await admin.graphql(`query { shop { id } }`);
  const shopData = await shopQuery.json();
  const shopId = shopData.data.shop.id;

  await admin.graphql(
    `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          { ownerId: shopId, namespace: "taggstar", key: "account_number", value: accountNumber, type: "single_line_text_field" },
          { ownerId: shopId, namespace: "taggstar", key: "sitekey", value: siteKey, type: "single_line_text_field" },
          { ownerId: shopId, namespace: "taggstar", key: "region", value: region, type: "single_line_text_field" },
          { ownerId: shopId, namespace: "taggstar", key: "enable_category", value: String(enableCategory), type: "boolean" },
          { ownerId: shopId, namespace: "taggstar", key: "enable_pdp", value: String(enablePDP), type: "boolean" },
          { ownerId: shopId, namespace: "taggstar", key: "enable_basket", value: String(enableBasket), type: "boolean" },
          { ownerId: shopId, namespace: "taggstar", key: "enable_conversion", value: String(enableConversion), type: "boolean" },
        ],
      },
    }
  );

  // --- Web Pixel settings management ---
  // appUrl and pixelSecret are passed to the Web Pixel so it can securely hit our REST proxy
  const pixelSettings = JSON.stringify({
    account_number: accountNumber,
    sitekey: siteKey,
    region,
    enable_conversion: String(enableConversion),
    auth_enabled: String(authEnabled),
    appUrl,
    pixelSecret,
  });

  try {
    log("Taggstar App: Forcing Web Pixel Creation/Update...");
    
    // Attempt to create. If it fails because one exists, we log it and move on.
    const createMutation = await admin.graphql(
      `mutation webPixelCreate($webPixel: WebPixelInput!) {
        webPixelCreate(webPixel: $webPixel) {
          userErrors { code field message }
          webPixel { id }
        }
      }`,
      {
        variables: {
          webPixel: { settings: pixelSettings },
        },
      }
    );
    const createResult: any = await createMutation.json();
    
    if (createResult.data?.webPixelCreate?.userErrors?.some((e: any) => e.code === "TAKEN" || e.message.includes("exists"))) {
      log("Taggstar App: Pixel already exists. Moving to Update...");
      
      // Update the existing one instead
      const existingQuery = await admin.graphql(`query { webPixel { id } }`);
      const existingResp: any = await existingQuery.json();
      const pixelId = existingResp.data?.webPixel?.id;
      
      if (pixelId) {
        const updateMutation = await admin.graphql(
          `mutation webPixelUpdate($id: ID!, $webPixel: WebPixelInput!) {
            webPixelUpdate(id: $id, webPixel: $webPixel) {
              userErrors { code field message }
            }
          }`,
          {
            variables: {
              id: pixelId,
              webPixel: { settings: pixelSettings },
            },
          }
        );
        const updateResult: any = await updateMutation.json();
        log(`Taggstar App: Update result: ${JSON.stringify(updateResult)}`);
      }
    } else if (createResult.data?.webPixelCreate?.userErrors?.length) {
      log(`Taggstar App: Web Pixel CREATE ERROR: ${JSON.stringify(createResult.data.webPixelCreate.userErrors)}`);
    } else {
      log(`Taggstar App: Fresh Web Pixel created successfully: ${createResult.data.webPixelCreate.webPixel.id}`);
    }
  } catch (error: any) {
    log(`Taggstar App: UNEXPECTED EXCEPTION: ${error?.message || error}`);
  }

  return json({ status: "success" });
};

export default function Index() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const shopify = useAppBridge();

  const [accountNumber, setAccountNumber] = useState(loaderData.accountNumber);
  const [siteKey, setSiteKey] = useState(loaderData.siteKey);
  const [region, setRegion] = useState(loaderData.region);
  const [authEnabled, setAuthEnabled] = useState(loaderData.authEnabled);
  const [accessKey, setAccessKey] = useState(loaderData.accessKey);
  const [secretKey, setSecretKey] = useState(loaderData.secretKey);
  const [enableCategory, setEnableCategory] = useState(loaderData.enableCategory);
  const [enablePDP, setEnablePDP] = useState(loaderData.enablePDP);
  const [enableBasket, setEnableBasket] = useState(loaderData.enableBasket);
  const [enableConversion, setEnableConversion] = useState(loaderData.enableConversion);
  const [isSaved, setIsSaved] = useState(false);

  const handleAccountNumberChange = useCallback((value: string) => { setAccountNumber(value); setIsSaved(false); }, []);
  const handleSiteKeyChange = useCallback((value: string) => { setSiteKey(value); setIsSaved(false); }, []);
  const handleRegionChange = useCallback((value: string) => { setRegion(value); setIsSaved(false); }, []);
  const handleAuthEnabledChange = useCallback((value: boolean) => { setAuthEnabled(value); setIsSaved(false); }, []);
  const handleAccessKeyChange = useCallback((value: string) => { setAccessKey(value); setIsSaved(false); }, []);
  const handleSecretKeyChange = useCallback((value: string) => { setSecretKey(value); setIsSaved(false); }, []);
  const handleCategoryChange = useCallback((value: boolean) => { setEnableCategory(value); setIsSaved(false); }, []);
  const handlePDPChange = useCallback((value: boolean) => { setEnablePDP(value); setIsSaved(false); }, []);
  const handleBasketChange = useCallback((value: boolean) => { setEnableBasket(value); setIsSaved(false); }, []);
  const handleConversionChange = useCallback((value: boolean) => { setEnableConversion(value); setIsSaved(false); }, []);

  const isLoading = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.status === "success") {
      shopify.toast.show("Settings saved");
      setIsSaved(true);
    }
  }, [actionData, shopify]);

  const handleSave = () => {
    console.log("Taggstar Frontend: Save button clicked. Submitting to server...");
    submit({ 
      accountNumber, 
      siteKey, 
      region,
      authEnabled: String(authEnabled),
      accessKey,
      secretKey,
      enableCategory: String(enableCategory),
      enablePDP: String(enablePDP),
      enableBasket: String(enableBasket),
      enableConversion: String(enableConversion)
    }, { method: "post" });
  };

  const regionOptions = [
    { label: 'EMEA', value: 'emea' },
    { label: 'US/RoW', value: 'us' },
  ];

  return (
    <div className="taggstar-admin-container">
      <Page>
        <TitleBar title="Taggstar Settings" />
        <BlockStack gap="500">
          <Layout>
            <Layout.Section>
              <div className="taggstar-card">
                <BlockStack gap="500">
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <img src="/assets/logo.png" alt="Taggstar Logo" className="taggstar-logo" />
                  </div>
                  
                  <Text as="h2" variant="headingLg" alignment="center">
                    Taggstar Configuration
                  </Text>

                  <FormLayout>
                    <TextField
                      label="Taggstar Account Number"
                      value={accountNumber}
                      onChange={handleAccountNumberChange}
                      autoComplete="off"
                      disabled={isLoading}
                    />
                    <TextField
                      label="Taggstar Sitekey"
                      value={siteKey}
                      onChange={handleSiteKeyChange}
                      autoComplete="off"
                      disabled={isLoading}
                    />
                    <Select
                      label="Region"
                      options={regionOptions}
                      onChange={handleRegionChange}
                      value={region}
                      disabled={isLoading}
                    />

                    <div style={{ marginTop: '16px', borderTop: '1px solid #e1e3e5', paddingTop: '16px' }}>
                      <Text as="h3" variant="headingMd">Authentication Settings</Text>
                      <div style={{ marginTop: '8px' }}>
                        <BlockStack gap="300">
                          <Checkbox
                            label="Use Authenticated API Endpoints"
                            checked={authEnabled}
                            onChange={handleAuthEnabledChange}
                            disabled={isLoading}
                          />
                          {authEnabled && (
                            <BlockStack gap="300">
                              <TextField
                                label="Access Key"
                                value={accessKey}
                                onChange={handleAccessKeyChange}
                                autoComplete="off"
                                disabled={isLoading}
                              />
                              <TextField
                                label="Secret Key"
                                type="password"
                                value={secretKey}
                                onChange={handleSecretKeyChange}
                                autoComplete="off"
                                disabled={isLoading}
                              />
                            </BlockStack>
                          )}
                        </BlockStack>
                      </div>
                    </div>
                    
                    <div style={{ marginTop: '16px' }}>
                      <Text as="h3" variant="headingMd">Where should the JS tag fire?</Text>
                      <div style={{ marginTop: '8px' }}>
                        <BlockStack gap="200">
                          <Checkbox
                            label="Category Pages (PLP & Search)"
                            checked={enableCategory}
                            onChange={handleCategoryChange}
                            disabled={isLoading}
                          />
                          <Checkbox
                            label="Product Display Pages (PDP)"
                            checked={enablePDP}
                            onChange={handlePDPChange}
                            disabled={isLoading}
                          />
                          <Checkbox
                            label="Basket Page (Cart)"
                            checked={enableBasket}
                            onChange={handleBasketChange}
                            disabled={isLoading}
                          />
                          <Checkbox
                            label="Conversion Page (Order Confirmation)"
                            checked={enableConversion}
                            onChange={handleConversionChange}
                            disabled={isLoading}
                          />
                        </BlockStack>
                      </div>
                    </div>

                    <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center' }}>
                      <button 
                        onClick={handleSave} 
                        disabled={isLoading} 
                        className={`taggstar-button ${isSaved ? 'saved' : ''}`}
                        style={{ padding: '12px 40px', borderRadius: '8px', cursor: 'pointer' }}
                      >
                        {isLoading ? 'Saving...' : (isSaved ? <>Saved <span className="tick-icon">✓</span></> : 'Save Settings')}
                      </button>
                    </div>
                  </FormLayout>
                </BlockStack>
              </div>
            </Layout.Section>
          </Layout>
        </BlockStack>
      </Page>
    </div>
  );
}
