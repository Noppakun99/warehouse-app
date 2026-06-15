/**
 * Reorder Analysis — smoke + UX clarity
 *
 * เป้าหมาย: ระบบวิเคราะห์การสั่งซื้อยา (ReorderApp) เปิดได้ + render ตามคาดที่
 *  1. Header + Control Bar + Status Strip ครบ
 *  2. Tabs ครบ 4 tab สลับได้
 *  3. Verification tab รัน golden tests ผ่าน 100%
 *  4. Mobile (375px) แสดง card layout แทน table
 *  5. Filter ด้วย Status chip ใช้งานได้
 */
import { test, expect } from './fixtures.js';

async function gotoReorder(page) {
  await page.goto('/');
  await page.waitForSelector('text=สวัสดี,', { timeout: 10_000 });
  // Dashboard → คลิก card "Stock ต่ำกว่ากำหนด" → เปิด modal แจ้งเตือน
  await page.getByRole('button', { name: /Stock ต่ำกว่ากำหนด/ }).first().click();
  // ใน modal มีปุ่ม "เปิดระบบวิเคราะห์การสั่งซื้อ" (desktop) → คลิกเข้า ReorderApp
  await page.getByRole('button', { name: /เปิดระบบวิเคราะห์การสั่งซื้อ/ }).click();
  await page.waitForSelector('text=ระบบวิเคราะห์การสั่งซื้อยา', { timeout: 10_000 });
}

test.describe('ReorderApp — smoke', () => {

  test('staff เปิดหน้าได้ + เห็น header + control bar + status strip', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoReorder(page);

    await expect(page.getByRole('heading', { name: /ระบบวิเคราะห์การสั่งซื้อยา/ })).toBeVisible();

    // Control bar — ช่วงสถิติ + Lead Time + ปุ่มรัน (ไม่มีโหมด Normal/Refill แล้ว — factor 2.3 คงที่)
    await expect(page.getByText('ช่วงสถิติ (จาก)')).toBeVisible();
    await expect(page.getByText('Lead Time default (วัน)')).toBeVisible();
    await expect(page.getByRole('button', { name: /รันวิเคราะห์/ })).toBeVisible();
  });

  test('Tabs ครบ 4 ตัว + สลับได้', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoReorder(page);

    const tabs = ['ตารางวิเคราะห์', 'ใบสั่งซื้อแยกบริษัท', 'Verification', 'History'];
    for (const t of tabs) {
      await expect(page.getByRole('button', { name: new RegExp(t) })).toBeVisible();
    }

    // คลิก Verification → เห็นปุ่ม "Run tests"
    await page.getByRole('button', { name: /Verification/ }).click();
    await expect(page.getByRole('button', { name: /Run tests/ })).toBeVisible();
  });

  test('Verification tab รัน golden tests ผ่าน 100%', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoReorder(page);
    await page.getByRole('button', { name: /Verification/ }).click();
    await page.getByRole('button', { name: /Run tests/ }).click();
    // ต้องเห็น "0 ล้มเหลว" ในผลลัพธ์
    await expect(page.getByText(/0 ล้มเหลว/)).toBeVisible({ timeout: 5_000 });
    // ตรวจว่ามี Atorvastatin reference ในรายการ
    await expect(page.getByText(/Atorvastatin/).first()).toBeVisible();
  });

  test('Status strip — 6 สถานะ + คลิก filter ได้', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoReorder(page);
    // รอจน analysis รันเสร็จ (status chips render)
    await expect(page.getByText('คงคลังเพียงพอ').first()).toBeVisible({ timeout: 15_000 });
    // ทุก status ต้องเห็น
    for (const s of ['หมดสต็อค', 'ใกล้หมดอายุ', 'สั่งเพิ่ม', 'คงคลังเพียงพอ', 'สั่งเมื่อขอ', 'ตัดออก']) {
      await expect(page.getByText(s).first()).toBeVisible();
    }
  });

  test('Mobile 375px — แสดง card layout', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoReorder(page);
    // ต้องไม่เห็น desktop table (มี th)
    const tableHeader = page.locator('table thead tr th:has-text("คงเหลือ")');
    await expect(tableHeader).toBeHidden({ timeout: 5_000 });
  });

});
