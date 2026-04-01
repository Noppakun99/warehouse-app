Add a new explicit column to the warehouse-app database and wire it end-to-end.

## Steps

1. **Ask the user** for:
   - Column name (English, snake_case) e.g. `company`
   - Thai label e.g. `บริษัท`
   - Data type: `text` | `integer` | `numeric` | `boolean`
   - Which table: `drug_details` | `inventory`
   - Which CSV column header it maps from (Thai or English)
   - Whether to combine multiple CSV columns (Option B) or use one column directly

2. **Generate SQL** for Supabase SQL Editor:
```sql
ALTER TABLE {table}
  ADD COLUMN IF NOT EXISTS {column_name} {type};
```

3. **Update `src/lib/db.js`**:
   - In `save{Table}` function: add `_{column_name}` to destructure from value
   - Add `{column_name}: _{column_name} || null` to the return row object

4. **Update `src/App.jsx`** in `handleDrugFileUpload` (or `handleLogFileUpload`):
   - Detect CSV header index: `const {column_name}Idx = headers.findIndex(h => h.includes('{thai_label}'));`
   - Extract value from row and store as `_{column_name}` in the details object
   - If combining multiple columns: join with ` | ` separator, skip empty values

5. **Confirm** by showing all 3 code changes together before editing any file.

## Notes
- Always use `normalizeCode` for code/id columns
- Always use `normalizeNumericText` for lot, invoice, bill number columns
- Always use `normalizeDateStr` for date columns
- Store combined text columns as plain string
- Prefix internal detail keys with `_` (e.g. `_company`) to distinguish from JSONB `data` keys
