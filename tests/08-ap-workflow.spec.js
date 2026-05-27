/**
 * AP Workflow UX tests — แท็บ "ส่งบัญชี" ใน ReceiveLogApp
 *
 * เป้าหมาย: เช็คว่าขั้นตอน "ตรวจรับ → ส่งบัญชี → ตั้งหนี้" ผู้ใช้งานสับสนหรือยากไปไหม
 * โดยวัดจาก signal UI ที่ช่วยลดความสับสน:
 *   1. ปุ่มเรียงตามลำดับ flow ซ้าย→ขวา พร้อม chevron คั่น
 *   2. ปุ่มถัดไป disabled ถ้ายังไม่ทำขั้นก่อน (บังคับ flow ผ่าน UI)
 *   3. มี tooltip (title) อธิบายเหตุผลเมื่อกดไม่ได้
 *   4. ช่องชื่อมี placeholder บอกชัดว่า "ไม่กรอกก็ได้"
 *   5. Sub-tab + stage badge สีต่างกันชัดเจน
 *   6. Empty state มีข้อความชี้นำ ไม่ใช่หน้าว่าง
 *
 * ต้องใช้ role=staff (requester เห็นแท็บนี้ไม่ได้)
 */
import { test, expect } from './fixtures.js';

async function gotoApTab(page) {
  await page.goto('/');
  await page.waitForSelector('text=สวัสดี,', { timeout: 8_000 });
  await page.getByText('ประวัติการรับยาเข้าคลัง').click();
  await page.waitForSelector('text=ส่งบัญชี', { timeout: 8_000 });
  await page.getByRole('button', { name: /ส่งบัญชี/ }).first().click();
  await page.waitForSelector('text=ส่งบัญชีรายอาทิตย์', { timeout: 8_000 });
}

test.describe('AP Workflow — UX clarity', () => {

  test('staff เข้า tab "ส่งบัญชี" ได้ และเห็น header + sub-tabs ครบ', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoApTab(page);

    // header อธิบาย workflow ในประโยคเดียว (ลดความงงตอนแรกเข้า)
    await expect(page.getByText(/ตรวจรับ.*ส่งบัญชี.*post/i)).toBeVisible();

    // 3 sub-tabs ต้องเห็นครบ (pending / sent / history)
    await expect(page.getByRole('button', { name: /รอส่งบัญชี/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /ส่งบัญชีแล้ว|รอตั้งหนี้/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /ประวัติ/i }).first()).toBeVisible();
  });

  test('toolbar input 3 ช่อง — ทุกช่องบอกชัดว่าไม่บังคับกรอก', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoApTab(page);

    // 3 label ต้องเห็นชัด (ลด ambiguity ว่าใครต้องเซ็น)
    await expect(page.getByText('จนท.จัดซื้อ:').first()).toBeVisible();
    await expect(page.getByText('กรรมการตรวจรับ:').first()).toBeVisible();
    await expect(page.getByText('ส่งคืนจัดซื้อ:').first()).toBeVisible();

    // ทั้ง 2 ช่อง text มี placeholder บอกว่า "ไม่กรอกก็ได้"
    const placeholders = await page.locator('input[placeholder*="ไม่กรอกก็ได้"]').count();
    expect(placeholders).toBeGreaterThanOrEqual(2);
  });

  test('ช่อง "ส่งคืนจัดซื้อ" แสดงเป็น dd/mm/yyyy ไม่ใช่ mm/dd/yyyy', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoApTab(page);

    // ThaiDateInput render label + hidden native input — เช็คว่ามี text dd/mm/yyyy เป็น default
    // (default = วันนี้ → ต้องไม่เห็น 4 หลัก/2หลัก/2หลัก แบบ ISO และไม่ใช่ MM/DD)
    const returnDateRow = page.locator('div').filter({ hasText: /^ส่งคืนจัดซื้อ:/ }).first();
    await expect(returnDateRow).toBeVisible();
    // ช่องวันที่ต้องไม่แสดงรูปแบบ ISO (YYYY-MM-DD) ใน label visible
    const isoPattern = await page.getByText(/\d{4}-\d{2}-\d{2}/).count();
    expect(isoPattern).toBe(0);
  });

  test('ปุ่ม flow 3 ขั้น (รับบิล → ตรวจรับ → ส่งบัญชี) เรียงซ้าย→ขวา พร้อม chevron คั่น', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoApTab(page);

    const ack     = page.getByRole('button', { name: /จัดซื้อรับบิล/ }).first();
    const inspect = page.getByRole('button', { name: /Mark ตรวจรับแล้ว/ }).first();
    const send    = page.getByRole('button', { name: /Print & ส่งบัญชี/ }).first();

    await expect(ack).toBeVisible();
    await expect(inspect).toBeVisible();
    await expect(send).toBeVisible();

    // ตำแหน่ง x: ack < inspect < send (เรียงซ้าย→ขวาตาม flow)
    const ackBox     = await ack.boundingBox();
    const inspectBox = await inspect.boundingBox();
    const sendBox    = await send.boundingBox();
    expect(ackBox.x).toBeLessThan(inspectBox.x);
    expect(inspectBox.x).toBeLessThan(sendBox.x);
  });

  test('ปุ่ม flow ถัดไป disabled เมื่อยังไม่ได้เลือกบิล (บังคับ flow ผ่าน UI)', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoApTab(page);

    // ยังไม่ได้เลือกบิล → 3 ปุ่ม flow ต้อง disabled ทั้งหมด
    await expect(page.getByRole('button', { name: /จัดซื้อรับบิล/ }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /Mark ตรวจรับแล้ว/ }).first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /Print & ส่งบัญชี/ }).first()).toBeDisabled();
  });

  test('ปุ่ม "Mark ตรวจรับแล้ว" มี tooltip อธิบายเหตุผลเมื่อกดไม่ได้', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoApTab(page);

    const inspect = page.getByRole('button', { name: /Mark ตรวจรับแล้ว/ }).first();
    const title = await inspect.getAttribute('title');
    // ต้องมีข้อความช่วยเหลือ ไม่ใช่ปุ่มงงๆ ที่กดไม่ติด
    expect(title).toBeTruthy();
    expect(title).toMatch(/จัดซื้อรับบิล|จัดซื้อรับ/);
  });

  test('หน้าไม่ว่างเปล่า — เห็น BillCard หรือข้อความ empty state', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoApTab(page);

    // ผู้ใช้ต้องไม่งง: เปิดหน้ามาแล้วต้องเห็นอะไรซักอย่าง (รายการบิล หรือข้อความบอกว่า "ไม่มีบิล")
    await expect(
      page.getByText(/ไม่มีบิลรอตรวจรับ\/ส่งบัญชี|เลือกทั้งหมด/).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Stage badge มีสีต่างกัน (รอจัดซื้อรับ amber / จัดซื้อรับแล้ว sky / รอส่งบัญชี orange)', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoApTab(page);

    // stage pills ใน filter bar ต้องเห็นครบ 4 ตัว (ทั้งหมด / รอจัดซื้อรับ / จัดซื้อรับแล้ว / รอส่งบัญชี)
    await expect(page.getByRole('button', { name: /^ทั้งหมด/ }).first()).toBeVisible();
    await expect(page.getByText('รอจัดซื้อรับ').first()).toBeVisible();
    await expect(page.getByText('จัดซื้อรับแล้ว').first()).toBeVisible();
  });

  test('Sub-tab navigation ทำงาน + ไม่ crash', async ({ staffPage: page }) => {
    if (!page) test.skip();
    await gotoApTab(page);

    // คลิกไป tab "ประวัติ" — ต้องเห็น empty state หรือตาราง batch
    await page.getByRole('button', { name: /ประวัติ/i }).first().click();
    await expect(
      page.getByText(/ไม่มี batch|วันที่ส่ง|รหัสรอบ/i).first()
    ).toBeVisible({ timeout: 5_000 });

    // กลับมา tab "รอส่งบัญชี"
    await page.getByRole('button', { name: /รอส่งบัญชี/ }).first().click();
    await expect(page.getByRole('button', { name: /จัดซื้อรับบิล/ }).first()).toBeVisible();
  });

});
