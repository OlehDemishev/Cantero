-- CreateTable
CREATE TABLE "client_portal_login_tokens" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_portal_login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_portal_login_tokens_token_key" ON "client_portal_login_tokens"("token");

-- CreateIndex
CREATE INDEX "client_portal_login_tokens_clientId_idx" ON "client_portal_login_tokens"("clientId");

-- AddForeignKey
ALTER TABLE "client_portal_login_tokens" ADD CONSTRAINT "client_portal_login_tokens_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
