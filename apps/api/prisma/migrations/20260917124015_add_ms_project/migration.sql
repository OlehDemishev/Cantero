-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "msProjectExternalId" TEXT;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "msProjectExternalId" TEXT;

-- CreateTable
CREATE TABLE "ms_project_connections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "environmentUrl" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ms_project_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ms_project_connections_companyId_key" ON "ms_project_connections"("companyId");

-- AddForeignKey
ALTER TABLE "ms_project_connections" ADD CONSTRAINT "ms_project_connections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

