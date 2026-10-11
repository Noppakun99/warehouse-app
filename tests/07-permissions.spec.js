/**
 * Permissions / Role-based Access tests
 *
 * requester (username='test')  → ไม่เห็น analytics, ไม่เห็น จัดการผู้ใช้
 * staff    (username='staff')  → เห็น analytics, ไม่เห็น จัดการผู้ใช้
 *
 * staff tests: สร้าง account role=staff ก่อนแล้วระบุผ่าน env
 *   TEST_STAFF_USER=staff TEST_STAFF_PASS=444444 npx playwright test
 *   ถ้าไม่มี account → tests จะ skip อัตโนมัติ
 */
import { test, expect, waitForAppShell } from './fixtures.js';

/** รอ Dashboard โหลดหลัง sessionStorage restore */
async function waitForDashboard(page) {
  await waitForAppShell(page);
}

// การ์ดเลือกระบบบน Dashboard ถูกตัดออกแล้ว (commit 2b16aef — ใช้ sidebar แทน)
// → เช็คสิทธิ์ที่ "เมนูใน sidebar" แทน (ชื่อเมนูตาม navConfig ไม่มีคำว่า "ระบบ" นำหน้า)
const menu = (page, name) => page.getByRole('button', { name, exact: true });

// ── requester tests ───────────────────────────────────────────────────────────
test.describe('Permissions — requester', () => {

  // navConfig ให้ 'analytics' กับ requester ด้วย (roles: requester/staff/admin)
  // → requester "เห็น" เมนูวิเคราะห์การเบิก เป็นพฤติกรรมที่ถูกต้องตามคอนฟิกปัจจุบัน
  test('requester เห็นเมนู วิเคราะห์การเบิก (ตาม navConfig)', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(menu(page, 'วิเคราะห์การเบิก')).toBeVisible({ timeout: 5_000 });
  });

  test('requester ไม่เห็นการ์ด จัดการผู้ใช้งาน', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(menu(page, 'จัดการผู้ใช้งาน')).not.toBeVisible();
  });

  test('requester เห็นการ์ด ระบบเบิกยาออนไลน์', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(menu(page, 'เบิกยาออนไลน์')).toBeVisible({ timeout: 5_000 });
  });

  test('requester เห็นการ์ด ระบบคืนยา / ยาเสียหาย', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(menu(page, 'คืนยา / ยาเสียหาย')).toBeVisible({ timeout: 5_000 });
  });

  // Dashboard ใหม่ (แผน §11.1 ข้อ 16, 21): requester ไม่มีคิวงาน · ภาพรวม 3 ตัวเลขพับไว้ล่างสุด
  // (การ์ด "ใบเบิกรอดำเนินการ" ตัดออกแล้ว — เป็น 0 ตลอด)
  test('requester ไม่มีคิวงาน + ภาพรวมคลังครบ 3 ตัวเลข (กางก่อน)', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await page.getByRole('button', { name: /ภาพรวมคลัง/ }).click();
    await expect(page.getByText('รายการยาในคลัง')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('ใกล้หมดอายุใน 16 เดือน')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('ต่ำกว่า Safety Stock')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('คิวงานวันนี้')).toHaveCount(0);
  });
});

// ── staff tests (skip ถ้า account ไม่มีใน DB — staffPage fixture จะ use(null)) ──
test.describe('Permissions — staff', () => {

  test('staff เห็นการ์ด วิเคราะห์การเบิกยา', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await menu(page, 'วิเคราะห์').click(); // staff: อยู่ใต้เมนูแม่ "วิเคราะห์" (ผู้เบิกเห็นข้อเดียว = ไม่มีเมนูแม่)
    await expect(menu(page, 'วิเคราะห์การเบิก')).toBeVisible({ timeout: 5_000 });
  });

  // ต้องใช้ account role=staff จริงเท่านั้น — staffPage ปัจจุบันคือ Kao_9 (admin) ซึ่งเห็นเมนูนี้โดยถูกต้อง
  // ปลดล็อกได้เมื่อมี account staff ที่ login ผ่าน: TEST_STAFF_USER=<staff> TEST_STAFF_PASS=<pass>
  test('staff ไม่เห็นเมนู จัดการผู้ใช้งาน', async ({ staffPage: page }) => {
    test.skip(!process.env.TEST_STAFF_USER, 'ต้องระบุ account role=staff ผ่าน env (default คือ admin)');
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    // admin เห็นเมนูแม่ "ตั้งค่าและดูแลระบบ" (กางแล้วมีจัดการผู้ใช้งาน) · staff เห็นแค่ Audit Log ข้อเดียว (ไม่มีเมนูแม่)
    const sys = menu(page, 'ตั้งค่าและดูแลระบบ');
    if (await sys.isVisible().catch(() => false)) await sys.click();
    await expect(menu(page, 'จัดการผู้ใช้งาน')).not.toBeVisible();
  });

  test('staff เข้าหน้า วิเคราะห์การเบิกยา ได้', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await menu(page, 'วิเคราะห์').click();
    await menu(page, 'วิเคราะห์การเบิก').click();
    await expect(
      page.getByText(/วิเคราะห์|ช่วงเวลา|แนวโน้ม/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  // จอคอม (Desktop Chrome ≥ lg): คิวงาน + ภาพรวมกางเสมอ
  test('staff เห็นคิวงานวันนี้ + ภาพรวมคลังครบ 3 ตัวเลข', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('คิวงานวันนี้')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('รายการยาในคลัง')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('ใกล้หมดอายุใน 16 เดือน')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('ต่ำกว่า Safety Stock')).toBeVisible({ timeout: 5_000 });
  });
});
