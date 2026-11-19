/**
 * Dashboard tests
 * ใช้ authenticatedPage (worker scope) → login ครั้งเดียว ทุก test reuse
 */
import { test, expect } from './fixtures.js';
import { dismissStartupPopup } from './helpers/auth.js';

// การ์ดเลือกระบบถูกตัดออกจาก Dashboard แล้ว (commit 2b16aef — ใช้ sidebar แทน)
// → เข้าระบบย่อยผ่านเมนู sidebar (ชื่อตาม navConfig ไม่มีคำว่า "ระบบ" นำหน้า)
const menu = (page, name) => page.getByRole('button', { name, exact: true });

test.describe('Dashboard', () => {
  test('เห็นเมนูระบบใน sidebar หลังล็อกอิน', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await expect(menu(page, 'เบิกยาออนไลน์')).toBeVisible({ timeout: 8_000 });
    await expect(menu(page, 'คืนยา / ยาเสียหาย')).toBeVisible();
  });

  // authenticatedPage = requester → ภาพรวมคลังพับไว้ (แผน Dashboard §11.1 ข้อ 16) ต้องกางก่อน
  test('ภาพรวมคลัง (พับไว้) กางแล้วเห็นตัวเลขรายการยาในคลัง', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await expect(page.getByText('รายการยาในคลัง')).toBeHidden();
    await page.getByRole('button', { name: /ภาพรวมคลัง/ }).click();
    await expect(page.getByText('รายการยาในคลัง')).toBeVisible({ timeout: 8_000 });
  });

  test('คลิกเมนูเบิกยาไปหน้าเบิกยาได้', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await menu(page, 'เบิกยาออนไลน์').click();
    // ผู้เบิกเลือกประเภทใบเบิกก่อน แล้วจึงถึงหน้าค้นหายา
    await expect(page.getByText('เลือกประเภทใบเบิก')).toBeVisible({ timeout: 8_000 });
  });

  test('คลิกเมนูคืนยาไปหน้าคืนยาได้', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await menu(page, 'คืนยา / ยาเสียหาย').click();
    await expect(page.getByText('ระบบคืนยา / บันทึกยาเสียหาย')).toBeVisible({ timeout: 8_000 });
  });

  test('ปุ่มย้อนกลับจากระบบย่อยกลับ Dashboard ได้', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await menu(page, 'คืนยา / ยาเสียหาย').click();
    await page.waitForSelector('text=บันทึกรายการ', { timeout: 8_000 });
    await page.getByRole('button').filter({ has: page.locator('svg') }).first().click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible({ timeout: 5_000 });
  });

  // ช่องค้นหารวม → เลข PO (เทียบลำดับ+ปี ไม่ติด 886.05/686.05) → หน้าประวัติรับยาค้นเลขนั้นให้เลย · อ่านอย่างเดียว
  // ข้อมูลจริง: PO 086.05/2570 = บิล IV6911583 (รับ 19/11/2569)
  test('ค้นเลข PO จากช่องค้นหารวม → เปิดประวัติรับยาพร้อมคำค้น', async ({ authenticatedPage: page }) => {
    await page.goto('/');
    await dismissStartupPopup(page);
    await page.keyboard.press('Control+k');
    await page.getByLabel('ค้นหายาหรือเมนู').fill('86.05/2570');
    const hit = page.getByRole('button', { name: /บิล IV6911583 · PO 086\.05\/2570/ });
    await expect(hit).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /PO 886\.05|PO 686\.05/ })).toHaveCount(0);
    await hit.click();
    await expect(page.locator('input[value="086.05/2570"]')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('IV6911583').first()).toBeVisible({ timeout: 15_000 });
  });
});
