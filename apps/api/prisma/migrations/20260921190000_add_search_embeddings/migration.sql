-- CreateTable
CREATE TABLE "search_embeddings" (
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "projectId" TEXT,
    "contentHash" TEXT NOT NULL,
    "embedding" REAL[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_embeddings_pkey" PRIMARY KEY ("entityType","entityId")
);

-- CreateIndex
CREATE INDEX "search_embeddings_companyId_idx" ON "search_embeddings"("companyId");

