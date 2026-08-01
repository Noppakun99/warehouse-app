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
}
