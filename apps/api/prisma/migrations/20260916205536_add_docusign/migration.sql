-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "docusignEnvelopeId" TEXT,
ADD COLUMN     "docusignSignedPdfKey" TEXT,
ADD COLUMN     "docusignStatus" TEXT;

-- CreateTable
CREATE TABLE "docusign_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "accountId" TEXT NOT NULL,
    "apiBaseUrl" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "docusign_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "docusign_connections_companyId_key" ON "docusign_connections"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "contracts_docusignEnvelopeId_key" ON "contracts"("docusignEnvelopeId");

-- AddForeignKey
ALTER TABLE "docusign_connections" ADD CONSTRAINT "docusign_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

