/**
 * AP Workflow UX tests — แท็บ "ส่งบัญชี" ใน ReceiveLogApp
 *
 * อ่านอย่างเดียว (ไม่กดปุ่มที่เขียน DB) — เขียนใหม่ 11/10/2569 ตามหน้า AP ปัจจุบัน:
 *   แท็บ รอนำส่งบัญชี / นำส่งบัญชีแล้ว / ประวัติการตั้งหนี้ · flow 3 ขั้น (รอจัดซื้อรับเอกสาร →
 *   จัดซื้อรับเอกสารแล้ว → รอนำส่งบัญชี) แสดงเมื่อมีบิล · ไม่มีบิล = ข้อความ empty state
 * (ชุดเดิมอ้างช่องกรอก 3 ช่อง + ปุ่ม "Mark ตรวจรับแล้ว"/"Print & ส่งบัญชี" ที่ถอดไปแล้ว — ตก 8/9 ตั้งแต่ก่อน 10/10/2569)
 *
 * ต้องใช้ role=staff (requester เห็นแท็บนี้ไม่ได้)
 */
import { test, expect, waitForAppShell } from './fixtures.js';

// การ์ด "ประวัติการรับยาเข้าคลัง" บน Dashboard ถูกถอดแล้ว (commit 2b16aef) → ใช้เมนูย่อยใน sidebar
// "ประวัติรับยา ▸ ส่งบัญชี" (page receive-ap = ReceiveLogApp initialTab="ap") — กางเมนูแม่ก่อนถ้ายังพับ
async function gotoApTab(page) {
  await page.goto('/');
  await waitForAppShell(page);
  const apMenu = page.getByRole('button', { name: 'ส่งบัญชี', exact: true });
  if (!(await apMenu.first().isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'ประวัติรับยา', exact: true }).first().click();
  }
  await apMenu.first().click();
  await page.waitForSelector('text=ส่งบัญชีรายอาทิตย์', { timeout: 10_000 });
}

test.describe('AP Workflow — หน้าส่งบัญชีปัจจุบัน', () => {
  test('เข้าหน้าได้ + เห็นหัวข้อ + แท็บครบ 3', async ({ staffPage: page }) => {
    await gotoApTab(page);
    await expect(page.getByText('ส่งบัญชีรายอาทิตย์ (AP Workflow)')).toBeVisible();
    await expect(page.getByRole('button', { name: /^รอนำส่งบัญชี/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^นำส่งบัญชีแล้ว/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /^ประวัติการตั้งหนี้/ })).toBeVisible();
  });

  test('ช่องค้นหา + ช่องวันรับแสดง dd/mm/yyyy ไม่มีวันที่แบบ ISO บนหน้า', async ({ staffPage: page }) => {
    await gotoApTab(page);
    await expect(page.getByPlaceholder('ค้นหาเลขบิล / ชื่อยา / บริษัท')).toBeVisible();
    await expect(page.getByText('dd/mm/yyyy').first()).toBeVisible(); // ThaiDateInput วาง span ทับ input (ไม่ใช่ placeholder)
    await expect(page.getByText('กำลังโหลด...')).toHaveCount(0, { timeout: 30_000 });
    expect(await page.getByText(/\d{4}-\d{2}-\d{2}/).count()).toBe(0);
  });

  test('แท็บรอนำส่งบัญชีไม่ว่างเปล่า — เห็น flow 3 ขั้น หรือข้อความไม่มีบิล', async ({ staffPage: page }) => {
    await gotoApTab(page);
    await expect(page.getByText('กำลังโหลด...')).toHaveCount(0, { timeout: 30_000 });
    await expect(
      page.getByText('รอจัดซื้อรับเอกสาร').or(page.getByText('ไม่มีบิลรอตรวจรับ/ส่งบัญชี')).first()
    ).toBeVisible();
  });

  test('ปุ่มขั้นถัดไปกดไม่ได้จนกว่าจะเลือกบิล (ถ้ามีบิลรอ)', async ({ staffPage: page }) => {
    await gotoApTab(page);
    await expect(page.getByText('กำลังโหลด...')).toHaveCount(0, { timeout: 30_000 });
    const confirmBtn = page.getByRole('button', { name: /^ยืนยันตรวจรับ/ }).first();
    test.skip(!(await confirmBtn.isVisible().catch(() => false)), 'ไม่มีบิลรอดำเนินการตอนนี้');
    await expect(confirmBtn).toBeDisabled();
    await expect(page.getByRole('button', { name: /^บันทึกจัดซื้อรับเอกสาร/ }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /^พิมพ์ใบนำส่ง & นำส่งบัญชี/ }).first()).toBeDisabled();
  });

  test('สลับแท็บได้ไม่ crash', async ({ staffPage: page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await gotoApTab(page);
    await page.getByRole('button', { name: /^นำส่งบัญชีแล้ว/ }).click();
    await page.getByRole('button', { name: /^ประวัติการตั้งหนี้/ }).click();
    await page.getByRole('button', { name: /^รอนำส่งบัญชี/ }).click();
    await expect(page.getByText('ส่งบัญชีรายอาทิตย์ (AP Workflow)')).toBeVisible();
    expect(errors).toEqual([]);
  });
});
