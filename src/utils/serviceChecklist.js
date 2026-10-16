// Service checklists. The 2-stroke lists follow the Zoot (LJ1PE40QMB-2, 49cc 2-stroke, CVT) owner's
// manual inspection plan: 1st service at 1,000 km, then every 3,000 km / 6 months, 6,000 km / 12 months
// and 12,000 km / 24 months. Each level includes the lower levels. Hints carry the manual's figures.
// The 4-stroke and e-bike lists are generic workshop lists (based on Coastline Mopeds' included works).

const Z = {
  // item: [label, hint, { first, k3, k6, k12 }] where the value is the action at that level: I, R, C, L, 'I/R', 'I/L'
  airCleaner:   ['Air cleaner (foam filter)', 'Foam element. Clean at 3,000 km, replace at 12,000 km.', { first: 'I', k3: 'C', k12: 'R' }],
  fuelFilter:   ['Fuel filter', 'Replace at 12,000 km.', { first: 'I', k3: 'I', k12: 'R' }],
  sparkPlug:    ['Spark plug', 'NGK BPR7HS, gap 0.6–0.7 mm. Replace at 12,000 km or if worn.', { first: 'I', k3: 'I', k12: 'R' }],
  ignition:     ['Ignition timing', 'CDI electronic ignition.', { first: 'I', k3: 'I' }],
  carb:         ['Carburettor idle speed', '1,800 ± 180 rpm. TK PZ15 carburettor.', { first: 'I', k3: 'I' }],
  throttle:     ['Throttle cable free play', '', { first: 'I', k3: 'I' }],
  transOil:     ['Transmission (gearbox) oil', 'Hypoid SAE 85W-140 or 80W-90 GL5, 0.10 L. Replace at 1st service and every 6,000 km.', { first: 'R', k3: 'I', k6: 'R' }],
  transLeak:    ['Transmission: check for leaks', '', { first: 'I', k3: 'I' }],
  crankLeak:    ['Crankcase: check for leaks', '', { first: 'I', k3: 'I' }],
  crankVent:    ['Crankcase ventilation', '', { first: 'I', k3: 'I' }],
  belt:         ['Drive belt and rollers', 'Inspect at 3,000 km, inspect/replace at 6,000 km.', { k3: 'I', k6: 'I/R' }],
  clutch:       ['Clutch discs', 'Inspect at 3,000 km, inspect/replace at 6,000 km.', { k3: 'I', k6: 'I/R' }],
  boltsEngine:  ['Bolts and nuts (engine)', '', { first: 'I', k3: 'I' }],
  exhaust:      ['Exhaust system', '', { first: 'I', k3: 'I' }],
  fuelTank:     ['Fuel tank and fuel hoses', 'Premium unleaded, min. 95 octane. Tank 5.5 L.', { first: 'I', k3: 'I' }],
  battery:      ['Battery', '12V 4Ah MF. Fuse 10A.', { first: 'I', k3: 'I' }],
  steering:     ['Steering and head bearings', '', { first: 'I', k3: 'I' }],
  suspension:   ['Front and rear suspension', 'Telescopic fork, unit swing rear.', { first: 'I', k6: 'I' }],
  shock:        ['Shock absorber', '', { first: 'I', k6: 'I' }],
  tyres:        ['Tyre pressure and wear', 'Front 1.75 bar, rear 2.0 bar (2.25 with pillion). 3.50-10 tubeless.', { first: 'I', k3: 'I' }],
  brakes:       ['Brake function and brake pads', 'Front disc 190 mm hydraulic, rear drum.', { first: 'I', k3: 'I' }],
  brakeFluid:   ['Brake fluid', 'Replace every 2 years.', { first: 'I', k3: 'I', k12: 'R' }],
  stands:       ['Main and side stand', 'Inspect and lubricate.', { first: 'I', k3: 'I/L' }],
  boltsChassis: ['Bolts and nuts (chassis)', '', { first: 'I', k3: 'I' }],
};
const ACTION = { I: 'Inspect / adjust', R: 'Replace', C: 'Clean', L: 'Lubricate', 'I/R': 'Inspect, replace if worn', 'I/L': 'Inspect and lubricate' };
const RIDE = ['Test ride', 'Assess general condition', 'Check 2T oil level and oil pump', 'Check lights, indicators, horn and brake light'];
const FINAL = ['Final test ride'];

// Highest action wins when a level includes lower levels (R > C > I/R > I/L > L > I).
const RANK = { I: 0, L: 1, 'I/L': 2, 'I/R': 3, C: 4, R: 5 };
function zootLevel(levels) {
  const items = [];
  for (const [label, hint, plan] of Object.values(Z)) {
    let action = null;
    for (const l of levels) if (plan[l] && (!action || RANK[plan[l]] > RANK[action])) action = plan[l];
    if (action) items.push({ item: `${ACTION[action]}: ${label}`, hint, action });
  }
  return [...RIDE.map(item => ({ item })), ...items, ...FINAL.map(item => ({ item }))];
}

export const CHECKLIST_TEMPLATES = {
  zoot_first: { label: '2-stroke · 1st service (1,000 km)', group: '2-stroke (Zoot manual)', items: zootLevel(['first']) },
  zoot_3k:    { label: '2-stroke · 3,000 km / 6 months',    group: '2-stroke (Zoot manual)', items: zootLevel(['k3']) },
  zoot_6k:    { label: '2-stroke · 6,000 km / 12 months',   group: '2-stroke (Zoot manual)', items: zootLevel(['k3', 'k6']) },
  zoot_12k:   { label: '2-stroke · 12,000 km / 24 months',  group: '2-stroke (Zoot manual)', items: zootLevel(['k3', 'k6', 'k12']) },
  pre_trip:   { label: 'Before each rental (manual pre-trip check)', group: '2-stroke (Zoot manual)', items: [
    { item: 'Air cleaner, fuel filter, spark plug: quick look' }, { item: 'Idle speed and throttle cable' }, { item: 'Transmission oil level, no leaks (gearbox and crankcase)' },
    { item: 'Engine and chassis bolts tight' }, { item: 'Fuel tank and hoses, no leaks' }, { item: 'Battery' }, { item: 'Steering, suspension, shock' },
    { item: 'Tyre pressure: front 1.75 bar, rear 2.0 bar' }, { item: 'Brakes and brake fluid' }, { item: 'Stands' }, { item: 'Lights, indicators, horn' }, { item: '2T oil topped up' }] },
  four_stroke: { label: '4-stroke service (generic)', group: 'Other', items: [
    'Test ride', 'Assess general condition', 'Replace engine oil', 'Remove and replace oil filter (if required)', 'Flush gearbox oil (if required)', 'Check CVT belt and rollers',
    'Adjust throttle cable free play', 'Assess steering head bearings', 'Clean / check air filter', 'Adjust idle speed / air mixture', 'Check headlight, tail light, turn signals, horn',
    'Check and adjust tyre pressures', 'Assess tyre wear and condition', 'Check electrical system charge rate', 'Check brake pad wear', 'Check / top up cooling system (if fitted)',
    'Top up brake fluid (if required)', 'Adjust brakes as required', 'Tighten all critical bolts', 'Replace spark plug', 'Check front axle', 'Lubricate brake levers', 'Lubricate stands', 'Final test ride'].map(item => ({ item })) },
  ebike: { label: 'E-bike service', group: 'Other', items: [
    'Test ride', 'Assess general condition', 'Check battery charge and connectors', 'Check motor cables and controller', 'Check brake pad wear', 'Adjust brakes as required',
    'Check and adjust tyre pressures', 'Assess tyre wear and condition', 'Check lights, horn and display', 'Lubricate chain / check belt', 'Tighten all critical bolts', 'Check stand and handlebar', 'Final test ride'].map(item => ({ item })) },
  inspection: { label: 'Safety inspection', group: 'Other', items: ['Test ride', 'Assess general condition', 'Check brakes', 'Check tyres and pressures', 'Check lights, indicators and horn', 'Check mirrors and controls', 'Check for leaks', 'Tighten all critical bolts'].map(item => ({ item })) },
};

const isTwoStroke = (vehicle) => {
  if (!vehicle || vehicle.type === 'ebike') return false;
  const text = `${vehicle.make || ''} ${vehicle.model || ''} ${vehicle.name || ''} ${vehicle.engineCapacity || ''} ${vehicle.notes || ''}`.toLowerCase();
  return /zoot|2[\s-]?(stroke|t\b)|two[\s-]stroke|lj1pe40|lj50qt/.test(text);
};

// Which 2-stroke service level the odometer points at. Each level includes the lower ones.
export function zootLevelForKm(km, hadFirstService) {
  const n = Number(km) || 0;
  if (!n) return 'zoot_3k';
  if (n < 2000 && !hadFirstService) return 'zoot_first';
  const step = Math.round(n / 3000);
  if (step > 0 && step % 4 === 0) return 'zoot_12k';
  if (step > 0 && step % 2 === 0) return 'zoot_6k';
  return 'zoot_3k';
}

// Suggested template for a form: vehicle, entry type, odometer typed on the entry, and whether this vehicle has earlier services.
export function templateFor(vehicle, type = 'service', { odometer, hadFirstService = false } = {}) {
  if (type === 'inspection') return isTwoStroke(vehicle) ? 'pre_trip' : 'inspection';
  if (type !== 'service') return null;
  if (!vehicle) return 'four_stroke';
  if (vehicle.type === 'ebike') return 'ebike';
  if (isTwoStroke(vehicle)) return zootLevelForKm(odometer || vehicle.odometer, hadFirstService);
  return 'four_stroke';
}

export const buildChecklist = (templateKey) => (CHECKLIST_TEMPLATES[templateKey]?.items || []).map(i => ({ item: i.item, hint: i.hint || undefined, done: false }));
export const checklistProgress = (list) => { const total = list?.length || 0; const done = (list || []).filter(i => i.done).length; return { total, done, pct: total ? done / total : 0 }; };
export const templateGroups = () => { const g = {}; for (const [k, t] of Object.entries(CHECKLIST_TEMPLATES)) (g[t.group] ||= []).push([k, t]); return g; };
