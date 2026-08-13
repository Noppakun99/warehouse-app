// เปิดหน้าพิมพ์จาก HTML string — helper กลางของทุก print view ในระบบ (Critical Rule #4)
//
// ทำไมต้องมี 2 ชั้น:
//   1. Blob URL ไม่ใช่ document.write() — document.write พังบน iOS Safari
//   2. fallback <a> click — in-app WebView (LINE/FB) บล็อก window.open('_blank') คืน null
//      ผู้ใช้ รพ. เปิดระบบผ่านลิงก์ใน LINE เป็นหลัก ถ้าไม่มี fallback = กดพิมพ์แล้วจอว่าง
//      (WebView ยอมให้ "คลิกลิงก์" แต่บล็อก popup — จึงสร้าง <a> แล้ว click แทน)

const REVOKE_MS = 30000;   // เผื่อเวลาให้หน้าต่างโหลด Blob เสร็จก่อนคืนหน่วยความจำ

/**
 * @param {string} html  HTML เต็มหน้า (รวม <!DOCTYPE>)
 * @param {Window|null} [preopenedWin]  หน้าต่างที่เปิดไว้ตอน user คลิก (กัน popup blocker
 *   ที่บล็อก window.open ใน async callback) — ถ้ามีจะ redirect หน้าต่างนั้นแทนเปิดใหม่
 * @returns {Window|null} หน้าต่างที่เปิด (null = ใช้ fallback <a>)
 */
export function openPrintView(html, preopenedWin) {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const revoke = () => setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);

  if (preopenedWin && !preopenedWin.closed) {
    preopenedWin.location.href = url;
    revoke();
    return preopenedWin;
  }

  const win = window.open(url, '_blank');
  if (win) { revoke(); return win; }

  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  revoke();
  return null;
}
