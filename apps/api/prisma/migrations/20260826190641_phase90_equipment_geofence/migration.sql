-- AlterTable
ALTER TABLE "equipment_assignments" ADD COLUMN     "checkInDistanceFromSiteM" INTEGER,
ADD COLUMN     "checkInLat" DOUBLE PRECISION,
ADD COLUMN     "checkInLng" DOUBLE PRECISION,
ADD COLUMN     "checkInWithinGeofence" BOOLEAN,
ADD COLUMN     "checkOutDistanceFromSiteM" INTEGER,
ADD COLUMN     "checkOutLat" DOUBLE PRECISION,
ADD COLUMN     "checkOutLng" DOUBLE PRECISION,
ADD COLUMN     "checkOutWithinGeofence" BOOLEAN;
