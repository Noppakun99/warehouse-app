/**
 * ReturnApp tests
 * ใช้ authenticatedPage (worker scope) + waitForSupabase แทน waitForTimeout
 */
import { test, expect, waitForSupabase } from './fixtures.js';

test.describe('ระบบคืนยา (ReturnApp)', () => {
  async function goToReturn(page) {
    await page.goto('/');
    await page.getByText('ระบบคืนยา / ยาเสียหาย').click();
    await page.waitForSelector('text=ประเภทการคืน / บันทึก', { timeout: 8_000 });
  }

  test('แสดงแท็บบันทึกรายการและประวัติ', async ({ authenticatedPage: page }) => {
    await goToReturn(page);
    await expect(page.getByRole('button', { name: 'บันทึกรายการ' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'ประวัติ' }).first()).toBeVisible();
  });

  test('แสดงปุ่มประเภทการคืนครบ 4 ประเภท', async ({ authenticatedPage: page }) => {
    await goToReturn(page);
    await expect(page.getByRole('button', { name: 'คืนยาจาก Ward' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ยาเสียหาย/แตกหัก' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ตัดยาหมดอายุออก' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ส่งคืนบริษัทยา' })).toBeVisible();
  });

  test('บันทึกการคืนยาสำเร็จ', async ({ authenticatedPage: page }) => {
    await goToReturn(page);
    await page.getByRole('button', { name: 'คืนยาจาก Ward' }).click();

    // ค้นหาชื่อยา — รอ inventory response แทน timeout
    const inventoryRes = waitForSupabase(page, { table: 'inventory' });
    await page.getByPlaceholder('พิมพ์ชื่อยา...').fill('Para');
    await inventoryRes;

    const dropdown = page.getByText(/Acetaminophen|Paracetamol/i).first();
    const hasDropdown = await dropdown.isVisible().catch(() => false);
    if (hasDropdown) await dropdown.click();

    await page.getByPlaceholder('0').fill('1');

    // SearchableSelect ใช้ placeholder attribute
    await page.getByPlaceholder('-- เลือกหน่วยงาน --').click();
    await page.getByText('ห้องยา G').first().click();

    // รอ Supabase insert ก่อนตรวจ banner
    const insertRes = waitForSupabase(page, { table: 'return_logs', method: 'POST' });
    await page.getByRole('button', { name: 'บันทึกรายการ' }).last().click();
    await insertRes;
    await expect(page.getByText('บันทึกสำเร็จ')).toBeVisible({ timeout: 10_000 });
  });

  test('หลัง submit มีปุ่มพิมพ์ใบคืนยา', async ({ authenticatedPage: page }) => {
    await goToReturn(page);

    const inventoryRes = waitForSupabase(page, { table: 'inventory' });
    await page.getByPlaceholder('พิมพ์ชื่อยา...').fill('Para');
    await inventoryRes;

    const dropdown = page.getByText(/Acetaminophen|Paracetamol/i).first();
    const hasDropdown = await dropdown.isVisible().catch(() => false);
    if (hasDropdown) await dropdown.click();

    await page.getByPlaceholder('0').fill('1');
    await page.getByPlaceholder('-- เลือกหน่วยงาน --').click();
    await page.getByText('ห้องยา G').first().click();

    const insertRes = waitForSupabase(page, { table: 'return_logs', method: 'POST' });
    await page.getByRole('button', { name: 'บันทึกรายการ' }).last().click();
    await insertRes;
    await page.waitForSelector('text=บันทึกสำเร็จ', { timeout: 10_000 });

    await expect(page.getByRole('button', { name: /พิมพ์ใบคืนยา/i })).toBeVisible();
  });

  test('ดูประวัติการคืนยาได้', async ({ authenticatedPage: page }) => {
    await goToReturn(page);
    await page.getByRole('button', { name: 'ประวัติ' }).first().click();
    // รอ return_logs query
    await page.waitForResponse(
      r => r.url().includes('return_logs') && r.status() < 400,
      { timeout: 8_000 }
    ).catch(() => {}); // ถ้า cache อยู่แล้วไม่มี request ก็ไม่เป็นไร
    await expect(
      page.getByText(/ไม่พบข้อมูล|รายการ/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
