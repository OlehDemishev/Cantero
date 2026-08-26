-- CreateTable
CREATE TABLE "equipment_gps_pings" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_gps_pings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_gps_pings_equipmentId_recordedAt_idx" ON "equipment_gps_pings"("equipmentId", "recordedAt");

-- AddForeignKey
ALTER TABLE "equipment_gps_pings" ADD CONSTRAINT "equipment_gps_pings_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

