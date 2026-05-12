-- Backfill vehicles.odometer from the highest known reading per vehicle.
-- Sources (in order of accuracy):
--   1. rentals.odometer_return  — km when the vehicle was returned
--   2. maintenance.odometer     — km recorded at time of service
--   3. rentals.odometer         — km at rental start (lowest accuracy, last resort)
--
-- Strategy: take MAX across all sources so the vehicle always ends up with the
-- highest (most recent) reading. Only updates vehicles that have no odometer set
-- or where the computed value is higher than what's already stored.
--
-- Safe to run multiple times (idempotent).

WITH all_readings AS (

  -- Return odometer: most accurate — recorded when vehicle came back
  SELECT vehicle_id, odometer_return::numeric AS odometer
  FROM rentals
  WHERE odometer_return IS NOT NULL

  UNION ALL

  -- Maintenance odometer
  SELECT vehicle_id, odometer::numeric AS odometer
  FROM maintenance
  WHERE odometer IS NOT NULL

  UNION ALL

  -- Start odometer: least accurate (vehicle was driven further after this)
  SELECT vehicle_id, odometer::numeric AS odometer
  FROM rentals
  WHERE odometer IS NOT NULL

),
max_per_vehicle AS (
  SELECT vehicle_id, MAX(odometer) AS odometer
  FROM all_readings
  GROUP BY vehicle_id
)
UPDATE vehicles v
SET    odometer = mpv.odometer
FROM   max_per_vehicle mpv
WHERE  v.id = mpv.vehicle_id
  AND  (v.odometer IS NULL OR mpv.odometer > v.odometer);
