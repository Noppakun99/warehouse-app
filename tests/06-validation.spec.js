/**
 * Form Validation tests
 * ทดสอบ error message ที่แสดงเมื่อ submit form ที่ไม่ครบ
 * ใช้ authenticatedPage (requester) — ไม่ต้องการ staff
 *
 * หมายเหตุ HTML5 required:
 *   ช่อง drug_name และ qty_returned มี `required` attribute
 *   → submit ขณะ empty ถูก block โดย browser (JS error ไม่แสดง)
 *   → ต้องกรอก qty='0' เพื่อทดสอบ JS validation (ผ่าน HTML5 แต่ fail JS)
 */
import { test, expect } from './fixtures.js';

test.describe('Form Validation', () => {

  // ── ReturnApp validation ──────────────────────────────────────────────────
  test.describe('ReturnApp', () => {
    async function goToReturn(page) {
      await page.goto('/');
      await page.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
      await page.getByText('ระบบคืนยา / ยาเสียหาย').click();
      await page.waitForSelector('text=ประเภทการคืน / บันทึก', { timeout: 8_000 });
    }

    test('submit โดยไม่กรอกชื่อยา → form ไม่ submit (HTML5 required)', async ({ authenticatedPage: page }) => {
      await goToReturn(page);
      // ไม่กรอกอะไร — drug_name มี `required` → HTML5 block ไม่ให้ submit
      // ตรวจว่า input invalid (valueMissing = true)
      const nameInput = page.getByPlaceholder('พิมพ์ชื่อยา...');
      const isInvalid = await nameInput.evaluate(el => !el.validity.valid);
      expect(isInvalid).toBe(true);
      // กด submit → success message ไม่แสดง
      await page.getByRole('button', { name: 'บันทึกรายการ' }).last().click();
      await expect(page.getByText('บันทึกสำเร็จ')).not.toBeVisible({ timeout: 2_000 });
    });

    test('qty = 0 → HTML5 min block (ไม่ submit)', async ({ authenticatedPage: page }) => {
      await goToReturn(page);
      // qty input มี min="0.01" → value '0' ไม่ผ่าน HTML5 → browser block
      await page.getByPlaceholder('พิมพ์ชื่อยา...').fill('TestDrug');
      await page.getByPlaceholder('0').fill('0');
      const qtyInput = page.getByPlaceholder('0');
      const isInvalid = await qtyInput.evaluate(el => !el.validity.valid);
      expect(isInvalid).toBe(true);
      // form ไม่ submit → ไม่เห็น success
      await page.getByRole('button', { name: 'บันทึกรายการ' }).last().click();
      await expect(page.getByText('บันทึกสำเร็จ')).not.toBeVisible({ timeout: 2_000 });
    });

    test('ward_return ไม่เลือกหน่วยงาน → error "กรุณาเลือกหน่วยงานที่คืน"', async ({ authenticatedPage: page }) => {
      await goToReturn(page);
      await page.getByRole('button', { name: 'คืนยาจาก Ward' }).click();
      await page.getByPlaceholder('พิมพ์ชื่อยา...').fill('TestDrug');
      await page.getByPlaceholder('0').fill('1');
      // ไม่เลือก ward → submit → JS error
      await page.getByRole('button', { name: 'บันทึกรายการ' }).last().click();
      await expect(page.getByText('กรุณาเลือกหน่วยงานที่คืน')).toBeVisible({ timeout: 5_000 });
    });

    test('error หายไปหลังเพิ่ม department ที่ขาด', async ({ authenticatedPage: page }) => {
      await goToReturn(page);
      // ward_return + drug_name + qty=1 แต่ไม่เลือก dept → error
      await page.getByRole('button', { name: 'คืนยาจาก Ward' }).click();
      await page.getByPlaceholder('พิมพ์ชื่อยา...').fill('TestDrug');
      await page.getByPlaceholder('0').fill('1');
      await page.getByRole('button', { name: 'บันทึกรายการ' }).last().click();
      await expect(page.getByText('กรุณาเลือกหน่วยงานที่คืน')).toBeVisible({ timeout: 5_000 });
      // เลือก dept → กด submit → error หายไป
      await page.getByPlaceholder('-- เลือกหน่วยงาน --').click();
      await page.getByText('ห้องยา G').first().click();
      await page.getByRole('button', { name: 'บันทึกรายการ' }).last().click();
      await expect(page.getByText('กรุณาเลือกหน่วยงานที่คืน')).not.toBeVisible({ timeout: 3_000 });
    });
  });

  // ── RequisitionApp validation ─────────────────────────────────────────────
  test.describe('RequisitionApp (requester)', () => {
    async function goToReq(page) {
      await page.goto('/');
      await page.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
      await page.getByText('ระบบเบิกยาออนไลน์').click();
      await page.waitForSelector('text=ค้นหายาในคลัง', { timeout: 8_000 });
    }

    test('ค้นหาไม่เจอยา → ไม่แสดงผลลัพธ์', async ({ authenticatedPage: page }) => {
      await goToReq(page);
      await page.getByPlaceholder('ชื่อยาหรือรหัสยา...').fill('XXXXNOTEXIST9999');
      await page.waitForResponse(
        r => r.url().includes('inventory') && r.status() < 400,
        { timeout: 8_000 }
      ).catch(() => {});
      await expect(page.getByText(/Acetaminophen|Paracetamol/i)).not.toBeVisible({ timeout: 3_000 });
    });

    test('submit โดยไม่มีรายการในตะกร้า → ปุ่ม ส่งใบเบิก disabled/ไม่มี', async ({ authenticatedPage: page }) => {
      await goToReq(page);
      // ยังไม่เพิ่มยาเข้าตะกร้า — ปุ่ม ตะกร้ายา ไม่มี badge หรือตะกร้าว่าง
      const cartBtn = page.getByRole('button', { name: 'ตะกร้ายา' });
      const hasCart = await cartBtn.isVisible().catch(() => false);
      if (hasCart) {
        await cartBtn.click();
        // ตะกร้าว่าง — ปุ่ม ส่งใบเบิก disabled หรือไม่มี
        const submitBtn = page.getByRole('button', { name: /ส่งใบเบิก/i });
        const isDisabled = await submitBtn.isDisabled().catch(() => true);
        expect(isDisabled).toBe(true);
      }
      // ถ้าไม่มีปุ่มตะกร้า = ตะกร้าว่างไม่แสดง → ผ่าน
    });
  });
});
