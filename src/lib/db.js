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

// --- Drug Details ---

export async function fetchDrugDetails() {
  if (!supabase) return null

  const { data, error } = await supabase
    .from('drug_details')
    .select('*')

  if (error) throw error
  if (!data || data.length === 0) return null

  // แปลง flat rows → object keyed by detail_key
  const result = {}
  data.forEach(row => {
    result[row.detail_key] = {
      _code: row.code,
      _name: row.name,
      _lot: row.lot,
      _invoice: row.invoice,
      ...(row.data || {}),
    }
  })
  return result
}

export async function saveDrugDetails(drugDetailsObj) {
  if (!supabase) throw new Error('Supabase not configured')

  const rows = Object.entries(drugDetailsObj).map(([key, value]) => {
    const { _code, _name, _lot, _invoice, _company, _drug_swap_policy, _drug_type, ...rest } = value
    return {
      detail_key: key,
      code: _code,
      name: _name,
      lot: _lot,
      invoice: _invoice,
      company: _company || null,
      drug_swap_policy: _drug_swap_policy || null,
      drug_type: _drug_type || null,
      data: rest,
      updated_at: new Date().toISOString(),
    }
  })

  // ลบข้อมูลเก่าทั้งหมด แล้ว insert ใหม่
  const { error: delError } = await supabase
    .from('drug_details')
    .delete()
    .gte('id', 0)
  if (delError) throw delError

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const { error } = await supabase
      .from('drug_details')
      .insert(rows.slice(i, i + CHUNK_SIZE))
    if (error) throw error
  }
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
