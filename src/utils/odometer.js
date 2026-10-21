import { formatDate } from './dates';

// Odometer readings live in `odometer_readings` (see supabase/migration_odometer_readings.sql).
// Rental and service readings are mirrored there by database triggers; the vehicle's current
// odometer is derived from the latest-dated reading. The app only adds manual readings.

export const ODOMETER_SOURCES = {
  rental_start:  'Rental start',
  rental_return: 'Rental return',
  service:       'Service',
  manual:        'Manual',
};

export const formatKm = (n) => (n === null || n === undefined || n === '') ? '—' : `${Number(n).toLocaleString()} km`;

// Newest first; higher reading first on the same day.
export const readingsFor = (readings, vehicleId) =>
  readings.filter(r => r.vehicleId === vehicleId)
    .sort((a, b) => b.readAt.localeCompare(a.readAt) || Number(b.reading) - Number(a.reading));

export const latestReading = (readings, vehicleId) => readingsFor(readings, vehicleId)[0] || null;

// One line for hints: "9,545 km on 19 Oct 2026 · Rental start".
export const describeReading = (r) => r ? `${formatKm(r.reading)} on ${formatDate(r.readAt)} · ${ODOMETER_SOURCES[r.source] || r.source}` : '';

// A reading lower than one taken earlier is usually a typo. Returns that earlier reading, or null.
// `excludeSourceId` skips the row being edited so it does not conflict with itself.
export const conflictingReading = (readings, vehicleId, km, date, excludeSourceId) => {
  const n = Number(km);
  if (!n || !date) return null;
  return readingsFor(readings, vehicleId).find(r =>
    r.sourceId !== excludeSourceId && r.readAt <= date && Number(r.reading) > n
  ) || null;
};

// Soft guard shared by the rental, service and manual forms. True = go ahead.
export const confirmOdometer = (readings, vehicleId, km, date, excludeSourceId) => {
  const c = conflictingReading(readings, vehicleId, km, date, excludeSourceId);
  if (!c) return true;
  return window.confirm(`${formatKm(km)} is lower than an earlier reading of ${describeReading(c)}.\n\nSave it anyway? (Choose Cancel to correct a typo.)`);
};
