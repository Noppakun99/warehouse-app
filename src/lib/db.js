import { supabase } from './supabase'

const CHUNK_SIZE = 500

// --- Inventory ---

export async function fetchInventory() {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .order('location')

  if (error) throw error
  if (!data || data.length === 0) return null

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
      .select('drug_code, drug_name, lot, bill_number, exp, supplier_current, supplier_prev, drug_swap_policy, drug_type, safety_stock, leadtime, sum_of_lead_time, price_per_unit, receive_date, inspect_date, qty_received, receive_status, purchase_type')
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

const RECEIVE_COL_MAP = {
  order_date:['วันที่แจ้งสั่ง','order date','order_date','วันสั่ง','วันที่สั่ง'],
  receive_date:['วันที่รับ','receive date','receive_date','วันที่รับของ','วันรับ','วันที่'],
  inspect_date:['วันที่ตรวจรับ','inspect date','inspect_date','วันตรวจรับ'],
  leadtime:['leadtime','lead time','ระยะเวลา'],
  inspect_lag:['วันที่ตรวจรับ-วันที่รับของ','inspect lag','lag','ระยะตรวจรับ'],
  bill_number:['เลขที่บิลซื้อ','เลขบิล','bill','bill_number','เลขที่บิล','invoice'],
  po_number:['เลขที่po','po number','po_number','po','เลข po'],
  purchase_type:['สถานะ','สถานะการซื้อ','สถานะการสั่ง','purchase type','purchase_type','ประเภทการซื้อ'],
  receive_status:['ผลการพิจารณา','สถานะตรวจรับ','สถานะการตรวจรับ','สถานะตรวจ','receive status','receive_status','สถานะรับ'],
  main_log:['mainlog','main_log','main log','log หลัก'],
  detail_log:['detailedlog','detail_log','detailed log','detaillog','log ย่อย'],
  drug_code:['รหัส','รหัสยา','รหัสhosxp','รหัส hosxp','code','drug_code'],
  drug_name:['รายการยา','ชื่อยา','drug_name','name','item'],
  drug_type:['รูปแบบ','ชนิด','type','drug_type','form'],
  item_type:['ชนิดรายการ','item_type','item type'],
  drug_unit:['หน่วย','หน่วยยา','drug_unit','unit_label'],
  supplier_current:['บริษัทปัจจุบัน','บริษัทยา','บริษัท','supplier','supplier_current','vendor'],
  supplier_prev:['บริษัทก่อนหน้า','บริษัทก่อนนาน','supplier_prev','previous supplier','บริษัทเก่า'],
  supplier_changed:['เปลี่ยนบริษัท','supplier_changed','change','เปลี่ยน'],
  lot:['lot','lot.','lot number','lot no','เลขที่ lot'],
  exp:['exp','exp.','exp date','วันหมดอายุ'],
  note:['หมายเหตุ','note','notes','remark','หมายเหตุรับ'],
  exp_note:['หมายเหตุหมดอายุ','exp_note','exp note','expiry note'],
  qty_received:['จำนวนที่รับ','qty_received','quantity','จำนวนรับ','จำนวน'],
  unit_per_bill:['หน่วย/บิล','unit_per_bill','unit per bill','หน่วยบิล'],
  price_per_unit:['ราคาต่อหน่วย(บาท)','ราคาต่อหน่วย','ราคา/หน่วย','price_per_unit','price','unit price'],
  total_price_vat:['มูลค่ารวมภาษี','total_price_vat','total price vat'],
  total_price_formula:['มูลค่า/สูตร','total_price_formula'],
  safety_stock:['safety stock','safety_stock','สต็อกขั้นต่ำ'],
  sum_of_lead_time:['sum of lead time (in days)','sum of lead time','sum_of_lead_time','lead time (in days)'],
  swap_condition:['เงื่อนไขการแลกเปลี่ยนยาของบริษัท','เงื่อนไขแลกเปลี่ยน'],
  swap_items:['ระบุรายการยาและเงื่อนไขยาแต่ละตัว','ระบุเงื่อนไขการแลกเปลี่ยนยา','รายการยาแลกเปลี่ยน'],
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

function _parseReceiveDate(raw) {
  if (!raw||raw==='-'||raw==='0'||String(raw).trim()==='') return null;
  const s = String(raw).trim().split(/[\sT]/)[0];
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

export async function importReceiveLogs(csvText) {
  if (!supabase) throw new Error('Supabase not configured')
  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) throw new Error('ไฟล์ไม่มีข้อมูล')

  const headers = _parseCSVRow(lines[0])
  const mapping = {}
  headers.forEach((h, i) => { const f = _matchHeader(h); if (f) mapping[f] = i; })

  const rawRows = lines.slice(1).map(_parseCSVRow)

  const getVal = (row, field) => {
    const idx = mapping[field];
    if (idx==null||idx==='') return null;
    const v = row[idx]?.trim()||null;
    if (!v) return null;
    const lower = v.toLowerCase();
    if (lower==='(blank)'||lower==='blank'||v==='-') return null;
    return v;
  }

  const rows = rawRows
    .filter(row => row.some(c => c.trim()))
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
        exp:                 getVal(row,'exp')||'-',
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

  const { error: delErr } = await supabase.from('receive_logs').delete().gte('id', 0)
  if (delErr) throw delErr

  const CHUNK = 300
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: e } = await supabase.from('receive_logs').insert(rows.slice(i, i + CHUNK))
    if (e) throw e
    if (i + CHUNK < rows.length) await new Promise(r => setTimeout(r, 500))
  }
  return rows.length
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
