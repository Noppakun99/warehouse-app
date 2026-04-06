# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server
npm run build    # Production build
npm run lint     # Run ESLint
npm run preview  # Preview production build
```

There is no test runner configured — `unitParser.test.js` is a standalone script with manual assertions, not a test framework. Run it directly with `node src/unitParser.test.js` if needed.

## Architecture

This is a single-page React app (no React Router) for hospital pharmacy warehouse management. Routing is done via a `page` state string in `AppRoot.jsx`.

**App flow:**
1. `AppRoot.jsx` handles login and renders one of four sub-apps based on `page` state
2. No authentication backend — login is name + department only, role stored in component state
3. Two roles: `requester` (ward staff) and `staff` (pharmacy staff with full access)

**Sub-apps (each is a self-contained component):**
- `App.jsx` — Inventory map, CSV upload, drug location grid
- `RequisitionApp.jsx` — Drug requisition (submit + staff approval workflow)
- `DispenseLogApp.jsx` — Dispense history and analysis
- `ReceiveLogApp.jsx` — Receive history (stock intake)

**Data layer:**
- All Supabase queries go through `src/lib/db.js` — components never call `supabase` directly
- `src/lib/supabase.js` initializes the client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- If `.env` is missing, `supabase` is `null` and the app falls back to in-memory state

**Database schema** is in `supabase_schema.sql` (inventory, drug_details, upload_meta) and `requisition_schema.sql` (requisitions, dispense_logs, receive_logs). RLS is enabled with public read/write policies (internal app).

**Reusable components:**
- `DrugSearchBar.jsx` — drug search with dropdown, used across multiple sub-apps
- `SearchableSelect.jsx` — searchable dropdown (used for department selection)

## Key Conventions

- All Supabase queries in `src/lib/db.js` only — never inline in components
- UI text is Thai throughout
- Use Tailwind utility classes only — no separate CSS files
- Print functions use `window.open()` popup with inline HTML/CSS (Sarabun font, Thai formatting)
- CSV parsing for inventory/drug details is handled inside `App.jsx` (`handleDrugFileUpload`)
- Internal drug detail keys are prefixed with `_` (e.g. `_company`) to distinguish from Supabase JSONB `data` keys
- Helper functions `normalizeCode`, `normalizeNumericText`, `normalizeDateStr` are used when parsing CSV columns
- API keys must come from `.env` only — never hard-coded (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

## Custom Skills

Use these skills for common tasks:

- `/add-db-column` — Add a column to Supabase + wire it through `db.js` and CSV parsing
- `/add-csv-column` — Add a new CSV column mapping without a DB column change
- `/new-print` — Create a `window.open()` print view for any sub-app
