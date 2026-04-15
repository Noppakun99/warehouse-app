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
import { test, expect } from './fixtures.js';

/** รอ Dashboard โหลดหลัง sessionStorage restore */
async function waitForDashboard(page) {
  await page.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
}

// ── requester tests ───────────────────────────────────────────────────────────
test.describe('Permissions — requester', () => {

  test('requester ไม่เห็นการ์ด วิเคราะห์การเบิกยา', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('วิเคราะห์การเบิกยา')).not.toBeVisible();
  });

  test('requester ไม่เห็นการ์ด จัดการผู้ใช้งาน', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('จัดการผู้ใช้งาน')).not.toBeVisible();
  });

  test('requester เห็นการ์ด ระบบเบิกยาออนไลน์', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('ระบบเบิกยาออนไลน์')).toBeVisible({ timeout: 5_000 });
  });

  test('requester เห็นการ์ด ระบบคืนยา / ยาเสียหาย', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('ระบบคืนยา / ยาเสียหาย')).toBeVisible({ timeout: 5_000 });
  });

  test('requester เห็น StatsStrip 2 card (ไม่มี expiry/low-stock)', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('รายการยาในคลัง')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('ใบเบิกรอดำเนินการ')).toBeVisible({ timeout: 5_000 });
    // requester ไม่เห็น expiry/low-stock card
    await expect(page.getByText('ยาใกล้หมดอายุ')).not.toBeVisible();
    await expect(page.getByText('Stock ต่ำกว่ากำหนด')).not.toBeVisible();
  });
});

// ── staff tests (skip ถ้า account ไม่มีใน DB — staffPage fixture จะ use(null)) ──
test.describe('Permissions — staff', () => {

  test('staff เห็นการ์ด วิเคราะห์การเบิกยา', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('วิเคราะห์การเบิกยา')).toBeVisible({ timeout: 5_000 });
  });

  test('staff ไม่เห็นการ์ด จัดการผู้ใช้งาน', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('จัดการผู้ใช้งาน')).not.toBeVisible();
  });

  test('staff เข้าหน้า วิเคราะห์การเบิกยา ได้', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await page.getByText('วิเคราะห์การเบิกยา').click();
    await expect(
      page.getByText(/วิเคราะห์|ช่วงเวลา|แนวโน้ม/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test('staff เห็น StatsStrip ครบ 4 card', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.goto('/');
    await waitForDashboard(page);
    await expect(page.getByText('รายการยาในคลัง')).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText('ใบเบิกรอดำเนินการ')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('ยาใกล้หมดอายุ')).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText('Stock ต่ำกว่ากำหนด')).toBeVisible({ timeout: 5_000 });
  });
});
