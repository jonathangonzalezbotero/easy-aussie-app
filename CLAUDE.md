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
| `/finance`  | Protected | Finance module (`?tab=overview|transactions|reconcile|payees|vehicles|forecast|fy|settings`) |
| `/settings` | Protected | Business settings                       |
| `/contract` | Protected | Full-screen contract view + PDF download |

`/contract` is rendered outside `Layout` (no sidebar). It receives the rental ID via React Router `location.state.rentalId`.

### State: `StoreContext`

`useStore()` returns `{ data, loading, add, update, remove, updateSettings, refresh }`. All mutations are async (hit Supabase, then update local state). The `data` shape mirrors the original app: `{ vehicles, customers, rentals, maintenance, settings }` — all in camelCase.

Supabase uses snake_case columns. Conversion happens in `src/context/StoreContext.jsx` via per-entity `fromDb` / `toDb` normalizers. The `bond` object in rentals (`{ amount, method, status }`) is stored as flat columns in Supabase (`bond_amount`, `bond_method`, `bond_status`) and reconstructed on read.

### Finance module

`src/finance/` holds the data layer, `src/pages/finance/` the tabs. `FinanceProvider` (mounted in `App.jsx` next to `StoreProvider`) loads every `finance_*` table once; `useFinance()` returns the rows plus mutators. If the tables are missing it sets `error` and the page shows a "run the migration" notice instead of crashing.

- **Categories** are a code constant in `src/finance/categories.js` (`CATEGORIES`, each with a type: income, operating, capital, bond, transfer). Only income and operating lines are P&L. Bonds are liabilities, transfers are neither. Two nets: operating net (income − operating) and cash net (also minus capital).
- **Transactions** are signed amounts (in positive, out negative) on an account. `source` is `bank_csv`, `stripe`, `spreadsheet` or `manual`. Imported lines keep date, amount and description locked; only manual lines are fully editable. Splits live in `finance_splits`; a split transaction stores `category = 'split'` and `effectiveLines()` expands it.
- **Match status**: `unreviewed` → `suggested` → `confirmed`, or `ignored`. Suggestions are computed live by `src/finance/matching.js` (`useSuggestions`): contract reference in the description, customer name → bond deposit/refund, Stripe payout, reimbursement pairing, rules, plate.
- **Confirming** goes through the Postgres function `finance_confirm` (transaction + splits + rental bond patch in one call, with a `previous_state` snapshot) and `finance_undo` restores it. `src/finance/confirm.js` builds the payload and the "what will change" text for both the drawer and the reconcile queue.
- **Bond statuses** on rentals: `awaiting`, `held`, `refunded`, `partially_refunded`, `retained` (helpers in `src/utils/bond.js`). Ending a rental records the planned refund; a bank-transfer refund stays `held` until the bank line is confirmed in Reconcile.
- **Imports**: NAB CSV wizard (`ImportCsvModal`, header-driven column mapping saved per account in localStorage, duplicate check on account+date+amount+description+balance, cut-over date blocks older lines) and spreadsheet history (`SpreadsheetImportModal`, xlsx/csv, category guessed from text and sign since cell colours cannot be read).
- **Payees** (`finance_payees`, `src/finance/payees.js`, Payees tab): who was paid, independent of category, so one contractor can have both labour and parts lines. `payee_id` sits on transactions, splits and rules; attribution comes from a rule with a payee, or from the payee's `match_text` (falls back to its name). Separate from customers on purpose.
- **Per-vehicle earnings** (`src/finance/vehicles.js`, Vehicles tab in Finance, `VehicleFinanceCard` in the vehicle drawer): a line counts for a vehicle when the split or transaction names it, or through its linked rental. Fleet-wide costs are not spread.
- **Forecast** (`src/finance/forecast.js`) is generated live: income from active rentals (weekly price pro-rated) and from the fleet target; expenses from recurring items, vehicle rego expiry + last `rego_renewals` cost, 3-month averages, Stripe fee estimate. Overrides are stored in `finance_forecast_overrides`.
- **Edge functions**: `stripe-sync` (charges, fees, refunds, subscriptions; secret `STRIPE_SECRET_KEY`), `stripe-webhook` (failed/recovered payments; deploy with `--no-verify-jwt`, secret `STRIPE_WEBHOOK_SECRET`), `send-csv-reminder` (Sunday email via Resend). Schedules in `supabase/finance-cron.sql`.

Setup: run `supabase/migration_finance.sql` then `supabase/migration_finance_payees.sql` in the SQL Editor (the first also migrates bond statuses), then deploy the three functions and run the cron file.

### Shared components

`src/components/shared/` — `Modal`, `Drawer`, `Badge`, `EmptyState`, `Tabs`, `SectionLabel`, `SearchSelect` (searchable single-select with optional create row). Import individually (no barrel file).

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

1. Push the `easy-aussie-app` folder to a GitHub repo
2. Import in Vercel, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
3. `vercel.json` rewrites all routes to `/index.html` for client-side routing

## Data model

- **Vehicles**: `{ id, plate, name, make, model, year, colour, status, regoExpiry, nextServiceDate, engineCapacity, type, fleetGroup, purchaseDate, conditionNotes, notes }`
- **Customers**: `{ id, name, dateOfBirth, phone, email, address, occupation, emergencyContact, emergencyPhone, hotelAddress, licenseRef, licencePhoto, notes }`
- **Rentals**: `{ id, customerId, vehicleId, startDate, endDate, status, bond: { amount, method, status, refundedAmount, retainedAmount, retainReason, refundMethod, refundDate }, rentPaidBy, stripeSubscriptionId, price, billingPeriod ("weekly" = price is per week | "fixed" = price is a single amount for the whole rental period, default weekly), shopifyRef, contractRef, notes }`
- **Settings**: `{ ownerCompany, ownerABN, ownerResponsible, defaultBond }` — single row (id=1)
- **Finance** (`useFinance()`): `accounts`, `transactions` (with `splits`), `rules`, `recurring`, `overrides`, `imports`, `subscriptions`, `regoRenewals`, `settings` `{ cutoverDate, directorLoanOpening, directorLoanOpeningDate, targetOccupancy, scooterWeeklyRate, ebikeWeeklyRate, reminderEnabled, reminderEmail, stripeLastSync, stripeSyncFrom }`

Dates are always `YYYY-MM-DD` strings. `formatDate` in `src/utils/dates.js` renders in Australian locale (en-AU).
