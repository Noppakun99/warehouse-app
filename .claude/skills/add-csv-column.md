Add a new column mapping from a CSV file to the warehouse-app state (without adding a DB column).

## Steps

1. **Ask the user** for:
   - Which CSV file: `drug_details` (CSV รับยา) | `inventory` (CSV Log คลัง)
   - CSV column header (Thai) e.g. `รูปแบบ`, `บริษัท`
   - State field name (English) e.g. `drugType`, `company`
   - Data type: `text` | `date` | `numericText`
   - Where to display it (optional): which component/card/table

2. **Update `src/App.jsx`** — in the correct upload handler:

   For **drug_details CSV** (`handleDrugFileUpload`):
   - Add index detection after existing `findIndex` lines:
     ```js
     const {field}Idx = headers.findIndex(h => h.includes('{thai_header}'));
     ```
   - Extract value inside the row loop and add to `details` object:
     ```js
     _{field}: {field}Idx !== -1 && row[{field}Idx]?.trim() ? row[{field}Idx].trim() : '-',
     ```

   For **inventory CSV** (`handleLogFileUpload`):
   - Add index detection after existing `findIndex` lines
   - Add field to the pushed inventory item object

3. **Apply correct normalizer**:
   - text → `.trim()`
   - date → `normalizeDateStr(val)`
   - numericText → `normalizeNumericText(val)`

4. **Confirm** the change before editing.

## Notes
- Column detection uses `h.includes('{keyword}')` — choose a unique keyword from the header name
- For strict match use `h.trim() === '{exact_header}'`
- Changes affect new uploads only — re-upload CSV to see updated data
