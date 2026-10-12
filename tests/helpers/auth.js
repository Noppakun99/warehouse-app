// Helper: login ด้วย username + password
// requester: test/111111 (default)  |  staff/admin: Kao_9/96409999
export async function login(page, username = 'test', password = '111111') {
  await page.goto('/');
  await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill(username);
  await page.getByPlaceholder('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await waitForAppShell(page);
}

// รอจน AppShell render = login สำเร็จ
// (เดิมรอ text "สวัสดี," ซึ่งถูกแทนด้วยหัวข้อ "Dashboard" ตอน redesign top bar → test ทั้ง repo พัง
//  ตอนนี้ผูกกับ landmark ของ shell แทนข้อความบนหน้า: ปุ่ม "หน้าหลัก" ใน sidebar (desktop)
//  หรือปุ่ม hamburger "เปิดเมนู" (จอ < lg ที่ sidebar ถูกซ่อน) — อันไหนมาก่อนก็ได้)
export async function waitForAppShell(page, timeout = 15_000) {
  await page
    .getByRole('button', { name: 'หน้าหลัก' })
    .or(page.getByRole('button', { name: 'เปิดเมนู' }))
    .first()
    .waitFor({ state: 'visible', timeout });
  await dismissStartupPopup(page);
}

// popup "ยาต้องเปลี่ยน/คืนบริษัท" / "ยาหมดอายุค้างคลัง" ของ staff/admin เด้ง "เฉพาะ lot ที่คนนั้นยังไม่เคยเห็น
// วันละครั้ง" (จำใน localStorage — Dashboard Phase 1) → context ใหม่ของ Playwright เด้งครั้งแรกเสมอ
// บังทั้ง sidebar และหน้าหลัก ทำให้ assertion อ่านสถานะผิด ต้องปิดก่อน (ไม่เด้ง = ผ่านไปเฉยๆ)
export async function dismissStartupPopup(page, appearTimeout = 4_000) {
  const ack = page.getByRole('button', { name: 'รับทราบ' }).first();
  // popup โผล่หลังโหลดข้อมูลเสร็จ → รอสั้นๆ ให้มันปรากฏก่อน (ถ้าไม่มีก็ผ่านไปเลย)
  await ack.waitFor({ state: 'visible', timeout: appearTimeout }).catch(() => {});
  for (let i = 0; i < 3; i++) {
    if (!(await ack.isVisible().catch(() => false))) return;
    await ack.click({ force: true }).catch(() => {});
    await page.waitForTimeout(500);
  }
}
