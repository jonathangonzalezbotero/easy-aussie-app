import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const StoreContext = createContext(null);

// ── Normalizers: Supabase (snake_case) ↔ App (camelCase) ────────────────────

const vehicleFromDb = (v) => ({
  id: v.id, plate: v.plate, name: v.name, make: v.make, model: v.model,
  year: v.year, colour: v.colour, status: v.status,
  regoExpiry: v.rego_expiry, nextServiceDate: v.next_service_date,
  engineCapacity: v.engine_capacity, type: v.type, fleetGroup: v.fleet_group,
  purchaseDate: v.purchase_date, conditionNotes: v.condition_notes, notes: v.notes,
});

const vehicleToDb = (v) => ({
  plate: v.plate, name: v.name || null, make: v.make || null, model: v.model || null,
  year: v.year || null, colour: v.colour || null, status: v.status || 'available',
  rego_expiry: v.regoExpiry || null, next_service_date: v.nextServiceDate || null,
  engine_capacity: v.engineCapacity || null, type: v.type || 'scooter',
  fleet_group: v.fleetGroup || 'business', purchase_date: v.purchaseDate || null,
  condition_notes: v.conditionNotes || null, notes: v.notes || null,
});

const customerFromDb = (c) => ({
  id: c.id, name: c.name, dateOfBirth: c.date_of_birth, phone: c.phone, email: c.email,
  address: c.address, occupation: c.occupation, emergencyContact: c.emergency_contact,
  emergencyPhone: c.emergency_phone, hotelAddress: c.hotel_address,
  licenseRef: c.license_ref, licencePhoto: c.licence_photo, notes: c.notes,
});

const customerToDb = (c) => ({
  name: c.name, date_of_birth: c.dateOfBirth || null, phone: c.phone || null,
  email: c.email || null, address: c.address || null, occupation: c.occupation || null,
  emergency_contact: c.emergencyContact || null, emergency_phone: c.emergencyPhone || null,
  hotel_address: c.hotelAddress || null, license_ref: c.licenseRef || null,
  licence_photo: c.licencePhoto || null, notes: c.notes || null,
});

const rentalFromDb = (r) => ({
  id: r.id, customerId: r.customer_id, vehicleId: r.vehicle_id,
  startDate: r.start_date, endDate: r.end_date, status: r.status,
  bond: { amount: r.bond_amount ? String(r.bond_amount) : '', method: r.bond_method || 'cash', status: r.bond_status || 'held' },
  shopifyRef: r.shopify_ref, contractRef: r.contract_ref, notes: r.notes,
});

const rentalToDb = (r) => ({
  customer_id: r.customerId || null, vehicle_id: r.vehicleId || null,
  start_date: r.startDate || null, end_date: r.endDate || null,
  status: r.status || 'active',
  bond_amount: r.bond?.amount ? Number(r.bond.amount) : null,
  bond_method: r.bond?.method || 'cash', bond_status: r.bond?.status || 'held',
  shopify_ref: r.shopifyRef || null, contract_ref: r.contractRef || null, notes: r.notes || null,
});

const maintenanceFromDb = (m) => ({
  id: m.id, vehicleId: m.vehicle_id, type: m.type, description: m.description,
  date: m.date, nextServiceDate: m.next_service_date,
  cost: m.cost ? String(m.cost) : '',
});

const maintenanceToDb = (m) => ({
  vehicle_id: m.vehicleId || null, type: m.type || 'service',
  description: m.description || null, date: m.date || null,
  next_service_date: m.nextServiceDate || null,
  cost: m.cost ? Number(m.cost) : null,
});

const settingsFromDb = (s) => ({
  ownerCompany: s.owner_company, ownerABN: s.owner_abn,
  ownerResponsible: s.owner_responsible, defaultBond: s.default_bond,
});

const settingsToDb = (s) => ({
  owner_company: s.ownerCompany, owner_abn: s.ownerABN,
  owner_responsible: s.ownerResponsible, default_bond: s.defaultBond,
});

// ── Provider ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  ownerCompany: 'Easy Aussie AU Pty Ltd', ownerABN: '20 680 626 251',
  ownerResponsible: 'Jonathan Alexander Gonzalez Botero', defaultBond: '300',
};

export function StoreProvider({ children }) {
  const [data, setData] = useState({ vehicles: [], customers: [], rentals: [], maintenance: [], settings: DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [vehicles, customers, rentals, maintenance, settings] = await Promise.all([
      supabase.from('vehicles').select('*').order('created_at'),
      supabase.from('customers').select('*').order('created_at'),
      supabase.from('rentals').select('*').order('created_at'),
      supabase.from('maintenance').select('*').order('created_at'),
      supabase.from('settings').select('*').eq('id', 1).single(),
    ]);
    setData({
      vehicles:    (vehicles.data    || []).map(vehicleFromDb),
      customers:   (customers.data   || []).map(customerFromDb),
      rentals:     (rentals.data     || []).map(rentalFromDb),
      maintenance: (maintenance.data || []).map(maintenanceFromDb),
      settings:    settings.data ? settingsFromDb(settings.data) : DEFAULT_SETTINGS,
    });
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const add = async (type, item) => {
    const toDb = { vehicles: vehicleToDb, customers: customerToDb, rentals: rentalToDb, maintenance: maintenanceToDb }[type];
    const { data: row, error } = await supabase.from(type).insert(toDb(item)).select().single();
    if (error) throw error;
    const fromDb = { vehicles: vehicleFromDb, customers: customerFromDb, rentals: rentalFromDb, maintenance: maintenanceFromDb }[type];
    const newItem = fromDb(row);
    setData(d => ({ ...d, [type]: [...d[type], newItem] }));
    return newItem;
  };

  const update = async (type, id, updates) => {
    const current = data[type].find(i => i.id === id);
    const merged = { ...current, ...updates };
    const toDb = { vehicles: vehicleToDb, customers: customerToDb, rentals: rentalToDb, maintenance: maintenanceToDb }[type];
    const { error } = await supabase.from(type).update(toDb(merged)).eq('id', id);
    if (error) throw error;
    setData(d => ({ ...d, [type]: d[type].map(i => i.id === id ? merged : i) }));
  };

  const remove = async (type, id) => {
    const { error } = await supabase.from(type).delete().eq('id', id);
    if (error) throw error;
    setData(d => ({ ...d, [type]: d[type].filter(i => i.id !== id) }));
  };

  const updateSettings = async (updates) => {
    const merged = { ...data.settings, ...updates };
    const { error } = await supabase.from('settings').update(settingsToDb(merged)).eq('id', 1);
    if (error) throw error;
    setData(d => ({ ...d, settings: merged }));
  };

  return (
    <StoreContext.Provider value={{ data, loading, add, update, remove, updateSettings, refresh }}>
      {children}
    </StoreContext.Provider>
  );
}

export const useStore = () => useContext(StoreContext);
