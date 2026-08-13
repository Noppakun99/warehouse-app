/**
 * seed-drug-loan.mjs — นำเข้า csvfile/ยืมยา_คืนยา.csv → ตาราง drug_loan (ครั้งเดียว)
 *
 * รัน: node scripts/seed-drug-loan.mjs [--dry]
 *   --dry = แสดงผลที่จะ insert โดยไม่เขียน DB
 *
 * กันรันซ้ำด้วย unique index drug_loan_dedupe_key (upsert ignore-duplicates)
 * ไม่ผูกกับ build — เป็น one-off migration tool
 *
 * ทิศทาง: รพ.ประชาธิปัตย์ = โรงพยาบาลเรา
 *   "รพ.ที่ขอยืม" = เรา  → borrow (เรายืมเขา ต้องคืน)
 *   "รพ.ที่ให้ยืม" = เรา  → lend   (เราให้เขายืม รอรับคืน)
 */
import fs from 'node:fs';
import path from 'node:path';

const OUR_HOSPITAL = 'ประชาธิปัตย์';
const CSV = path.join(process.cwd(), 'csvfile', 'ยืมยา_คืนยา.csv');
const DRY = process.argv.includes('--dry');

// --- RFC-4180 parser (รองรับ quoted field ที่มี comma/newline) ---
function parseCSV(text) {
  const rows = []; let field = '', row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const clean = (s) => {
  const t = String(s ?? '').trim();
  return (t === '' || t === '-') ? null : t;
};
// CSV เก็บ D/M/YYYY (ค.ศ.) → ISO. คืน null ถ้าว่าง/'-' (= ยังไม่คืน)
const toIso = (s) => {
  const t = clean(s); if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};
const toNum = (s) => {
  const t = clean(s); if (!t) return null;
  const n = Number(t.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const raw = fs.readFileSync(CSV, 'utf8').replace(/^﻿/, '');
const rows = parseCSV(raw);
const header = rows[0].map(h => h.trim());
const col = (name) => header.findIndex(h => h === name);
const I = {
  borrower: col('รพ.ที่ขอยืม'), lender: col('รพ.ที่ให้ยืม'),
  loanDoc: col('เลขที่ใบยืม'), code: col('รหัสยา'), form: col('รูปแบบ'),
  name: col('ชื่อยา'), lot: col('Lot'), exp: col('Exp'), qty: col('จำนวน'),
  unit: col('หน่วยนับ'), price: col('ราคาต่อหน่วย'), total: col('ราคารวมภาษี'),
  loanDate: col('วันที่ให้ยืม'), loanCo: col('บริษัทที่ให้ยืม'),
  retDate: col('วันที่รับคืนยา'), retDoc: col('เลขที่ใบคืน'), retCo: col('บริษัทที่รับคืน'),
};

const records = [];
for (const r of rows.slice(1)) {
  if (!r.some(c => c && c.trim())) continue;           // บรรทัดว่างท้ายไฟล์
  const borrower = clean(r[I.borrower]) || '';
  const lender = clean(r[I.lender]) || '';
  if (!clean(r[I.name])) continue;                      // ไม่มีชื่อยา = แถวเสีย

  const weBorrow = borrower.includes(OUR_HOSPITAL);
  const direction = weBorrow ? 'borrow' : 'lend';
  const counterparty = weBorrow ? lender : borrower;

  records.push({
    direction, counterparty,
    drug_code: clean(r[I.code]), drug_name: clean(r[I.name]),
    dosage_form: clean(r[I.form]), lot: clean(r[I.lot]) || '-', exp: clean(r[I.exp]),
    qty: toNum(r[I.qty]), unit: clean(r[I.unit]),
    price_per_unit: toNum(r[I.price]), total_price: toNum(r[I.total]),
    loan_date: toIso(r[I.loanDate]), loan_doc: clean(r[I.loanDoc]), loan_company: clean(r[I.loanCo]),
    return_date: toIso(r[I.retDate]), return_doc: clean(r[I.retDoc]), return_company: clean(r[I.retCo]),
    created_by: 'seed-csv', updated_by: 'seed-csv',
  });
}

const outstanding = records.filter(x => !x.return_date);
console.log(`อ่านได้ ${records.length} แถว`);
console.log(`  borrow (เรายืมเขา) : ${records.filter(x => x.direction === 'borrow').length}`);
console.log(`  lend   (เราให้ยืม) : ${records.filter(x => x.direction === 'lend').length}`);
console.log(`  ค้างคืน            : ${outstanding.length}`);
outstanding.forEach(x => console.log(`    - ${x.drug_name} lot ${x.lot} | ยืม ${x.loan_date} | ${x.counterparty}`));

if (DRY) { console.log('\n--dry: ไม่เขียน DB'); process.exit(0); }

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim();

// insert ทีละแถว — batch เดียวถ้าชนซ้ำแถวเดียวจะ rollback ทั้งก้อน
// (ignore-duplicates ครอบไม่ถึงแถวที่ loan_date NULL เพราะ NULL ไม่ match unique index)
let inserted = 0, skipped = 0;
for (const rec of records) {
  const res = await fetch(`${url}/rest/v1/drug_loan`, {
    method: 'POST',
    headers: {
      apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(rec),
  });
  if (res.ok) { inserted += (JSON.parse(await res.text()).length ? 1 : 0); continue; }
  const body = await res.text();
  if (body.includes('23505')) { skipped++; continue; }   // ซ้ำ = ข้าม ไม่ใช่ error
  console.error('insert ล้มเหลว:', rec.drug_name, body.slice(0, 200));
  process.exit(1);
}
console.log(`\ninserted: ${inserted} แถว · ข้ามเพราะมีอยู่แล้ว: ${skipped} แถว`);
