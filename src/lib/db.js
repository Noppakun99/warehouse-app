import { supabase } from './supabase'

const CHUNK_SIZE = 500

// --- Inventory ---

// ดึงทุก row ของ inventory ข้าม Supabase 1000-row limit (paginate) — ทุก query ที่ aggregate
// คลังต้องใช้ตัวนี้ ไม่งั้น row ที่เรียงท้าย (เช่น คลังชื่อไทย "คลังน้ำเกลือ") ถูกตัดทิ้งเงียบๆ
// → หายจากแผนผัง/รายการคงเหลือ/dashboard alert + ReorderApp คำนวณคงเหลือเป็น 0 (Critical Rule #2)
export async function fetchAllInventoryRows(selectCols = '*', { orderBy = 'location' } = {}) {
  if (!supabase) return []
  const rows = []
  const PAGE = 1000
  let from = 0
  while (true) {
    let q = supabase.from('inventory').select(selectCols).range(from, from + PAGE - 1)
    if (orderBy) q = q.order(orderBy)
    const { data: page, error } = await q
    if (error) throw error
    if (!page || page.length === 0) break
    rows.push(...page)
    if (page.length < PAGE) break
    from += PAGE
  }
  return rows
}

export async function fetchInventory() {
  if (!supabase) return null

  const data = await fetchAllInventoryRows('*')
  if (data.length === 0) return null

  // แปลง flat rows → object grouped by location
  const result = {}
  data.forEach(row => {
    if (!result[row.location]) result[row.location] = []
    result[row.location].push({
      code: row.code,
      name: row.name,
      type: row.type,
      unit: row.unit,
      lot: row.lot,
      exp: row.exp,
      qty: row.qty,
      invoice: row.invoice,
      mainLog: row.main_log || null,
      itemType: row.item_type || null,
      receiveStatus: row.receive_status,
      safetyStock: row.safety_stock != null ? parseFloat(row.safety_stock) : null,
    })
  })
  return result
}

export async function saveInventory(inventoryObj) {
  if (!supabase) throw new Error('Supabase not configured')

  // แปลง object → flat rows
  const rows = []
  Object.entries(inventoryObj).forEach(([location, items]) => {
    items.forEach(item => {
      rows.push({
        location,
        code: item.code || '-',
        name: item.name,
        type: item.type || '-',
        unit: item.unit || '-',
        lot: item.lot || '-',
        exp: item.exp || '-',
        qty: item.qty || '0',
        invoice: item.invoice || '-',
        main_log:      item.mainLog || null,
        item_type:     item.itemType || null,
        receive_status: item.receiveStatus || 'ไม่มีการดำเนินการ',
        safety_stock: item.safetyStock != null ? item.safetyStock : null,
        updated_at: new Date().toISOString(),
      })
    })
  })

  // ลบข้อมูลเก่าทั้งหมด แล้ว insert ใหม่
  const { error: delError } = await supabase
    .from('inventory')
    .delete()
    .gte('id', 0)
  if (delError) throw delError

  // Insert เป็น batch
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await supabase
      .from('inventory')
      .insert(rows.slice(i, i + CHUNK_SIZE))
    if (error) throw error
  }
}

// --- Drug Details (ดึงจาก receive_logs แทน drug_details) ---

export async function fetchDrugDetails() {
  if (!supabase) return null

  const BATCH = 1000
  const result = {}
  let offset = 0

  while (true) {
    const { data, error } = await supabase
      .from('receive_logs')
      .select('drug_code, drug_name, lot, bill_number, exp, supplier_current, supplier_prev, supplier_changed, drug_swap_policy, drug_type, safety_stock, leadtime, sum_of_lead_time, price_per_unit, receive_date, inspect_date, qty_received, receive_status, purchase_type')
      .range(offset, offset + BATCH - 1)

    if (error) throw error
    if (!data || data.length === 0) break

    data.forEach(row => {
      const key = `${(row.drug_code || '-').trim().toLowerCase()}|${(row.lot || '-').trim().toLowerCase()}|${(row.bill_number || '-').trim().toLowerCase()}`
      if (!result[key]) {
        result[key] = {
          _code: row.drug_code,
          _name: row.drug_name,
          _lot: row.lot,
          _invoice: row.bill_number,
          _exp: row.exp,
          _company: row.supplier_current,
          _drug_swap_policy: row.drug_swap_policy,
          _drug_type: row.drug_type,
          safety_stock: row.safety_stock,
          leadtime: row.leadtime,
          sum_of_lead_time: row.sum_of_lead_time,
          price_per_unit: row.price_per_unit,
          supplier_current: row.supplier_current,
          supplier_prev: row.supplier_prev,
          supplier_changed: row.supplier_changed,
          receive_date: row.receive_date,
          inspect_date: row.inspect_date,
          qty_received: row.qty_received,
          receive_status: row.receive_status,
          purchase_type: row.purchase_type,
        }
      }
    })

    if (data.length < BATCH) break
    offset += BATCH
  }

  return Object.keys(result).length > 0 ? result : null
}

// --- Import Receive Logs from CSV text ---

export const RECEIVE_COL_MAP = {
  order_date:          ['วันที่แจ้งสั่ง','order date','order_date','วันสั่ง','วันที่สั่ง'],
  receive_date:        ['วันที่รับ','receive date','receive_date','วันที่รับของ','วันรับ','วันที่'],
  inspect_date:        ['วันที่ตรวจรับ','inspect date','inspect_date','วันตรวจรับ'],
  leadtime:            ['leadtime','lead time','ระยะเวลา'],
  inspect_lag:         ['วันที่ตรวจรับ-วันที่รับของ','inspect lag','lag','ระยะตรวจรับ'],
  bill_number:         ['เลขที่บิลซื้อ','เลขบิล','bill','bill_number','เลขที่บิล','invoice'],
  po_number:           ['เลขที่po','po number','po_number','po','เลข po'],
  purchase_type:       ['สถานะ','สถานะการซื้อ','สถานะการสั่ง','purchase type','purchase_type','ประเภทการซื้อ'],
  receive_status:      ['ผลการพิจารณา','สถานะตรวจรับ','สถานะการตรวจรับ','สถานะตรวจ','receive status','receive_status','สถานะรับ'],
  main_log:            ['mainlog','main_log','main log','log หลัก'],
  detail_log:          ['detailedlog','detail_log','detailed log','detaillog','log ย่อย'],
  drug_code:           ['รหัส','รหัสยา','รหัสhosxp','รหัส hosxp','code','drug_code'],
  drug_name:           ['รายการยา','ชื่อยา','drug_name','name','item'],
  drug_type:           ['รูปแบบ','ชนิด','type','drug_type','form'],
  item_type:           ['ชนิดรายการ','item_type','item type'],
  drug_unit:           ['หน่วย','หน่วยยา','drug_unit','unit_label'],
  supplier_current:    ['บริษัทปัจจุบัน','บริษัทยา','บริษัท','supplier','supplier_current','vendor'],
  supplier_prev:       ['บริษัทก่อนหน้า','บริษัทก่อนนาน','supplier_prev','previous supplier','บริษัทเก่า'],
  supplier_changed:    ['เปลี่ยนบริษัท','supplier_changed','change','เปลี่ยน'],
  lot:                 ['lot','lot.','lot number','lot no','เลขที่ lot'],
  exp:                 ['exp','exp.','exp date','วันหมดอายุ'],
  note:                ['หมายเหตุ','note','notes','remark','หมายเหตุรับ'],
  exp_note:            ['หมายเหตุหมดอายุ','exp_note','exp note','expiry note'],
  qty_received:        ['จำนวนที่รับ','qty_received','quantity','จำนวนรับ','จำนวน'],
  unit_per_bill:       ['หน่วย/บิล','unit_per_bill','unit per bill','หน่วยบิล'],
  price_per_unit:      ['ราคาต่อหน่วย(บาท)','ราคาต่อหน่วย','ราคา/หน่วย','price_per_unit','price','unit price'],
  total_price_vat:     ['ราคารวมภาษี (บาท)','ราคารวมภาษี','มูลค่ารวมภาษี','total_price_vat','total price vat','total vat','ราคารวม'],
  total_price_formula: ['ราคารวมภาษี (บาท)/สูตร','ราคารวมภาษี/สูตร','มูลค่า/สูตร','total_price_formula','formula price'],
  safety_stock:        ['safety stock','safety_stock','สต็อกขั้นต่ำ','ปริมาณขั้นต่ำ'],
  sum_of_lead_time:    ['sum of lead time (in days)','sum of lead time','sum_of_lead_time','lead time (in days)'],
  swap_condition:      ['เงื่อนไขการแลกเปลี่ยนยาของบริษัท','swap_condition','swap condition','เงื่อนไขการแลกเปลี่ยน','เงื่อนไขแลกเปลี่ยน'],
  swap_items:          ['ระบุรายการยาและเงื่อนไขยาแต่ละตัว','swap_items','swap items','ระบุเงื่อนไขการแลกเปลี่ยนยา','รายการยาแลกเปลี่ยน','ระบุรายการยาแลกเปลี่ยน'],
}

function _parseCSVRow(str) {
  const arr = []; let quote = false; let col = '';
  for (let i = 0; i < str.length; i++) {
    const cc = str[i], nc = str[i+1];
    if (cc==='"' && quote && nc==='"') { col+='"'; i++; continue; }
    if (cc==='"') { quote=!quote; continue; }
    if (cc===',' && !quote) { arr.push(col.trim()); col=''; continue; }
    col+=cc;
  }
  arr.push(col.trim().replace(/^"|"$/g,''));
  return arr;
}

function _matchHeader(header) {
  const h = header.toLowerCase().trim().replace(/\s+/g,' ');
  for (const [field,aliases] of Object.entries(RECEIVE_COL_MAP)) {
    if (aliases.some(a => h===a.toLowerCase().trim())) return field;
  }
  for (const [field,aliases] of Object.entries(RECEIVE_COL_MAP)) {
    if (aliases.some(a => a.trim().length>=7 && h.includes(a.toLowerCase().trim()))) return field;
  }
  return null;
}

function _parseExcelSerial(s) {
  if (!/^\d{5}$/.test(s)) return null;
  const d = new Date(Date.UTC(1899, 11, 30) + parseInt(s) * 86400000);
  return isNaN(d) ? null : d;
}

function _parseReceiveDate(raw) {
  if (!raw||raw==='-'||raw==='0'||String(raw).trim()==='') return null;
  const s = String(raw).trim().split(/[\sT]/)[0];
  const serial = _parseExcelSerial(s);
  if (serial) return `${serial.getUTCFullYear()}-${String(serial.getUTCMonth()+1).padStart(2,'0')}-${String(serial.getUTCDate()).padStart(2,'0')}`;
  const sep = s.includes('/')?'/':s.includes('-')?'-':null;
  if (sep) {
    const p = s.split(sep).map(x=>x.trim());
    if (p.length===3) {
      let [a,b,c] = p.map(Number);
      if ([a,b,c].some(isNaN)) return null;
      let d,m,y;
      if (p[0].length===4) { [y,m,d]=[a,b,c]; } else { [d,m,y]=[a,b,c]; }
      if (y>2500) y-=543;
      if (d<1||d>31||m<1||m>12||y<1900||y>2200) return null;
      const dt = new Date(y,m-1,d);
      if (!isNaN(dt)&&dt.getDate()===d) return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }
  }
  return null;
}

function _parseExpStr(raw) {
  if (!raw || raw === '-') return '-';
  const s = String(raw).trim();
  const serial = _parseExcelSerial(s);
  if (serial) return `${serial.getUTCDate()}/${serial.getUTCMonth()+1}/${serial.getUTCFullYear()}`;
  return s || '-';
}

// insertReceiveRows — shared by importReceiveLogs (App.jsx path) and ReceiveLogApp
// handles: drug_swap_policy backfill → DELETE all → INSERT chunks → audit log
export async function insertReceiveRows(rows, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')

  // Backfill drug_swap_policy จาก DB สำหรับ row ที่ CSV ไม่มีข้อมูล (ก่อน DELETE)
  const needLookup = [...new Set(rows.filter(r => !r.drug_swap_policy && r.drug_code && r.drug_code !== '-').map(r => r.drug_code))]
  if (needLookup.length > 0) {
    const { data: ddRows } = await supabase.from('receive_logs').select('drug_code, drug_swap_policy').in('drug_code', needLookup)
    if (ddRows) {
      const swapByCode = {}
      ddRows.forEach(d => { if (d.drug_code && d.drug_swap_policy && !swapByCode[d.drug_code]) swapByCode[d.drug_code] = d.drug_swap_policy })
      rows.forEach(r => { if (!r.drug_swap_policy && swapByCode[r.drug_code]) r.drug_swap_policy = swapByCode[r.drug_code] })
    }
  }

  const { error: delErr } = await supabase.from('receive_logs').delete().gte('id', 0)
  if (delErr) throw delErr

  const CHUNK = 300
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: e } = await supabase.from('receive_logs').insert(rows.slice(i, i + CHUNK))
    if (e) throw e
    if (i + CHUNK < rows.length) await new Promise(r => setTimeout(r, 500))
  }
  await insertAuditLog({
    action: 'import_receive', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth.department,
    record_count: rows.length,
  })
  return rows.length
}

export async function importReceiveLogs(csvText, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล')

  const headers = _parseCSVRow(lines[0])
  const mapping = {}
  headers.forEach((h, i) => { const f = _matchHeader(h); if (f) mapping[f] = i; })

  const getVal = (row, field) => {
    const idx = mapping[field];
    if (idx==null||idx==='') return null;
    const v = row[idx]?.trim()||null;
    if (!v) return null;
    const lower = v.toLowerCase();
    if (lower==='(blank)'||lower==='blank'||v==='-') return null;
    return v;
  }

  const rows = lines.slice(1).map(_parseCSVRow)
    .filter(row => row.some(c => c && c.trim() && c.trim() !== '-'))
    .map(row => {
      const swapFromCsv = [getVal(row,'swap_condition'),getVal(row,'swap_items')].filter(Boolean).join(' | ')||null;
      const drugCode = (() => { const v=getVal(row,'drug_code'); return v?String(v).trim()||'-':'-'; })();
      return {
        order_date:          _parseReceiveDate(getVal(row,'order_date')),
        receive_date:        _parseReceiveDate(getVal(row,'receive_date')),
        inspect_date:        _parseReceiveDate(getVal(row,'inspect_date')),
        leadtime:            getVal(row,'leadtime'),
        inspect_lag:         getVal(row,'inspect_lag'),
        bill_number:         getVal(row,'bill_number')||'-',
        po_number:           getVal(row,'po_number')||'-',
        purchase_type:       getVal(row,'purchase_type')||'-',
        receive_status:      getVal(row,'receive_status')||'-',
        main_log:            getVal(row,'main_log')||null,
        detail_log:          getVal(row,'detail_log')||null,
        drug_code:           drugCode,
        drug_name:           getVal(row,'drug_name')||'-',
        drug_type:           getVal(row,'drug_type')||'-',
        item_type:           getVal(row,'item_type')||null,
        drug_unit:           getVal(row,'drug_unit')||null,
        supplier_current:    getVal(row,'supplier_current')||'-',
        supplier_prev:       getVal(row,'supplier_prev')||'-',
        supplier_changed:    getVal(row,'supplier_changed')||'-',
        lot:                 getVal(row,'lot')||'-',
        exp:                 _parseExpStr(getVal(row,'exp')),
        note:                getVal(row,'note'),
        exp_note:            getVal(row,'exp_note'),
        qty_received:        parseFloat(String(getVal(row,'qty_received')||'0').replace(/,/g,''))||null,
        unit_per_bill:       getVal(row,'unit_per_bill')||'-',
        price_per_unit:      (()=>{ const p=parseFloat(String(getVal(row,'price_per_unit')||'').replace(/,/g,'')); return isNaN(p)?null:p; })(),
        total_price_vat:     parseFloat(String(getVal(row,'total_price_vat')||'0').replace(/,/g,''))||null,
        total_price_formula: getVal(row,'total_price_formula'),
        safety_stock:        parseFloat(String(getVal(row,'safety_stock')||'').replace(/,/g,''))||null,
        sum_of_lead_time:    getVal(row,'sum_of_lead_time')||null,
        drug_swap_policy:    swapFromCsv,
      }
    })

  return insertReceiveRows(rows, auth)
}

// --- Dashboard Alerts ---

function _parseExpDate(raw) {
  if (!raw || raw === '-' || String(raw).trim() === '') return null
  const s = String(raw).trim()
  // DD/MM/YYYY หรือ D/M/YYYY
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m1) {
    let [, d, mo, y] = m1.map(Number)
    if (y < 100) y += 2000
    if (y > 2500) y -= 543
    const dt = new Date(y, mo - 1, d)
    return isNaN(dt) ? null : dt
  }
  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m2) {
    let [, y, mo, d] = m2.map(Number)
    if (y > 2500) y -= 543
    const dt = new Date(y, mo - 1, d)
    return isNaN(dt) ? null : dt
  }
  // MM/YYYY หรือ MM-YYYY (ไม่มีวัน → ใช้วันสุดท้ายของเดือน)
  const m3 = s.match(/^(\d{1,2})[/-](\d{4})$/)
  if (m3) {
    let [, mo, y] = m3.map(Number)
    if (y > 2500) y -= 543
    const dt = new Date(y, mo, 0)
    return isNaN(dt) ? null : dt
  }
  return null
}

export async function fetchDashboardAlerts() {
  if (!supabase) return { expiring: [], lowStock: [] }

  // paginate ครบทุก row — ไม่งั้นยาที่เรียงท้าย (เช่นน้ำเกลือ) หายจาก alert (Critical Rule #2)
  let data
  try {
    data = await fetchAllInventoryRows('name, code, exp, qty, lot, location, safety_stock, type, unit, receive_status, invoice')
  } catch {
    return { expiring: [], lowStock: [], pendingReceive: [] }
  }
  if (!data) return { expiring: [], lowStock: [], pendingReceive: [] }

  // ดึง receive_date จาก receive_logs เพื่อคำนวณ waitDays (รอตรวจรับมา X วัน) — ใช้ logic เดียวกับระบบแผนผัง
  // ข้าม 1000-row limit ของ Supabase ด้วย pagination
  const receiveDateMap = new Map() // key: `${code}|${lot}` → receive_date ล่าสุด
  try {
    const PAGE = 1000
    let from = 0
    while (true) {
      const { data: rl } = await supabase.from('receive_logs').select('drug_code, lot, receive_date').range(from, from + PAGE - 1)
      if (!rl || rl.length === 0) break
      for (const r of rl) {
        const key = `${(r.drug_code || '').toLowerCase()}|${(r.lot || '').toLowerCase()}`
        const cur = receiveDateMap.get(key)
        if (!cur || (r.receive_date && r.receive_date > cur)) receiveDateMap.set(key, r.receive_date)
      }
      if (rl.length < PAGE) break
      from += PAGE
    }
  } catch { /* ถ้าโหลด receive_logs ไม่ได้ ก็ปล่อย waitDays = null */ }

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const inLimit = new Date(today); inLimit.setMonth(inLimit.getMonth() + 16)

  // ดึง drug_reorder_config เพื่อกรอง 'ตัดออก' / 'สั่งเมื่อขอ' (single source of truth กับ ReorderApp)
  const excludeByCode = new Map()
  try {
    const { data: cfg } = await supabase.from('drug_reorder_config').select('code, exclude_status, name')
    for (const c of cfg || []) {
      if (c.exclude_status) excludeByCode.set(String(c.code).toLowerCase(), c.exclude_status)
    }
  } catch { /* ถ้า table ยังไม่มี (pre-migration) ก็ผ่าน */ }

  const expiring = []
  const pendingReceive = []
  // aggregate stock ระดับ "code" (ไม่ใช่ per-lot) ให้ตรงกับระบบสั่งยาใหม่
  const byCode = new Map() // code(lower) → { code, name, type, unit, qty, ss, discontinued, location }

  data.forEach(row => {
    const isDiscontinued = String(row.receive_status || '').includes('ตัดออก')
    const isPendingReceive = String(row.receive_status || '').includes('รอตรวจรับ')
    const qtyNum = parseFloat(row.qty) || 0

    // --- รอตรวจรับ (อ้างอิงสถานะจาก inventory.receive_status — logic เดียวกับ App.jsx) ---
    if (isPendingReceive) {
      const key = `${(row.code || '').toLowerCase()}|${(row.lot || '').toLowerCase()}`
      const recvIso = receiveDateMap.get(key) || null
      const waitDays = recvIso ? Math.floor((today - new Date(recvIso)) / 86400000) : null
      pendingReceive.push({
        name:           row.name,
        code:           row.code,
        type:           row.type,
        location:       row.location,
        lot:            row.lot,
        exp:            row.exp,
        qty:            row.qty,
        unit:           row.unit,
        receive_status: row.receive_status,
        receive_date:   recvIso,
        waitDays,
      })
    }

    // --- ตรวจสอบวันหมดอายุ ---
    const expDate = _parseExpDate(row.exp)
    // qty="-"/null/ว่าง → parseFloat=NaN → ไม่ถือว่า 0 (ไม่ทราบจำนวน ยังควร alert)
    const isExplicitlyZero = !isNaN(parseFloat(row.qty)) && qtyNum === 0
    if (expDate && !isNaN(expDate) && expDate <= inLimit && !isExplicitlyZero && !isDiscontinued) {
      const daysLeft = Math.floor((expDate - today) / 86400000)
      expiring.push({
        name:     row.name,
        code:     row.code,
        exp:      row.exp,
        expDate,
        daysLeft,
        qty:      row.qty,
        lot:      row.lot,
        location: row.location,
        type:     row.type,
        unit:     row.unit,
      })
    }

    // --- aggregate stock ต่ำ ระดับ code (รวมทุก lot ของยาเดียวกัน) ---
    const codeRaw = (row.code || '').trim()
    if (!codeRaw) return
    const ck = codeRaw.toLowerCase()
    const ss = row.safety_stock != null ? parseFloat(row.safety_stock) : 0
    const cur = byCode.get(ck) || { code: codeRaw, name: row.name, type: row.type, unit: row.unit, qty: 0, ss: 0, discontinued: false, location: row.location }
    cur.qty += parseFloat(row.qty) || 0
    if (ss > cur.ss) cur.ss = ss
    if (isDiscontinued) cur.discontinued = true
    if (!cur.name && row.name) cur.name = row.name
    byCode.set(ck, cur)
  })

  // คำนวณ lowStock จาก byCode + filter ตาม drug_reorder_config.exclude_status
  const lowStock = []
  for (const [ck, c] of byCode) {
    if (c.discontinued) continue
    const exc = excludeByCode.get(ck)
    if (exc === 'ตัดออก' || exc === 'สั่งเมื่อขอ') continue
    if (c.ss > 0 && c.qty < c.ss) {
      lowStock.push({
        name: c.name, code: c.code, qty: c.qty,
        safety_stock: c.ss, location: c.location,
        type: c.type, unit: c.unit,
        ratio: c.qty / c.ss,
      })
    }
  }

  // เรียงรอตรวจรับ: นานสุดก่อน (null ไปท้าย)
  pendingReceive.sort((a, b) => {
    if (a.waitDays == null && b.waitDays == null) return 0
    if (a.waitDays == null) return 1
    if (b.waitDays == null) return -1
    return b.waitDays - a.waitDays
  })

  return {
    expiring:       expiring.sort((a, b) => a.expDate - b.expDate),
    lowStock:       lowStock.sort((a, b) => a.ratio - b.ratio),
    pendingReceive,
  }
}

// ดึงเบิก/รับ รายเดือน ย้อนหลัง `months` เดือน (รวมเดือนปัจจุบัน) สำหรับกราฟ Dashboard
// แต่ละเดือนมีทั้ง count (จำนวนครั้ง) และ value (มูลค่าบาท) — มูลค่าข้ามหน่วยได้ (บาทคือบาท)
//   เบิก: value = Σ(qty_out × ราคา/หน่วย) ตรงกับ getPrice ใน DispenseLogApp
//   รับ:  value = Σ total_price_vat ตรงกับ totalValue ใน ReceiveLogApp
//   (ไม่ dedup — เป็นภาพรวม trend เหมือน count chart เดิม; ตัวเลข authoritative ดูในโมดอลสรุปของแต่ละหน้า)
// ผล: { dispense:[{ym,label,count,value}], receive:[...], maxValueMonth, maxReceiveValueMonth, trend:{dispensePct,receivePct} }
export async function fetchDashboardCharts(months = 6) {
  const empty = { dispense: [], receive: [], trend: { dispensePct: null, receivePct: null } }
  if (!supabase) return empty

  // สร้างกรอบเดือน YYYY-MM ย้อนหลัง (เก่า→ใหม่) + label ไทยย่อ
  const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  const buckets = []
  const now = new Date()
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    buckets.push({ ym: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: TH_MONTHS[d.getMonth()] })
  }
  const fromStr = buckets[0].ym + '-01'

  // นับ "ครั้ง" + รวม "มูลค่า" (qty_out × ราคา/หน่วย) ต่อเดือน — มูลค่าเป็นบาท ข้ามหน่วยได้
  // ราคา/หน่วย ต้องตรงกับ getPrice ใน DispenseLogApp (fallback drug_unit ถ้าเป็นตัวเลข) — กัน stat ไม่ตรง (Rule #6)
  async function dispenseByMonth() {
    const isNum = (v) => v != null && String(v).trim() !== '' && !isNaN(parseFloat(String(v))) && isFinite(String(v).trim())
    const priceOf = (r) => {
      if (r.price_per_unit != null && r.price_per_unit !== '') return parseFloat(r.price_per_unit) || 0
      if (isNum(r.drug_unit)) return parseFloat(r.drug_unit) || 0
      return 0
    }
    const counts = {}, values = {}
    const PAGE = 1000
    let off = 0
    while (true) {
      const { data, error } = await supabase
        .from('dispense_logs')
        .select('dispense_date, qty_out, price_per_unit, drug_unit')
        .gte('dispense_date', fromStr)
        .range(off, off + PAGE - 1)
      if (error || !data || data.length === 0) break
      for (const r of data) {
        const ym = String(r.dispense_date || '').slice(0, 7)
        if (!ym) continue
        counts[ym] = (counts[ym] || 0) + 1
        values[ym] = (values[ym] || 0) + (Number(r.qty_out) || 0) * priceOf(r)
      }
      if (data.length < PAGE) break
      off += PAGE
    }
    return buckets.map(b => ({ ym: b.ym, label: b.label, count: counts[b.ym] || 0, value: Math.round(values[b.ym] || 0) }))
  }

  // นับ "ครั้ง" + รวม "มูลค่า" รับเข้าต่อเดือน (total_price_vat = มูลค่ารวมภาษี ต่อแถว)
  // ตรงกับ totalValue ใน ReceiveLogApp — Dashboard เป็นภาพรวม ไม่ dedup (เหมือน count chart เดิม)
  async function receiveByMonth() {
    const counts = {}, values = {}
    const PAGE = 1000
    let off = 0
    while (true) {
      const { data, error } = await supabase
        .from('receive_logs')
        .select('receive_date, total_price_vat')
        .gte('receive_date', fromStr)
        .range(off, off + PAGE - 1)
      if (error || !data || data.length === 0) break
      for (const r of data) {
        const ym = String(r.receive_date || '').slice(0, 7)
        if (!ym) continue
        counts[ym] = (counts[ym] || 0) + 1
        values[ym] = (values[ym] || 0) + (parseFloat(String(r.total_price_vat ?? '0').replace(/,/g, '')) || 0)
      }
      if (data.length < PAGE) break
      off += PAGE
    }
    return buckets.map(b => ({ ym: b.ym, label: b.label, count: counts[b.ym] || 0, value: Math.round(values[b.ym] || 0) }))
  }

  const [dispense, receive] = await Promise.all([
    dispenseByMonth(),
    receiveByMonth(),
  ])

  // trend % = เดือนล่าสุด vs เดือนก่อนหน้า (null ถ้าเดือนก่อนหน้า = 0 → เทียบไม่ได้)
  const pct = (arr, key) => {
    if (arr.length < 2) return null
    const prev = arr[arr.length - 2][key]
    const cur = arr[arr.length - 1][key]
    if (!prev) return null
    return Math.round(((cur - prev) / prev) * 100)
  }

  // เดือนที่มูลค่าสูงสุด (สำหรับคำสรุปบน Dashboard) — เบิก + รับ
  const maxValueOf = (arr) => arr.reduce(
    (best, d) => (d.value > (best?.value ?? -1) ? { label: d.label, value: d.value, ym: d.ym } : best),
    null
  )

  return {
    dispense, receive,
    maxValueMonth: maxValueOf(dispense),
    maxReceiveValueMonth: maxValueOf(receive),
    trend: { dispensePct: pct(dispense, 'value'), receivePct: pct(receive, 'value') },
  }
}

// --- Return Logs ---

export async function fetchReturnLogs({ dateFrom, dateTo, returnSource, returnType, drugName } = {}) {
  if (!supabase) return []

  let q = supabase
    .from('return_logs')
    .select('*')
    .order('return_date', { ascending: false })
    .order('created_at',  { ascending: false })

  if (dateFrom) q = q.gte('return_date', dateFrom)
  if (dateTo)   q = q.lte('return_date', dateTo)
  if (returnSource && returnSource !== 'all') {
    // ward และ vendor รองรับข้อมูลเก่าด้วย OR filter
    if (returnSource === 'ward')
      q = q.or('return_source.eq.ward,and(return_source.is.null,return_type.eq.ward_return)')
    else if (returnSource === 'vendor')
      q = q.or('return_source.eq.vendor,and(return_source.is.null,return_type.eq.vendor_return)')
    else
      q = q.eq('return_source', returnSource)
  } else if (returnType && returnType !== 'all') {
    q = q.eq('return_type', returnType)
  }
  if (drugName) q = q.ilike('drug_name', `%${drugName}%`)

  const { data, error } = await q.limit(500)
  if (error) throw error
  return data || []
}

export async function deleteReturnLog(id, auth = {}) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('return_logs').delete().eq('id', id)
  if (error) throw error
  await insertAuditLog({ action: 'delete_return', table_name: 'return_logs', user_name: resolveUserName(auth), department: auth?.department || '-', details: { return_log_id: id } })
}

export async function updateReturnLog(id, fields, auth = {}) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('return_logs').update(fields).eq('id', id)
  if (error) throw error
  await insertAuditLog({ action: 'update_return', table_name: 'return_logs', user_name: resolveUserName(auth), department: auth?.department || '-', details: { return_log_id: id, drug_name: fields.drug_name } })
}

export async function insertReturnLog(log, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('return_logs')
    .insert([log])
    .select()
    .single()
  if (error) throw error
  await insertAuditLog({
    action: 'insert_return', table_name: 'return_logs',
    user_name: resolveUserName(auth) !== '-' ? resolveUserName(auth) : (log.returned_by || '-'), department: auth.department || log.department,
    record_count: 1,
    details: { drug_name: log.drug_name, return_type: log.return_type, qty: log.qty_returned },
  })
  return data
}

// --- Audit Log ---

// normalize lot number สำหรับ search — strip leading zeros เฉพาะกรณีตัวเลขล้วน
// "007" → "7", "B007" → "B007", "0" → "0"
export function normalizeLotSearch(term) {
  const t = String(term || '').trim();
  if (!t) return t;
  const stripped = t.replace(/^0+/, '') || '0';
  return /^\d+$/.test(stripped) ? stripped : t;
}

export function resolveAuditUserName(auth) {
  if (!auth) return '-'
  const name = (auth.name || auth.full_name || '').trim()
  if (name && name !== '-') return name
  return auth.username || '-'
}

// ใช้ภายใน db.js
const resolveUserName = resolveAuditUserName

export async function insertAuditLog({ action, table_name, user_name, department, record_count, details }) {
  if (!supabase) return
  await supabase.from('audit_logs').insert([{
    action,
    table_name: table_name || null,
    user_name:  user_name  || '-',
    department: department || '-',
    record_count: record_count != null ? record_count : null,
    details:    details    || null,
  }])
  // ไม่ throw error เพื่อไม่ให้ audit failure ขัดการทำงานหลัก
}

export async function updateAuditLog(id, { user_name, department, record_count, details }) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('audit_logs').update({
    user_name,
    department: department || null,
    record_count: record_count != null ? Number(record_count) : null,
    details: details || null,
  }).eq('id', id)
  if (error) throw error
}

export async function deleteAuditLog(id) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('audit_logs').delete().eq('id', id)
  if (error) throw error
}

export async function bulkDeleteAuditLogs(ids) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('audit_logs').delete().in('id', ids)
  if (error) throw error
}

// --- Requester self-edit/delete requisition (pending only) ---

export async function deleteRequesterRequisition(id, auth = {}) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error: itemErr } = await supabase.from('requisition_items').delete().eq('requisition_id', id)
  if (itemErr) throw itemErr
  const { error } = await supabase.from('requisitions').delete().eq('id', id)
  if (error) throw error
  await insertAuditLog({ action: 'requester_delete_requisition', table_name: 'requisitions', user_name: resolveUserName(auth), department: auth?.department || '-', details: { requisition_id: id } })
}

export async function updateRequesterRequisition(id, { note, items }, auth = {}) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('requisitions').update({ note: note || null, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  for (const item of items) {
    const { error: itemErr } = await supabase.from('requisition_items').update({ requested_qty: item.requested_qty, note: item.note || null }).eq('id', item.id)
    if (itemErr) throw itemErr
  }
  await insertAuditLog({ action: 'requester_edit_requisition', table_name: 'requisitions', user_name: resolveUserName(auth), department: auth?.department || '-', details: { requisition_id: id } })
}

export async function fetchAuditLogs({ dateFrom, dateTo, action, userName } = {}) {
  if (!supabase) return []
  let q = supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })

  if (dateFrom) q = q.gte('created_at', dateFrom + 'T00:00:00')
  if (dateTo)   q = q.lte('created_at', dateTo   + 'T23:59:59')
  if (action && action !== 'all') q = q.eq('action', action)
  if (userName) q = q.ilike('user_name', `%${userName}%`)

  const { data, error } = await q.limit(500)
  if (error) throw error
  return data || []
}

export async function fetchNotifications() {
  if (!supabase) return []
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  // ต้องตรงกับ NOTIF_LABELS ใน AppRoot.jsx
  const NOTIFY_ACTIONS = [
    'submit_requisition',
    'requester_edit_requisition',
    'requester_delete_requisition',
    'delete_requisition',
    'update_requisition',
    'picking_requisition',
    'verify_requisition',
    'dispense_requisition',
    'received_requisition',
    'insert_return',
    'update_return',
    'delete_return',
    'delete_dispense',
    'update_dispense',
    'import_dispense',
    'delete_receive',
    'update_receive',
    'import_receive',
    'scan_invoice',
    'ap_acknowledge',
    'ap_mark_inspected',
    'ap_send_batch',
    'ap_mark_posted',
    'export_excel',
    // ── Reorder Analysis ──
    'analysis_run',
    'update_reorder_config',
    'import_reorder_config',
    'mark_ordered',
    'print_po',
  ]
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, table_name, user_name, department, record_count, details, created_at')
    .in('action', NOTIFY_ACTIONS)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data || []
}

// --- Upload Meta ---

export async function fetchUploadMeta() {
  if (!supabase) return { inventory: null, drug_details: null }

  const { data } = await supabase.from('upload_meta').select('*')
  const result = { inventory: null, drug_details: null }
  if (data) {
    data.forEach(row => { result[row.type] = row })
  }
  return result
}

export async function saveUploadMeta(type, fileName) {
  if (!supabase) return
  await supabase.from('upload_meta').upsert(
    { type, file_name: fileName, updated_at: new Date().toISOString() },
    { onConflict: 'type' }
  )
}

// --- Usage Rates (avg qty/day per drug from dispense_logs) ---

export async function fetchUsageRates(months = 6) {
  if (!supabase) return {}

  const from = new Date()
  from.setMonth(from.getMonth() - months)
  const fromStr = from.toISOString().slice(0, 10)

  const PAGE = 1000
  const allRows = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase
      .from('dispense_logs')
      .select('drug_code, qty_out, dispense_date')
      .gte('dispense_date', fromStr)
      .range(offset, offset + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...data)
    if (data.length < PAGE) break
    offset += PAGE
  }

  // normalize ให้ตรงกับ codeKey() ใน App.jsx
  const toKey = (val) => {
    if (!val || val === '-') return ''
    let s = String(val).trim().toLowerCase()
    if (/^[\d.]+[eE][+-]?\d+$/.test(s)) {
      const n = parseFloat(s)
      if (isFinite(n)) s = BigInt(Math.round(n)).toString()
    }
    return s.replace(/^0+(\d)/, '$1')
  }

  const codeData = {}
  allRows.forEach(row => {
    const code = toKey(row.drug_code)
    if (!code) return
    const qty = parseFloat(row.qty_out || 0) || 0
    if (qty <= 0) return
    if (!codeData[code]) codeData[code] = { totalQty: 0, monthSet: new Set() }
    codeData[code].totalQty += qty
    if (row.dispense_date) codeData[code].monthSet.add(String(row.dispense_date).slice(0, 7))
  })

  // คืนค่า avgPerDay เฉพาะยาที่มีข้อมูล ≥3 เดือน (ถ้าน้อยกว่านี้ fallback ss/60 ใน App.jsx)
  const totalDays = months * 30
  const result = {}
  Object.entries(codeData).forEach(([code, { totalQty, monthSet }]) => {
    if (monthSet.size >= 3) result[code] = totalQty / totalDays
  })
  return result
}

// --- App Users (Auth) ---

const hashPassword = async (password) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ตรวจสอบว่าเป็นการใช้งานครั้งแรก (ไม่มีผู้ใช้ในระบบ)
export async function checkFirstRun() {
  if (!supabase) return false
  const { count } = await supabase.from('app_users').select('*', { count: 'exact', head: true })
  return count === 0
}

export async function loginUser(username, password) {
  if (!supabase) return { error: 'Supabase ไม่ได้ตั้งค่า' }
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('username', username.trim())
    .single()
  if (error || !data) return { error: 'ไม่พบชื่อผู้ใช้' }
  if (!data.is_active) {
    if (data.suspend_until) {
      const until = new Date(data.suspend_until)
      if (until > new Date()) {
        const d = until
        const fmt = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} น.`
        return { error: `บัญชีถูกระงับชั่วคราว ถึง ${fmt}` }
      }
      // หมดเวลาระงับแล้ว → อนุญาตให้เข้าใช้งาน
    } else {
      return { error: 'บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ' }
    }
  }
  const hash = await hashPassword(password)
  if (hash !== data.password_hash) return { error: 'รหัสผ่านไม่ถูกต้อง' }
  const user = {
    id: data.id,
    username: data.username,
    name: data.full_name,
    department: data.department || '',
    role: data.role,
    permissions: data.permissions || [],
  }
  // Audit log — fire-and-forget, อย่าให้ฟ้องผู้ใช้ถ้า audit fail
  insertAuditLog({
    action: 'login', table_name: 'app_users',
    user_name: resolveAuditUserName({ name: user.name, username: user.username }),
    department: user.department || '-',
    details: { role: user.role, user_id: user.id },
  }).catch(() => {})
  return { user }
}

export async function registerUser({ username, password, full_name, department }) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const trimmed = username.trim()
  const { data: existing } = await supabase.from('app_users').select('id').eq('username', trimmed).maybeSingle()
  if (existing) throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว กรุณาเลือกชื่ออื่น')
  const hash = await hashPassword(password)
  const { data: allUsers } = await supabase.from('app_users').select('password_hash')
  if ((allUsers || []).some(u => u.password_hash === hash)) {
    throw new Error('รหัสผ่านนี้ถูกใช้งานแล้ว กรุณาตั้งรหัสผ่านใหม่')
  }
  const { error } = await supabase.from('app_users').insert([{
    username: trimmed,
    password_hash: hash,
    full_name: (full_name || '').trim(),
    department: department || null,
    role: 'requester',
    is_active: true,
  }])
  if (error) {
    if (error.code === '23505') throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว กรุณาเลือกชื่ออื่น')
    throw error
  }
}

export async function fetchAppUsers() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createAppUser({ username, password, full_name, department, role }) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const hash = await hashPassword(password)
  const { error } = await supabase.from('app_users').insert([{
    username: username.trim(),
    password_hash: hash,
    full_name: full_name.trim(),
    department: department || null,
    role,
    is_active: true,
  }])
  if (error) {
    if (error.code === '23505') throw new Error('ชื่อผู้ใช้นี้มีอยู่แล้ว')
    throw error
  }
}

export async function updateAppUser(id, { full_name, department, role, is_active, suspend_until }) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('app_users').update({
    full_name,
    department: department || null,
    role,
    is_active,
    suspend_until: suspend_until || null,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

export async function updateUserPermissions(id, permissions) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('app_users').update({
    permissions: permissions,
    updated_at: new Date().toISOString(),
  }).eq('id', id)
  if (error) throw error
}

export async function deleteAppUser(id) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('app_users').delete().eq('id', id)
  if (error) throw error
}

export async function changeAppUserPassword(id, newPassword) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const hash = await hashPassword(newPassword)
  const { error } = await supabase.from('app_users')
    .update({ password_hash: hash, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// --- Invoice Scanner (AI Vision) ---

// เรียก Edge Function scan-invoice → ส่งรูปบิล → รับ JSON
export async function scanInvoiceImage(imageBase64, mimeType) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.functions.invoke('scan-invoice', {
    body: { image: imageBase64, mimeType },
  })
  if (error) throw new Error(error.message || 'Edge Function error')
  if (data?.error) throw new Error(data.error)
  return data
}

// INSERT only — ไม่ DELETE ข้อมูลเดิม (ต่างจาก insertReceiveRows)
export async function insertScannedBillRows(rows, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('receive_logs').insert(rows.slice(i, i + CHUNK))
    if (error) throw error
  }
  await insertAuditLog({
    action: 'scan_invoice', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth.department,
    record_count: rows.length,
  })
  return rows.length
}

// อัพโหลดภาพบิลไปยัง Supabase Storage → return public URL
export async function uploadInvoiceImage(file, fileName) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.storage
    .from('invoice-images')
    .upload(fileName, file, { cacheControl: '3600', upsert: false })
  if (error) throw error
  const { data: urlData } = supabase.storage.from('invoice-images').getPublicUrl(data.path)
  return urlData.publicUrl
}

// ค้นหา drug_code จาก receive_logs ที่มีอยู่แล้ว โดยจับคู่ drug_name
export async function lookupDrugCodes(names) {
  if (!supabase || !names.length) return {}
  const { data } = await supabase.from('receive_logs')
    .select('drug_name, drug_code')
    .in('drug_name', names)
    .not('drug_code', 'is', null)
    .neq('drug_code', '-')
    .order('id', { ascending: false })
    .limit(500)
  const result = {}
  if (data) {
    data.forEach(r => {
      if (!result[r.drug_name] && r.drug_code && r.drug_code !== '-')
        result[r.drug_name] = r.drug_code
    })
  }
  return result
}

// --- Stock Summary (Dashboard modal) ---

export const parseUnitFactor = (unit) => {
  const m = String(unit || '').match(/^(\d+)\s*(.+)$/);
  if (m) return { factor: parseInt(m[1]), base: m[2].trim() };
  return { factor: 1, base: String(unit || '-').trim() };
};

export async function fetchStockSummary() {
  if (!supabase) return [];

  // inventory paginate ครบทุก row — ไม่งั้นยาที่เรียงท้าย (เช่นน้ำเกลือ) หายจากรายการคงเหลือ (Critical Rule #2)
  const [invData, recRes] = await Promise.all([
    fetchAllInventoryRows('code, name, type, unit, qty, receive_status'),
    supabase.from('receive_logs')
      .select('drug_code, drug_unit, receive_date, purchase_type, price_per_unit')
      .not('drug_unit', 'is', null)
      .not('drug_code', 'is', null)
      .order('receive_date', { ascending: false })
      .limit(10000),
  ]);

  // หน่วยปัจจุบัน = หน่วยจากบิล "การซื้อ" ราคา>0 ล่าสุด (ตรงกับ glossary + ReorderApp)
  // ไม่นับบริจาค/ยืม/ราคา 0 เพราะ pack อาจต่างจากที่ซื้อจริง — ดู fetchLatestReceiptInfo
  const latestUnit = {};
  (recRes.data || []).forEach(r => {
    const key = (r.drug_code || '').trim();
    if (!key || key === '-' || latestUnit[key] || !r.drug_unit) return;
    const price = parseFloat(String(r.price_per_unit ?? '0').replace(/,/g, '')) || 0;
    const isPurchase = price > 0 && String(r.purchase_type || '').trim() === PURCHASE_TYPE;
    if (isPurchase) latestUnit[key] = r.drug_unit;
  });

  // group inventory by drug code
  const drugMap = {};
  (invData || []).forEach(row => {
    const qty = parseFloat(String(row.qty || '0').replace(/,/g, '')) || 0;
    if (qty <= 0) return;
    if (String(row.receive_status || '').includes('ตัดออก')) return;
    const key = (row.code && row.code !== '-') ? row.code.trim() : (row.name || '').trim();
    if (!key) return;
    if (!drugMap[key]) drugMap[key] = { code: row.code, name: row.name, type: row.type, lots: [] };
    drugMap[key].lots.push({ unit: row.unit, qty });
  });

  return Object.values(drugMap).map(drug => {
    const codeKey = (drug.code && drug.code !== '-') ? drug.code.trim() : '';
    const mainUnit = (codeKey && latestUnit[codeKey]) || drug.lots[0]?.unit || '-';
    const mainParsed = parseUnitFactor(mainUnit);

    const uniqueUnits = [...new Set(drug.lots.map(l => l.unit))];
    const hasMultipleUnits = uniqueUnits.length > 1;

    let totalSmallest = 0;
    drug.lots.forEach(lot => {
      const p = parseUnitFactor(lot.unit);
      totalSmallest += lot.qty * p.factor;
    });

    const totalInMain = mainParsed.factor > 0 ? totalSmallest / mainParsed.factor : totalSmallest;
    return {
      code: drug.code,
      name: drug.name,
      type: drug.type,
      mainUnit,
      totalQty: Math.ceil(totalInMain),
      hasMultipleUnits,
      units: uniqueUnits,
      lotCount: drug.lots.length,
    };
  })
  .filter(d => d.totalQty > 0)
  .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'th'));
}

// --- Reorder: หน่วย/ราคา/บริษัท/วันรับ/lead time ต่อรหัสยา (จาก receive_logs) ---

// purchase_type ของบิล "ซื้อจริง" (ยืนยันจาก DB: การซื้อ=2171; อื่นๆ=ยืม/บริจาค/คืน/สนับสนุน/แลกเปลี่ยน)
const PURCHASE_TYPE = 'การซื้อ';

// คืน { [codeLower]: { unit, factor, base, supplier, pricePerUnit, receiveDate, leadTimeAvg } }
// - หน่วย/ราคา/บริษัท/วันรับ = บิล "การซื้อ" ราคา>0 ล่าสุด
// - leadTimeAvg = เฉลี่ย leadtime ของบิลการซื้อ (เฉพาะที่มีค่า leadtime) — ตาม Excel "วิเคราะห์ซื้อ"
// - รหัสที่ไม่มีบิลซื้อเลย → unit=null (consumer ต้อง fallback เป็น config/inventory)
export async function fetchLatestReceiptInfo() {
  if (!supabase) return {};

  const toNum = (v) => parseFloat(String(v ?? '0').replace(/,/g, '')) || 0;
  // leadtime: คืน null ถ้าไม่มีข้อมูล (null/'-'/ว่าง) หรือนอกช่วง 0–90 (Excel: AVERAGEIFS กรอง 0–90)
  const parseLt = (v) => {
    if (v == null) return null;
    const s = String(v).trim();
    if (!s || s === '-') return null;
    const n = parseFloat(s.replace(/,/g, ''));
    if (!Number.isFinite(n) || n < 0 || n > 90) return null;
    return n;
  };
  const BATCH = 1000;
  const result = {};
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from('receive_logs')
      .select('drug_code, drug_unit, supplier_current, price_per_unit, receive_date, leadtime, purchase_type')
      .not('drug_code', 'is', null)
      .order('receive_date', { ascending: false, nullsFirst: false })
      .order('id', { ascending: false })
      .range(offset, offset + BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    data.forEach(row => {
      const code = (row.drug_code || '').trim().toLowerCase();
      if (!code || code === '-') return;

      if (!result[code]) {
        result[code] = { unit: null, factor: 1, base: null, supplier: null, pricePerUnit: 0, receiveDate: null, leadTimeAvg: 0, _ltSum: 0, _ltCount: 0 };
      }
      const entry = result[code];

      const price = toNum(row.price_per_unit);
      const isPurchase = price > 0 && String(row.purchase_type || '').trim() === PURCHASE_TYPE;
      if (isPurchase) {
        // leadtime เฉลี่ยจากบิลการซื้อทุกใบ
        const lt = parseLt(row.leadtime);
        if (lt != null) { entry._ltSum += lt; entry._ltCount += 1; }
        // หน่วย/ราคา/บริษัท/วันรับ = บิลการซื้อล่าสุด (แถวแรกที่เจอ เพราะ sort receive_date desc)
        if (entry.unit === null && row.drug_unit) {
          const { factor, base } = parseUnitFactor(row.drug_unit);
          entry.unit = row.drug_unit;
          entry.factor = factor;
          entry.base = base;
          entry.supplier = row.supplier_current || null;
          entry.pricePerUnit = price;
          entry.receiveDate = row.receive_date || null;
        }
      }
    });

    if (data.length < BATCH) break;
    offset += BATCH;
  }

  // เฉลี่ย leadtime ต่อรหัส แล้วเก็บกวาด field ชั่วคราว
  for (const entry of Object.values(result)) {
    entry.leadTimeAvg = entry._ltCount > 0 ? entry._ltSum / entry._ltCount : 0;
    delete entry._ltSum;
    delete entry._ltCount;
  }

  return result;
}

// --- Picking Workflow ---

export async function fetchInventoryByCodes(codes) {
  if (!supabase || !codes.length) return []
  const { data, error } = await supabase
    .from('inventory')
    .select('code, name, lot, exp, qty, location, main_log')
    .in('code', codes)
    .gt('qty', 0)
  if (error) throw error
  return data || []
}

export async function startPickingRequisition(id, { pickerName, items }, auth = {}) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  for (const item of items) {
    const { error } = await supabase.from('requisition_items')
      .update({ picked_lot: item.picked_lot || null, picked_exp: item.picked_exp || null, picked_qty: item.picked_qty ?? null })
      .eq('id', item.id)
    if (error) throw error
  }
  const { error } = await supabase.from('requisitions')
    .update({ status: 'picking', picker_name: pickerName, picking_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await insertAuditLog({ action: 'picking_requisition', table_name: 'requisitions', user_name: resolveUserName(auth), department: auth?.department || '-', details: { requisition_id: id, picker_name: pickerName } })
}

export async function verifyRequisition(id, verifierName, auth = {}) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('requisitions')
    .update({ status: 'ready', verifier_name: verifierName, verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await insertAuditLog({ action: 'verify_requisition', table_name: 'requisitions', user_name: resolveUserName(auth), department: auth?.department || '-', details: { requisition_id: id, verifier_name: verifierName } })
}

export async function markRequisitionDispensed(id, auth = {}) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('requisitions')
    .update({ status: 'dispensed', dispensed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await insertAuditLog({ action: 'dispense_requisition', table_name: 'requisitions', user_name: resolveUserName(auth), department: auth?.department || '-', details: { requisition_id: id } })
}

export async function confirmReceivedRequisition(id, receivedBy, auth = {}) {
  if (!supabase) throw new Error('Supabase ไม่ได้ตั้งค่า')
  const { error } = await supabase.from('requisitions')
    .update({ status: 'received', received_at: new Date().toISOString(), received_by: receivedBy, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await insertAuditLog({ action: 'received_requisition', table_name: 'requisitions', user_name: resolveUserName(auth), department: auth?.department || '-', details: { requisition_id: id, received_by: receivedBy } })
}

// --- AP Workflow (ตั้งหนี้รายอาทิตย์) ---
// ทุกฟังก์ชันทำงานระดับ bill_number — 1 บิล update พร้อมกันทุก lot ในบิลนั้น
// Stage flow: NULL/inspected → sent_batch → posted

const AP_DEFAULT_LIMIT = 5000

// ดึงบิลตาม stage filter — group by bill_number, return summary per bill
export async function fetchApBills({ stage = null, dateFrom, dateTo, batchId } = {}) {
  if (!supabase) return []
  let q = supabase
    .from('receive_logs')
    .select('id, bill_number, supplier_current, receive_date, drug_code, drug_name, drug_type, drug_unit, lot, exp, qty_received, price_per_unit, total_price_vat, receive_status, ap_stage, ap_batch_id, acknowledged_at, acknowledged_by, inspected_at, inspected_by, ap_sent_at, ap_sent_by, ap_posted_at, ap_posted_by')
    .order('receive_date', { ascending: false })
    .limit(AP_DEFAULT_LIMIT)

  // ถ้าไม่ระบุ stage → ไม่กรอง (เช่นใช้ดูทั้ง batch รวม posted)
  if (stage === 'pending_inspect') q = q.is('ap_stage', null)
  else if (stage === 'unack')      q = q.is('ap_stage', null).is('acknowledged_at', null)
  else if (stage === 'acked')      q = q.is('ap_stage', null).not('acknowledged_at', 'is', null)
  else if (stage === 'inspected')  q = q.eq('ap_stage', 'inspected')
  else if (stage === 'sent_batch') q = q.eq('ap_stage', 'sent_batch')
  else if (stage === 'posted')     q = q.eq('ap_stage', 'posted')
  else if (stage === 'unposted')   q = q.in('ap_stage', ['inspected', 'sent_batch'])
  else if (stage === 'pending_all') q = q.or('ap_stage.is.null,ap_stage.eq.inspected')

  if (batchId)  q = q.eq('ap_batch_id', batchId)
  if (dateFrom) q = q.gte('receive_date', dateFrom)
  if (dateTo)   q = q.lte('receive_date', dateTo)

  const { data, error } = await q
  if (error) throw error
  return data || []
}

// billGroupKey + groupRowsByBill ย้ายไป ./billGroup (pure module, unit-test ได้)
// re-export เพื่อ consumer เดิม (import จาก './lib/db') ไม่ต้องแก้ — ดู billGroup.test.js
export { billGroupKey, groupRowsByBill } from './billGroup'

// จัดซื้อกด "รับบิลแล้ว" — ไม่เปลี่ยน ap_stage (ยังเป็น NULL) แค่ตั้ง acknowledged_at/by
// ไม่บล็อก flow → Mark ตรวจรับได้แม้ยังไม่ ack
export async function markBillsAcknowledged(rowIds, billNumbers, purchaserName, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!rowIds || rowIds.length === 0) return 0
  const now = new Date().toISOString()
  const ackBy = (purchaserName && purchaserName.trim()) ? purchaserName.trim() : null
  const { error, count } = await supabase
    .from('receive_logs')
    .update({ acknowledged_at: now, acknowledged_by: ackBy }, { count: 'exact' })
    .in('id', rowIds)
    .is('ap_stage', null)        // ack ได้เฉพาะบิลที่ยังไม่ inspected
    .is('acknowledged_at', null) // กัน double-ack
  if (error) throw error
  await insertAuditLog({
    action: 'ap_acknowledge', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth?.department || '-',
    record_count: count ?? rowIds.length,
    details: { bills: billNumbers, purchaser: ackBy || '(ไม่กรอก)' },
  })
  return count || 0
}

// ย้อน acknowledge (กดผิด)
export async function unmarkBillsAcknowledged(rowIds, billNumbers, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!rowIds || rowIds.length === 0) return 0
  const { error, count } = await supabase
    .from('receive_logs')
    .update({ acknowledged_at: null, acknowledged_by: null }, { count: 'exact' })
    .in('id', rowIds)
    .is('ap_stage', null)
    .not('acknowledged_at', 'is', null)
  if (error) throw error
  await insertAuditLog({
    action: 'ap_unacknowledge', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth?.department || '-',
    record_count: count ?? rowIds.length,
    details: { bills: billNumbers },
  })
  return count || 0
}

// Mark บิล (1 ใบ หรือหลายใบ) → inspected
// บังคับ flow: ต้อง acknowledged_at NOT NULL (จัดซื้อรับบิลก่อน) — กัน skip stage
// returnDate = วันที่ส่งคืนบิลให้จัดซื้อ (default = วันนี้) — ใช้แทน NOW() เก็บใน inspected_at
export async function markBillsInspected(rowIds, billNumbers, inspectorName, auth = {}, returnDate = null) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!rowIds || rowIds.length === 0) return 0
  // ถ้ามี returnDate (YYYY-MM-DD) → ใช้เที่ยงวันของวันนั้นเป็น timestamp (กัน timezone offset)
  // ถ้าไม่มี → ใช้ NOW()
  const inspectedAt = returnDate ? new Date(`${returnDate}T12:00:00`).toISOString() : new Date().toISOString()
  const { error, count } = await supabase
    .from('receive_logs')
    .update({ ap_stage: 'inspected', inspected_at: inspectedAt, inspected_by: (inspectorName || '').trim() || null }, { count: 'exact' })
    .in('id', rowIds)
    .is('ap_stage', null)
    .not('acknowledged_at', 'is', null)
  if (error) throw error
  await insertAuditLog({
    action: 'ap_mark_inspected', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth?.department || '-',
    record_count: count ?? rowIds.length,
    details: { bills: billNumbers, inspector: inspectorName },
  })
  return count || 0
}

// Mark บิลที่เลือก → sent_batch + set batch_id
// senderName = ชื่อ จนท.จัดซื้อ — ถ้าว่าง/null → ap_sent_by = null (เว้นช่องเซ็นเอง)
export async function markBillsSentBatch(rowIds, billNumbers, batchId, auth = {}, senderName = null) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!rowIds || rowIds.length === 0) return 0
  const now = new Date().toISOString()
  const apSentBy = (senderName && senderName.trim()) ? senderName.trim() : null
  const { error, count } = await supabase
    .from('receive_logs')
    .update({ ap_stage: 'sent_batch', ap_batch_id: batchId, ap_sent_at: now, ap_sent_by: apSentBy }, { count: 'exact' })
    .in('id', rowIds)
    .eq('ap_stage', 'inspected')
  if (error) throw error
  await insertAuditLog({
    action: 'ap_send_batch', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth?.department || '-',
    record_count: count ?? rowIds.length,
    details: { batch_id: batchId, bill_count: (billNumbers || []).length, bills: billNumbers, purchaser: apSentBy || '(ไม่กรอก)' },
  })
  return count || 0
}

// Mark บิลที่เลือก → posted (บัญชี post แล้ว)
// posterName = ชื่อ จนท.บัญชี — ถ้าว่าง/null → ap_posted_by = null (เว้นว่างให้เซ็นเอง)
export async function markBillsPosted(rowIds, billNumbers, auth = {}, posterName = null) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!rowIds || rowIds.length === 0) return 0
  const now = new Date().toISOString()
  const apPostedBy = (posterName && posterName.trim()) ? posterName.trim() : null
  const { error, count } = await supabase
    .from('receive_logs')
    .update({ ap_stage: 'posted', ap_posted_at: now, ap_posted_by: apPostedBy }, { count: 'exact' })
    .in('id', rowIds)
    .eq('ap_stage', 'sent_batch')
  if (error) throw error
  await insertAuditLog({
    action: 'ap_mark_posted', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth?.department || '-',
    record_count: count ?? rowIds.length,
    details: { bills: billNumbers, accountant: apPostedBy || '(ไม่กรอก)' },
  })
  return count || 0
}

// Rollback: undo inspected กลับเป็น NULL (รอตรวจรับ)
export async function unmarkBillsInspected(rowIds, billNumbers, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!rowIds || rowIds.length === 0) return 0
  const { error, count } = await supabase
    .from('receive_logs')
    .update({ ap_stage: null, inspected_at: null, inspected_by: null }, { count: 'exact' })
    .in('id', rowIds)
    .eq('ap_stage', 'inspected')
  if (error) throw error
  await insertAuditLog({
    action: 'ap_uninspect', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth?.department || '-',
    record_count: count ?? rowIds.length,
    details: { bills: billNumbers },
  })
  return count || 0
}

// Rollback: undo sent_batch กลับเป็น inspected (ออกจาก batch)
export async function unmarkBillsSentBatch(rowIds, billNumbers, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!rowIds || rowIds.length === 0) return 0
  const { error, count } = await supabase
    .from('receive_logs')
    .update({ ap_stage: 'inspected', ap_batch_id: null, ap_sent_at: null, ap_sent_by: null }, { count: 'exact' })
    .in('id', rowIds)
    .eq('ap_stage', 'sent_batch')
  if (error) throw error
  await insertAuditLog({
    action: 'ap_unsend_batch', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth?.department || '-',
    record_count: count ?? rowIds.length,
    details: { bills: billNumbers },
  })
  return count || 0
}

// Reset ทั้ง batch — ทุกบิลใน batch กลับเป็น inspected, batch หาย (รวม posted ด้วย)
export async function resetApBatch(batchId, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!batchId) throw new Error('batchId required')
  const { error, count } = await supabase
    .from('receive_logs')
    .update({
      ap_stage: 'inspected', ap_batch_id: null,
      ap_sent_at: null, ap_sent_by: null,
      ap_posted_at: null, ap_posted_by: null,
    }, { count: 'exact' })
    .eq('ap_batch_id', batchId)
  if (error) throw error
  await insertAuditLog({
    action: 'ap_reset_batch', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth?.department || '-',
    record_count: count || 0,
    details: { batch_id: batchId },
  })
  return count || 0
}

// Rollback: undo posted กลับเป็น sent_batch (กรณีกดผิด)
export async function unmarkBillsPosted(rowIds, billNumbers, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!rowIds || rowIds.length === 0) return 0
  const { error, count } = await supabase
    .from('receive_logs')
    .update({ ap_stage: 'sent_batch', ap_posted_at: null, ap_posted_by: null }, { count: 'exact' })
    .in('id', rowIds)
    .eq('ap_stage', 'posted')
  if (error) throw error
  await insertAuditLog({
    action: 'ap_unpost', table_name: 'receive_logs',
    user_name: resolveUserName(auth), department: auth?.department || '-',
    record_count: count ?? rowIds.length,
    details: { bills: billNumbers },
  })
  return count || 0
}

// ดึงประวัติ batch ทั้งหมด — group by ap_batch_id
export async function fetchApBatches() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('receive_logs')
    .select('ap_batch_id, ap_stage, bill_number, ap_sent_at, ap_sent_by, qty_received, price_per_unit, total_price_vat')
    .not('ap_batch_id', 'is', null)
    .order('ap_batch_id', { ascending: false })
    .limit(AP_DEFAULT_LIMIT)
  if (error) throw error
  const map = new Map()
  for (const r of data || []) {
    const bid = r.ap_batch_id
    if (!map.has(bid)) {
      map.set(bid, {
        batch_id: bid, sent_at: r.ap_sent_at, sent_by: r.ap_sent_by,
        bills: new Set(), rows: 0, posted_bills: new Set(), total_value: 0,
      })
    }
    const b = map.get(bid)
    b.bills.add(r.bill_number)
    if (r.ap_stage === 'posted') b.posted_bills.add(r.bill_number)
    b.rows += 1
    const qty = parseFloat(r.qty_received) || 0
    const price = parseFloat(r.price_per_unit) || 0
    const lineValue = (r.total_price_vat != null && r.total_price_vat > 0)
      ? parseFloat(r.total_price_vat) : qty * price
    b.total_value += lineValue
    if (r.ap_sent_at && (!b.sent_at || r.ap_sent_at > b.sent_at)) b.sent_at = r.ap_sent_at
  }
  return Array.from(map.values()).map(b => ({
    batch_id: b.batch_id, sent_at: b.sent_at, sent_by: b.sent_by,
    bill_count: b.bills.size, posted_count: b.posted_bills.size,
    row_count: b.rows, total_value: b.total_value,
  }))
}

// --- Analytics ---

export async function fetchDispenseAnalytics(dateFrom, dateTo) {
  if (!supabase) return []
  const PAGE = 1000
  let from = 0
  let allRows = []
  while (true) {
    let q = supabase
      .from('dispense_logs')
      .select('drug_name, drug_code, drug_type, qty_out, price_per_unit, drug_unit, department, dispense_date, item_type')
      .order('dispense_date', { ascending: true })
      .range(from, from + PAGE - 1)
    if (dateFrom) q = q.gte('dispense_date', dateFrom)
    if (dateTo)   q = q.lte('dispense_date', dateTo)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    allRows = allRows.concat(data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return allRows
}

// ============================================================
// Reorder Analysis — drug_reorder_config + analysis_runs
// ============================================================

export async function fetchDrugReorderConfig() {
  if (!supabase) return []
  const PAGE = 1000
  let off = 0
  const all = []
  while (true) {
    const { data, error } = await supabase
      .from('drug_reorder_config')
      .select('*')
      .order('code', { ascending: true })
      .range(off, off + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE) break
    off += PAGE
  }
  return all
}

export async function upsertDrugReorderConfig(config, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!config?.code) throw new Error('code is required')
  const payload = {
    code: config.code,
    name: config.name ?? null,
    supplier: config.supplier ?? null,
    risk_group: config.risk_group ?? 'Normal',
    lead_time_days: config.lead_time_days ?? 15,
    price_per_unit: config.price_per_unit ?? 0,
    exclude_status: config.exclude_status ?? null,
    pack_size: config.pack_size ?? 1,
    notes: config.notes ?? null,
    updated_by: resolveAuditUserName(auth),
  }
  const { error } = await supabase.from('drug_reorder_config').upsert(payload, { onConflict: 'code' })
  if (error) throw error
  await insertAuditLog({
    action: 'update_reorder_config', table_name: 'drug_reorder_config',
    user_name: resolveAuditUserName(auth), department: auth?.department || '-',
    details: { code: config.code, name: config.name },
  })
}

export async function bulkUpsertDrugReorderConfig(configs, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!Array.isArray(configs) || configs.length === 0) return 0
  const rows = configs.filter(c => c?.code).map(c => ({
    code: c.code,
    name: c.name ?? null,
    supplier: c.supplier ?? null,
    risk_group: c.risk_group ?? 'Normal',
    lead_time_days: c.lead_time_days ?? 15,
    price_per_unit: c.price_per_unit ?? 0,
    exclude_status: c.exclude_status ?? null,
    pack_size: c.pack_size ?? 1,
    notes: c.notes ?? null,
    updated_by: resolveAuditUserName(auth),
  }))
  const CHUNK = 300
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from('drug_reorder_config')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'code' })
    if (error) throw error
  }
  await insertAuditLog({
    action: 'import_reorder_config', table_name: 'drug_reorder_config',
    user_name: resolveAuditUserName(auth), department: auth?.department || '-',
    record_count: rows.length,
  })
  return rows.length
}

// ดึงยอดเบิกรายเดือนต่อยา ระหว่าง [fromDate, toDate] (ISO YYYY-MM-DD)
// ผล: { [drug_code]: { name, unit, months: { 'YYYY-MM': qty } } }
// กรองรายการที่ไม่ใช่การจ่ายจริง (note/main_log มี 'บันทึก') ออก
export async function fetchMonthlyDispenseUsage(fromDate, toDate) {
  if (!supabase) return {}
  const PAGE = 1000
  let off = 0
  const rows = []
  while (true) {
    let q = supabase
      .from('dispense_logs')
      .select('drug_code, drug_name, drug_unit, qty_out, dispense_date, main_log, note')
      .order('dispense_date', { ascending: true })
      .range(off, off + PAGE - 1)
    if (fromDate) q = q.gte('dispense_date', fromDate)
    if (toDate)   q = q.lte('dispense_date', toDate)
    const { data, error } = await q
    if (error) throw error
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PAGE) break
    off += PAGE
  }
  const byCode = {}
  for (const r of rows) {
    const code = (r.drug_code || '').trim()
    if (!code || code === '-') continue
    const recordOnly = String(r.main_log || '').includes('บันทึก') || String(r.note || '').includes('บันทึกเท่านั้น')
    if (recordOnly) continue
    // normalize → หน่วยย่อยสุด (เม็ด): qty_out อาจอยู่หน่วย pack ต่างกันต่อแถว → ×factor ก่อนรวม
    const qty = (parseFloat(r.qty_out || 0) || 0) * parseUnitFactor(r.drug_unit).factor
    if (qty <= 0) continue
    const ym = String(r.dispense_date || '').slice(0, 7)
    if (!ym) continue
    if (!byCode[code]) byCode[code] = { name: r.drug_name || '', unit: r.drug_unit || '', months: {} }
    byCode[code].months[ym] = (byCode[code].months[ym] || 0) + qty
    if (!byCode[code].name && r.drug_name) byCode[code].name = r.drug_name
  }
  return byCode
}

export async function saveAnalysisRun(run, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const payload = {
    run_by: resolveAuditUserName(auth),
    mode: run.mode,
    stats_from: run.stats_from,
    stats_to: run.stats_to,
    excluded_month: run.excluded_month ?? null,
    lead_time_default: run.lead_time_default ?? 15,
    snapshot_date: run.snapshot_date ?? null,
    total_rows: run.total_rows ?? 0,
    reorder_rows: run.reorder_rows ?? 0,
    total_amount: run.total_amount ?? 0,
    summary: run.summary ?? {},
    results: run.results ?? [],
    notes: run.notes ?? null,
  }
  const { data, error } = await supabase.from('analysis_runs').insert(payload).select('id').single()
  if (error) throw error
  await insertAuditLog({
    action: 'analysis_run', table_name: 'analysis_runs',
    user_name: resolveAuditUserName(auth), department: auth?.department || '-',
    details: {
      run_id: data.id, mode: run.mode,
      total_rows: run.total_rows, reorder_rows: run.reorder_rows,
      total_amount: run.total_amount,
    },
  })
  return data.id
}

export async function fetchAnalysisRuns(limit = 50) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('analysis_runs')
    .select('id, run_at, run_by, mode, stats_from, stats_to, snapshot_date, total_rows, reorder_rows, total_amount, summary, notes')
    .order('run_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function fetchAnalysisRun(id) {
  if (!supabase) return null
  const { data, error } = await supabase.from('analysis_runs').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function deleteAnalysisRun(id, auth = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('analysis_runs').delete().eq('id', id)
  if (error) throw error
  await insertAuditLog({
    action: 'delete_analysis_run', table_name: 'analysis_runs',
    user_name: resolveAuditUserName(auth), department: auth?.department || '-',
    details: { run_id: id },
  })
}

export async function logReorderAction(action, details, auth = {}) {
  await insertAuditLog({
    action, table_name: 'drug_reorder_config',
    user_name: resolveAuditUserName(auth), department: auth?.department || '-',
    details: details || {},
  })
}
