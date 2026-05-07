-- CreateTable
CREATE TABLE "DiagnosticLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestPayload" TEXT NOT NULL,
    "responseBody" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Configuration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shop" TEXT NOT NULL,
    "accountNumber" TEXT,
    "siteKey" TEXT,
    "region" TEXT DEFAULT 'emea',
    "authEnabled" BOOLEAN NOT NULL DEFAULT false,
    "accessKey" TEXT,
    "secretKey" TEXT,
    "enableCategory" BOOLEAN NOT NULL DEFAULT false,
    "enablePDP" BOOLEAN NOT NULL DEFAULT false,
    "enableBasket" BOOLEAN NOT NULL DEFAULT false,
    "enableConversion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Configuration" ("accountNumber", "createdAt", "enableBasket", "enableCategory", "enableConversion", "enablePDP", "id", "region", "shop", "siteKey", "updatedAt") SELECT "accountNumber", "createdAt", "enableBasket", "enableCategory", "enableConversion", "enablePDP", "id", "region", "shop", "siteKey", "updatedAt" FROM "Configuration";
DROP TABLE "Configuration";
ALTER TABLE "new_Configuration" RENAME TO "Configuration";
CREATE UNIQUE INDEX "Configuration_shop_key" ON "Configuration"("shop");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticLog_orderId_key" ON "DiagnosticLog"("orderId");
