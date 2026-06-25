/**
 * ReturnApp tests — UI ใหม่ (2026-06): SearchableSelect แหล่งที่คืน + lot dropdown + print/PDF
 * ใช้ authenticatedPage (worker scope) + waitForSupabase แทน waitForTimeout
 */
import { test, expect, waitForSupabase } from './fixtures.js';

test.describe('ระบบคืนยา (ReturnApp)', () => {
  async function goToReturn(page) {
    await page.goto('/');
    // sidebar nav (navConfig) — title 'คืนยา / ยาเสียหาย'
    await page.getByText('คืนยา / ยาเสียหาย').first().click();
    await page.waitForSelector('text=แหล่งที่คืน', { timeout: 8_000 });
  }

  test('แสดงแท็บบันทึกรายการและประวัติ', async ({ authenticatedPage: page }) => {
    await goToReturn(page);
    await expect(page.getByRole('button', { name: 'บันทึกรายการ' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'ประวัติ' }).first()).toBeVisible();
  });

  test('แสดง 3 ขั้นตอนของฟอร์ม + dropdown แหล่งที่คืน', async ({ authenticatedPage: page }) => {
    await goToReturn(page);
    await expect(page.getByText('แหล่งที่คืน & สาเหตุ')).toBeVisible();
    await expect(page.getByText('ข้อมูลยา')).toBeVisible();
    await expect(page.getByText('ผู้คืน / ผู้รับ')).toBeVisible();
    await expect(page.getByPlaceholder('-- เลือกหน่วยงาน / แหล่งที่คืน --')).toBeVisible();
  });

  test('เลือกหน่วยงานแล้วแสดง badge กลุ่ม source ที่ derive ได้', async ({ authenticatedPage: page }) => {
    await goToReturn(page);
    await page.getByPlaceholder('-- เลือกหน่วยงาน / แหล่งที่คืน --').click();
    await page.getByText('ER (ฉุกเฉิน)').first().click();
    // deptToSource: ER → er → badge short 'ER'
    await expect(page.getByText('จัดเป็นกลุ่ม')).toBeVisible();
  });

  test('บันทึกการคืนยาสำเร็จ', async ({ authenticatedPage: page }) => {
    await goToReturn(page);

    // เลือกหน่วยงานก่อน (เพื่อปลดล็อก dropdown สาเหตุ + ผ่าน validation)
    await page.getByPlaceholder('-- เลือกหน่วยงาน / แหล่งที่คืน --').click();
    await page.getByText('ห้องยา G').first().click();

    // ค้นหาชื่อยา — รอ inventory response แทน timeout
    const inventoryRes = waitForSupabase(page, { table: 'inventory' });
    await page.getByPlaceholder('พิมพ์เพื่อค้นหายาในคลัง...').fill('Para');
    await inventoryRes.catch(() => {}); // inventory อาจ cache อยู่แล้ว

    const dropdown = page.getByText(/Acetaminophen|Paracetamol/i).first();
    const hasDropdown = await dropdown.isVisible().catch(() => false);
    if (hasDropdown) await dropdown.click();
    else await page.getByPlaceholder('พิมพ์เพื่อค้นหายาในคลัง...').fill('ยาทดสอบ');

    await page.getByPlaceholder('0').fill('1');

    // รอ Supabase insert ก่อนตรวจ banner — ปุ่ม submit ชื่อ 'บันทึกการคืนยา'
    const insertRes = waitForSupabase(page, { table: 'return_logs', method: 'POST' });
    await page.getByRole('button', { name: 'บันทึกการคืนยา' }).click();
    await insertRes;
    await expect(page.getByText('บันทึกการคืนยาสำเร็จ')).toBeVisible({ timeout: 10_000 });
  });

  test('หลัง submit มีปุ่มพิมพ์ / PDF', async ({ authenticatedPage: page }) => {
    await goToReturn(page);

    await page.getByPlaceholder('-- เลือกหน่วยงาน / แหล่งที่คืน --').click();
    await page.getByText('ห้องยา G').first().click();

    const inventoryRes = waitForSupabase(page, { table: 'inventory' });
    await page.getByPlaceholder('พิมพ์เพื่อค้นหายาในคลัง...').fill('Para');
    await inventoryRes.catch(() => {});

    const dropdown = page.getByText(/Acetaminophen|Paracetamol/i).first();
    const hasDropdown = await dropdown.isVisible().catch(() => false);
    if (hasDropdown) await dropdown.click();
    else await page.getByPlaceholder('พิมพ์เพื่อค้นหายาในคลัง...').fill('ยาทดสอบ');

    await page.getByPlaceholder('0').fill('1');

    const insertRes = waitForSupabase(page, { table: 'return_logs', method: 'POST' });
    await page.getByRole('button', { name: 'บันทึกการคืนยา' }).click();
    await insertRes;
    await page.waitForSelector('text=บันทึกการคืนยาสำเร็จ', { timeout: 10_000 });

    await expect(page.getByRole('button', { name: /พิมพ์ \/ PDF/i })).toBeVisible();
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
