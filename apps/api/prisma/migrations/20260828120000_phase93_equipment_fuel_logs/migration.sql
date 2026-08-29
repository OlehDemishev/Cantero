-- CreateTable
CREATE TABLE "equipment_fuel_logs" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "filledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quantity" DECIMAL(10,2) NOT NULL,
    "cost" DECIMAL(12,2),
    "meterHours" DECIMAL(10,1),
    "supplierId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_fuel_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "equipment_fuel_logs_equipmentId_idx" ON "equipment_fuel_logs"("equipmentId");

-- AddForeignKey
ALTER TABLE "equipment_fuel_logs" ADD CONSTRAINT "equipment_fuel_logs_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_fuel_logs" ADD CONSTRAINT "equipment_fuel_logs_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

