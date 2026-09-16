-- AlterTable
ALTER TABLE "bid_lines" ADD COLUMN     "positionNo" TEXT,
ADD COLUMN     "quantity" DECIMAL(14,4),
ADD COLUMN     "unitPrice" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "bid_request_lines" (
    "id" TEXT NOT NULL,
    "bidRequestId" TEXT NOT NULL,
    "positionNo" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(14,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bid_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bid_request_lines_bidRequestId_idx" ON "bid_request_lines"("bidRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "bid_request_lines_bidRequestId_positionNo_key" ON "bid_request_lines"("bidRequestId", "positionNo");

-- AddForeignKey
ALTER TABLE "bid_request_lines" ADD CONSTRAINT "bid_request_lines_bidRequestId_fkey" FOREIGN KEY ("bidRequestId") REFERENCES "bid_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
