-- CreateTable
CREATE TABLE "portal_messages" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorClientId" TEXT,
    "authorName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "portal_messages_companyId_idx" ON "portal_messages"("companyId");

-- CreateIndex
CREATE INDEX "portal_messages_projectId_idx" ON "portal_messages"("projectId");

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_messages" ADD CONSTRAINT "portal_messages_authorClientId_fkey" FOREIGN KEY ("authorClientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
