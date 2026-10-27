// Case-insensitive "contains" across any number of fields. Empty query matches everything.
export const matchesSearch = (query, ...fields) => {
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every(word => fields.some(f => f != null && String(f).toLowerCase().includes(word)));
};

// Sold and stolen vehicles go last in pickers and carry a badge.
export const OUT_OF_FLEET = ['sold', 'stolen'];
export const vehicleSortKey = (v) => (OUT_OF_FLEET.includes(v.status) ? 1 : 0);
