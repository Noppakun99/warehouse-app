/**
 * Requisition tests
 * ใช้ authenticatedPage (worker scope) + waitForSupabase แทน waitForTimeout
 */
import { test, expect, waitForSupabase } from './fixtures.js';

test.describe('ระบบเบิกยา (Requisition)', () => {
  // navigate ไปหน้าเบิกยาก่อนแต่ละ test
  async function goToSearch(page) {
    await page.goto('/');
    await page.getByText('ระบบเบิกยาออนไลน์').click();
    await page.waitForSelector('text=ค้นหายาในคลัง', { timeout: 8_000 });
  }

  test('ค้นหายาแล้วเห็นผลลัพธ์', async ({ authenticatedPage: page }) => {
    await goToSearch(page);
    // waitForSupabase แทน waitForTimeout — รอ network จริง
    const res = waitForSupabase(page, { table: 'inventory' });
    await page.getByPlaceholder('ชื่อยาหรือรหัสยา...').fill('para');
    await res;
    await expect(
      page.getByText(/Acetaminophen|Paracetamol/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });

  test('เพิ่มยาเข้าตะกร้าและเห็น badge จำนวน', async ({ authenticatedPage: page }) => {
    await goToSearch(page);
    const res = waitForSupabase(page, { table: 'inventory' });
    await page.getByPlaceholder('ชื่อยาหรือรหัสยา...').fill('para');
    await res;

    const firstDrug = page.getByText(/Acetaminophen|Paracetamol/i).first();
    await firstDrug.waitFor({ timeout: 8_000 });
    await firstDrug.click();

    const addBtn = page.getByRole('button', { name: /เพิ่มเข้าตะกร้า/i }).first();
    await addBtn.waitFor({ timeout: 5_000 });
    await addBtn.click();

    await expect(page.locator('.bg-red-500').filter({ hasText: /\d+/ })).toBeVisible({ timeout: 5_000 });
  });

  test('ส่งใบเบิกสำเร็จและเห็น modal ยืนยัน', async ({ authenticatedPage: page }) => {
    await goToSearch(page);
    const res = waitForSupabase(page, { table: 'inventory' });
    await page.getByPlaceholder('ชื่อยาหรือรหัสยา...').fill('para');
    await res;

    const firstDrug = page.getByText(/Acetaminophen|Paracetamol/i).first();
    await firstDrug.waitFor({ timeout: 8_000 });
    await firstDrug.click();

    const addBtn = page.getByRole('button', { name: /เพิ่มเข้าตะกร้า/i }).first();
    await addBtn.waitFor({ timeout: 5_000 });
    await addBtn.click();

    // ไปหน้าตะกร้า — floating cart button "ตะกร้ายา"
    await page.getByRole('button', { name: 'ตะกร้ายา' }).click();
    await page.waitForSelector('text=ส่งใบเบิก', { timeout: 5_000 });

    // รอ Supabase insert ก่อนตรวจ modal
    const submitRes = waitForSupabase(page, { table: 'requisitions', method: 'POST' });
    await page.getByRole('button', { name: /ส่งใบเบิก/i }).click();
    await submitRes;
    await expect(page.getByText('ส่งใบเบิกสำเร็จ')).toBeVisible({ timeout: 10_000 });
  });

  test('ดูประวัติใบเบิกได้', async ({ authenticatedPage: page }) => {
    await goToSearch(page);
    await page.getByRole('button', { name: /ประวัติ/i }).first().click();
    await expect(
      page.getByText(/ประวัติ|ใบเบิก|ไม่พบ/i).first()
    ).toBeVisible({ timeout: 8_000 });
  });
});
