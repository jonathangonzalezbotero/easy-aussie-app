export const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

// For full ISO timestamps (e.g. Supabase created_at), unlike formatDate which
// expects a plain YYYY-MM-DD string.
export const formatTimestamp = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const daysUntil = (dateStr) => {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target - today) / 86400000);
};

export const daysBetween = (a, b) => {
  const d1 = new Date(a + 'T00:00:00'), d2 = new Date(b + 'T00:00:00');
  return Math.round((d2 - d1) / 86400000);
};

export const todayStr = () => new Date().toISOString().split('T')[0];

// Whole years between a YYYY-MM-DD date of birth and a reference date (defaults to today).
// Returns null when there is no date of birth.
export const ageOn = (dob, onDate) => {
  if (!dob) return null;
  const b = new Date(dob + 'T12:00:00');
  const d = onDate ? new Date(onDate + 'T12:00:00') : new Date();
  if (isNaN(b) || isNaN(d)) return null;
  let age = d.getFullYear() - b.getFullYear();
  const beforeBirthday = d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age;
};

// Renters under this age are flagged so the owner can mention that prices may vary.
export const YOUNG_RENTER_AGE = 25;
export const isYoungRenter = (dob, onDate) => {
  const age = ageOn(dob, onDate);
  return age !== null && age < YOUNG_RENTER_AGE;
};
