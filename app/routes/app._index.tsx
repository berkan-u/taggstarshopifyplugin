import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs, LinksFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, useLoaderData, useNavigation, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  BlockStack,
  TextField,
  FormLayout,
  Select,
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
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const accountNumber = String(formData.get("accountNumber") || "");
  const siteKey = String(formData.get("siteKey") || "");
  const region = String(formData.get("region") || "emea");

  await prisma.configuration.upsert({
    where: { shop: session.shop },
    update: { accountNumber, siteKey, region },
    create: { shop: session.shop, accountNumber, siteKey, region },
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
        ],
      },
    }
  );

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
  const [isSaved, setIsSaved] = useState(false);

  const handleAccountNumberChange = useCallback((value: string) => { setAccountNumber(value); setIsSaved(false); }, []);
  const handleSiteKeyChange = useCallback((value: string) => { setSiteKey(value); setIsSaved(false); }, []);
  const handleRegionChange = useCallback((value: string) => { setRegion(value); setIsSaved(false); }, []);

  const isLoading = navigation.state === "submitting";

  useEffect(() => {
    if (actionData?.status === "success") {
      shopify.toast.show("Settings saved");
      setIsSaved(true);
    }
  }, [actionData, shopify]);

  const handleSave = () => {
    submit({ accountNumber, siteKey, region }, { method: "post" });
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
