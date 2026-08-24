-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "geofenceLat" DOUBLE PRECISION,
ADD COLUMN     "geofenceLng" DOUBLE PRECISION,
ADD COLUMN     "geofenceRadiusMeters" INTEGER;

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN     "clockInLat" DOUBLE PRECISION,
ADD COLUMN     "clockInLng" DOUBLE PRECISION,
ADD COLUMN     "distanceFromSiteMeters" INTEGER,
ADD COLUMN     "withinGeofence" BOOLEAN;
