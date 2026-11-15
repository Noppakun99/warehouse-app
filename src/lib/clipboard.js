// คัดลอกข้อความลงคลิปบอร์ด — navigator.clipboard ใช้ไม่ได้ (http / WebView ของ LINE บางรุ่น) → textarea + execCommand
// คืน true = คัดลอกได้ · ใช้ร่วม: ข้อความไลน์หน้า "ค้นยา · สรุปรับ-เบิก" (DrugUsageReport) + บัตรยา (DrugProfileModal)
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* ไปทางสำรอง */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}
