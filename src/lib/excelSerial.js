// excelSerial.js — แปลง Excel serial → วันที่ (pure — ใช้ได้ทั้ง CLI และเบราว์เซอร์)
// ย้ายมาจาก scripts/_shared.mjs (ไฟล์นั้น import fs เบราว์เซอร์ใช้ไม่ได้) — _shared re-export ต่อ

/** Excel serial → "DD/MM/YYYY" (ใช้กับชีทที่เก็บวันที่เป็นตัวเลข)
 *  แปลง พ.ศ. → ค.ศ. เฉพาะช่วง 2500–2600 (คนพิมพ์ปี พ.ศ. ลงช่องวันที่) */
export function serialToThai(n) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 1 || n > 300000) return null
  // Math.floor ไม่ใช่ round — serial ที่มีเศษคือ "เวลา" ของวันนั้น (46202.58 = 29 มิ.ย. 13:54)
  // round จะปัดเศษ >= 0.5 ขึ้นเป็นวันถัดไป (ชีทเบิกมี 1,316 แถวที่เพี้ยนแบบนี้ — เจอ 2026-09-21)
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000)
  if (isNaN(d)) return null
  let y = d.getUTCFullYear()
  if (y >= 2500 && y <= 2600) y -= 543
  if (y < 1990 || y > 2100) return null
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${y}`
}
