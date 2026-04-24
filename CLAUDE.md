# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## How to run

```bash
npm run dev      # start dev server at localhost:5173
npm run build    # production build
npm run preview  # preview production build locally
```

Copy `.env.example` to `.env` and fill in your Supabase credentials before running.

## Architecture

Vite + React 19 SPA. React Router v6 for client-side routing. Supabase for auth and database.

### Routing

| Path         | Auth     | Description                              |
|-------------|----------|------------------------------------------|
| `/login`    | Public   | Email/password login via Supabase Auth   |
| `/intake`   | Public   | Customer self-service intake form        |
| `/`         | Protected | Dashboard                               |
| `/vehicles` | Protected | Fleet management                        |
| `/customers`| Protected | Customer records                        |
| `/rentals`  | Protected | Rental lifecycle                        |
| `/maintenance` | Protected | Service log                          |
| `/bonds`    | Protected | Bond/deposit tracking                   |
| `/settings` | Protected | Business settings                       |
| `/contract` | Protected | Full-screen contract view + PDF download |

`/contract` is rendered outside `Layout` (no sidebar). It receives the rental ID via React Router `location.state.rentalId`.

### State: `StoreContext`

`useStore()` returns `{ data, loading, add, update, remove, updateSettings, refresh }`. All mutations are async (hit Supabase, then update local state). The `data` shape mirrors the original app: `{ vehicles, customers, rentals, maintenance, settings }` — all in camelCase.

Supabase uses snake_case columns. Conversion happens in `src/context/StoreContext.jsx` via per-entity `fromDb` / `toDb` normalizers. The `bond` object in rentals (`{ amount, method, status }`) is stored as flat columns in Supabase (`bond_amount`, `bond_method`, `bond_status`) and reconstructed on read.

### Shared components

`src/components/shared/` — `Modal`, `Drawer`, `Badge`, `EmptyState`, `Tabs`, `SectionLabel`. Import individually (no barrel file).

### PDF generation

`ContractPage.jsx` uses `html2pdf.js` (dynamically imported on click) to capture the contract `<div ref={contractRef}>` and download it as a PDF. No server involvement.

### Public intake form

`CustomerIntake.jsx` uses the Supabase anon key to INSERT directly into the `customers` table. RLS policy `"Public intake form insert"` allows this. Authenticated RLS policies block anon reads, so intake submissions are only visible to you after login.

## Supabase setup

1. Create a new Supabase project
2. Run `supabase/schema.sql` in the SQL Editor
3. Go to Authentication → Users → Add user to create your login
4. Copy the project URL and anon key into `.env`

## Deployment to Vercel

1. Push the `fleet-manager` folder to a GitHub repo
2. Import in Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
3. `vercel.json` rewrites all routes to `/index.html` for client-side routing

## Data model

- **Vehicles**: `{ id, plate, name, make, model, year, colour, status, regoExpiry, nextServiceDate, engineCapacity, type, fleetGroup, purchaseDate, conditionNotes, notes }`
- **Customers**: `{ id, name, dateOfBirth, phone, email, address, occupation, emergencyContact, emergencyPhone, hotelAddress, licenseRef, licencePhoto, notes }`
- **Rentals**: `{ id, customerId, vehicleId, startDate, endDate, status, bond: { amount, method, status }, shopifyRef, contractRef, notes }`
- **Settings**: `{ ownerCompany, ownerABN, ownerResponsible, defaultBond }` — single row (id=1)

Dates are always `YYYY-MM-DD` strings. `formatDate` in `src/utils/dates.js` renders in Australian locale (en-AU).
