// ตัดสินว่าเครื่องนี้ควรเห็นปุ่ม "ติดตั้งแอป" แบบไหน (PWA — ติดตั้งจากเบราว์เซอร์ ไม่ผ่าน store)
// pure module: ไม่แตะ window → golden-testable (npm run test:installenv)
//
// คืน { show, mode }
//   show = false → ติดตั้งแล้ว (เปิดแบบเต็มจอ) หรือเป็นคอม (staff/admin ใช้คอม — ไม่รบกวน)
//   mode = 'prompt'  → Android/Chromium ที่เบราว์เซอร์ส่ง beforeinstallprompt มาแล้ว กดปุ่มเดียวติดตั้ง
//          'inapp'   → เปิดอยู่ในเบราว์เซอร์ของ LINE/Facebook/Instagram ติดตั้งไม่ได้ ต้องเปิดในเบราว์เซอร์ก่อน
//          'ios'     → iPhone/iPad เว็บติดตั้งเองไม่ได้ ต้องกดแชร์ → "เพิ่มไปยังหน้าจอโฮม"
//          'android' → Android ที่ยังไม่มี prompt (เบราว์เซอร์อื่น/Chrome ยังไม่พร้อม) → สอนผ่านเมนู ⋮
export function detectInstallEnv({ ua = '', standalone = false, maxTouchPoints = 0, hasPrompt = false } = {}) {
  if (standalone) return { show: false, mode: null };
  const isInApp = /\bLine\/|FBAN|FBAV|Instagram/i.test(ua);
  // iPadOS 13+ รายงานตัวเป็น Macintosh — แยกจาก Mac จริงด้วยจอสัมผัส
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  if (!isIOS && !isAndroid) return { show: false, mode: null };
  if (isInApp) return { show: true, mode: 'inapp' };
  if (isIOS) return { show: true, mode: 'ios' };
  return { show: true, mode: hasPrompt ? 'prompt' : 'android' };
}

// ลิงก์ให้ LINE เปิดหน้านี้ในเบราว์เซอร์ของเครื่อง (LINE รองรับพารามิเตอร์ openExternalBrowser=1)
export function externalBrowserUrl(href) {
  const u = new URL(href);
  u.searchParams.set('openExternalBrowser', '1');
  return u.toString();
}
