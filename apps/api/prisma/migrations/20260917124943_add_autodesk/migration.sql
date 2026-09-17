-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "autodeskProjectId" TEXT;

-- AlterTable
ALTER TABLE "punch_list_items" ADD COLUMN     "autodeskIssueId" TEXT;

-- CreateTable
CREATE TABLE "autodesk_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "hubId" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autodesk_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "autodesk_connections_companyId_key" ON "autodesk_connections"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "punch_list_items_autodeskIssueId_key" ON "punch_list_items"("autodeskIssueId");

-- AddForeignKey
ALTER TABLE "autodesk_connections" ADD CONSTRAINT "autodesk_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

