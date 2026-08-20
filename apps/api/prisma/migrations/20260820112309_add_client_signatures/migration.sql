-- AlterTable
ALTER TABLE "change_orders" ADD COLUMN     "signatureImageKey" TEXT,
ADD COLUMN     "signedIp" TEXT,
ADD COLUMN     "signerName" TEXT;

-- AlterTable
ALTER TABLE "estimates" ADD COLUMN     "signatureImageKey" TEXT,
ADD COLUMN     "signedIp" TEXT,
ADD COLUMN     "signerName" TEXT;
