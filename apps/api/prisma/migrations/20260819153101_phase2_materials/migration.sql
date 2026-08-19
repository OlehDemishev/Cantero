/*
  Warnings:

  - The `status` column on the `purchase_orders` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('draft', 'ordered', 'received');

-- AlterTable
ALTER TABLE "material_catalog_items" ADD COLUMN     "reorderThreshold" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "purchase_orders" ADD COLUMN     "receivedAt" TIMESTAMP(3),
DROP COLUMN "status",
ADD COLUMN     "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'draft';
