-- Add bedrooms column to units table
ALTER TABLE units ADD COLUMN bedrooms INTEGER;

-- Backfill bedrooms from existing unit_type enum values
UPDATE units SET bedrooms = 0 WHERE unit_type = 'studio';
UPDATE units SET bedrooms = 1 WHERE unit_type = '1br';
UPDATE units SET bedrooms = 2 WHERE unit_type = '2br';
UPDATE units SET bedrooms = 3 WHERE unit_type = '3br';
UPDATE units SET bedrooms = 4 WHERE unit_type = '4br';
