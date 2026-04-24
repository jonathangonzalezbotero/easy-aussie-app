export const formatDate = (d) => {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
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
