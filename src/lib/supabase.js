import { createClient } from '@supabase/supabase-js'

// อ่าน env ได้ทั้ง 2 ที่ — เบราว์เซอร์ผ่าน Vite, Node ผ่าน process.env (CLI นำเข้าข้อมูล/golden test)
//   `import.meta.env` ใน Node = undefined (ไม่ throw) → `??` พอ แต่ห้ามเขียน `import.meta.env.X` ตรงๆ
//   `process` ไม่มีในเบราว์เซอร์ (Vite ไม่ได้ define ให้) → ต้อง typeof guard
//   ไม่งั้น ReferenceError: process is not defined = จอขาวทั้งแอป
const env = import.meta.env ?? (typeof process !== 'undefined' ? process.env : {})

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars not set. Using local fallback data.')
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
