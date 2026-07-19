ALTER TABLE "Product"
ADD COLUMN "optionTree" JSONB NOT NULL DEFAULT '{}';

ALTER TABLE "ProductVariant"
ADD COLUMN "optionPath" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "variantSignature" TEXT,
ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ProductVariant_productId_variantSignature_key"
ON "ProductVariant"("productId", "variantSignature");
