ALTER TABLE "photos" ADD COLUMN "latitude" real;
ALTER TABLE "photos" ADD COLUMN "longitude" real;
CREATE INDEX "photos_coordinates_idx" ON "photos" USING btree ("latitude", "longitude");
