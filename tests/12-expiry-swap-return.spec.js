// ── โมดอลใกล้หมดอายุ (ชมพู) + popup คืนบริษัท (ส้ม): ประวัติรับยา + scope + deadline + ตัวกรองพับ ──
// ครอบคลุมงาน 2026-07-18: banner คืนบริษัทในโมดอลชมพู, คลิกดูประวัติรับยาได้ทั้ง 2 โมดอล,
// scope รหัส+lot+exp, แก้ bug spillover/timezone ให้ deadline ตรงกันทุกจุด, ตัวกรองพับ/กาง
import { test, expect } from '@playwright/test';
import { login } from './helpers/auth.js';

// staff/admin เห็น SwapReturnPopup เด้ง auto ตอน login — helper ปิดให้สนิท (async, ต้องรอโผล่ก่อน)
async function dismissSwapPopup(page) {
  const swapTitle = page.getByText('ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด');
  await swapTitle.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {}); // requester ไม่มี — ข้าม
  for (let i = 0; i < 5 && await swapTitle.isVisible().catch(() => false); i++) {
    await page.getByRole('button', { name: 'รับทราบ' }).last().click({ force: true }).catch(() => {});
    await swapTitle.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

async function openExpiryModal(page) {
  await page.locator('button', { hasText: /ใกล้หมด/ }).first().click();
  await page.getByText('แจ้งเตือนยาใกล้หมดอายุ').waitFor({ timeout: 10000 });
  await page.waitForTimeout(2500); // รอ drugDetails/swapPolicies โหลด (lazy)
}

test('popup ส้ม: คลิกรายการ → กางประวัติรับยา (จาก receive_logs)', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  const swapTitle = page.getByText('ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด');
  await swapTitle.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(2000);

  // popup แสดงรายการ due/overdue ตามข้อมูลจริง ณ วันรัน — ถ้าคลังเคลียร์หมดจะไม่มีอะไรให้คลิก
  // ข้ามแทน fail: ไม่มีรายการ = คลังจัดการครบ ไม่ใช่แอปพัง
  const detailBtn = page.getByText('ดูประวัติรับยา').first();
  if (await detailBtn.count() === 0) {
    test.skip(true, 'ไม่มีรายการถึงกำหนดคืนในข้อมูลปัจจุบัน');
  }
  await detailBtn.click();
  await expect(page.getByText('ประวัติรับยา (จาก Log คลัง)').first()).toBeVisible({ timeout: 5000 });
  // strict display: ตรงเป๊ะ = การ์ดบิล (มี "เลขที่บิล") / ใกล้เคียง = ใบ้เลขที่บิล / ไม่มี = บอกไม่พบ
  await expect(page.getByText(/เลขที่บิล|ไม่พบบิลของ|ไม่พบข้อมูลในประวัติรับยา/).first()).toBeVisible({ timeout: 3000 });
});

test('โมดอลชมพู: banner คืนบริษัท + คลิกรายการดูประวัติรับยา', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  await dismissSwapPopup(page);
  await openExpiryModal(page);

  // banner คืนบริษัทแสดง (มีรายการ due/overdue)
  await expect(page.getByText(/ต้องเปลี่ยน\/คืนบริษัทก่อนพ้นกำหนด/).first()).toBeVisible();

  // กาง banner → คลิกรายการ → ประวัติรับยากางออก
  await page.getByRole('button', { name: /ต้องเปลี่ยน\/คืนบริษัทก่อนพ้นกำหนด/ }).click();
  await page.locator('div.cursor-pointer', { hasText: /พ้นกำหนด|เหลือ \d+ วัน/ }).first().click();
  await expect(page.getByText('ประวัติรับยา (จาก Log คลัง)').first()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/เลขที่บิล|ไม่พบบิลของ|ไม่พบข้อมูลในประวัติรับยา/).first()).toBeVisible({ timeout: 3000 });
});

test('ประวัติรับยา strict: lot+exp ตรง = การ์ดบิล + note เขียว, lot ไม่มีใน log = ไม่พบบิล', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  await dismissSwapPopup(page);
  await openExpiryModal(page);
  const modal = page.locator('div.bg-white', { has: page.getByText('แจ้งเตือนยาใกล้หมดอายุ') }).last();

  // (1) Budesonide — lot+exp ตรงใน receive_logs → การ์ดบิล + ยืนยันเขียว + Lot/EXP ตาม log
  // ไม่ผูกกับ lot เจาะจง (lot หมดแล้วรายการหลุดจากโมดอล) — ถ้ายาตัวนี้ไม่อยู่ในรอบนี้ ข้ามท่อนนี้ไป
  const budesonide = modal.getByText('BudesonidenebuliserPul', { exact: false }).first();
  if (await budesonide.count() > 0) {
    await budesonide.click();
    await expect(page.getByText('ประวัติรับยา (จาก Log คลัง)').first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('ตรงกับ lot + EXP รายการนี้').first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Lot (ตาม log)').first()).toBeVisible({ timeout: 3000 });
    expect(await page.getByText(/บิล 2\//).count()).toBe(0);
    await budesonide.click(); // ปิดอันเดิม
  }

  // (2) Amoxicillin 1000028 lot N670219 — lot ไม่มีใน receive_logs → strict: ไม่โชว์บิลระดับรหัส บอกไม่พบตรงๆ
  await page.locator('input[placeholder*="ค้นหา"]').first().fill('Amoxicillin trihydrate');
  await page.waitForTimeout(800);
  await modal.locator('tr', { hasText: 'N670219' }).first().locator('td').first().click();
  await expect(page.getByText(/ไม่พบบิลของ lot\/EXP รายการนี้|ไม่พบข้อมูลในประวัติรับยา/).first()).toBeVisible({ timeout: 4000 });
  expect(await page.getByText('ตรงกับ lot + EXP รายการนี้').count()).toBe(0); // ต้องไม่มี note เขียวหลอก
});

test('deadline ต้องคืน: popup ส้ม = banner ชมพู (clamp สิ้นเดือน, ไม่ spillover)', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  const swapTitle = page.getByText('ยาต้องเปลี่ยน/คืนบริษัทก่อนพ้นกำหนด');
  await swapTitle.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForTimeout(1500);
  const popupDeadlines = await page.getByText(/ต้องคืนภายใน/).allInnerTexts();

  await dismissSwapPopup(page);
  await openExpiryModal(page);
  await page.getByRole('button', { name: /ต้องเปลี่ยน\/คืนบริษัทก่อนพ้นกำหนด/ }).click();
  // รอรายการใน banner โผล่จริงก่อนอ่าน — waitForTimeout เฉยๆ ทำให้ flaky (อ่านตอนยังว่าง)
  await page.getByText(/ต้องคืนภายใน/).first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  const bannerDeadlines = await page.getByText(/ต้องคืนภายใน/).allInnerTexts();

  // ⚠️ ห้าม hardcode วันที่/lot — ของหมด (qty=0) แล้วรายการหลุดจาก popup ทำให้ test เน่า
  // (เหตุการณ์ 2026-08-08: เคย assert '30/4/2569' ของ lot 330638 พอ lot นั้น qty=0 → ล้มถาวร
  //  ทั้งที่แอปทำงานปกติ). ทดสอบ "หลักการ" แทน: จุดที่ซ้อนกันต้องคำนวณ deadline ตรงกัน
  test.skip(popupDeadlines.length === 0, 'ไม่มีรายการถึงกำหนดคืนในข้อมูลปัจจุบัน');

  // ⚠️ popup ⊅ banner โดยเจตนา — คนละขอบเขตข้อมูล ไม่ใช่บั๊ก:
  //   popup  = fetchSwapReturnDue → ทั้งคลัง (ยา exp ไกลเกิน 16 ด. ที่ deadline คืนผ่านแล้ว ก็ติด)
  //   banner = dueReturns filter จาก enriched → เฉพาะยาในโมดอลใกล้หมดอายุ (16 เดือน)
  // จึงเทียบได้เฉพาะ "รายการที่อยู่ทั้ง 2 ที่" — ต้องได้ deadline ตรงกัน (Rule #6)
  const bannerSet = new Set(bannerDeadlines.map(s => s.trim()));
  const shared = popupDeadlines.map(s => s.trim()).filter(d => bannerSet.has(d));
  expect(shared.length, 'ควรมีรายการที่ปรากฏทั้ง popup และ banner อย่างน้อย 1 รายการ').toBeGreaterThan(0);

  // clamp สิ้นเดือน: subMonths ต้องไม่ spillover (31/7 − 3 ด. = 30/4 ไม่ใช่ 1/5)
  // ตรวจทุก deadline ว่าเป็นวันที่ที่มีจริงในเดือนนั้น — spillover จะให้วันที่เกินสิ้นเดือน
  for (const d of [...popupDeadlines, ...bannerDeadlines]) {
    const m = /ต้องคืนภายใน\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(d);
    if (!m) continue;
    const [day, mon, beYear] = [+m[1], +m[2], +m[3]];
    const lastDay = new Date(beYear - 543, mon, 0).getDate();
    expect(day, `deadline ${d} ต้องไม่เกินวันสิ้นเดือน (${lastDay})`).toBeLessThanOrEqual(lastDay);
    expect(day).toBeGreaterThanOrEqual(1);
  }
});

test('ตัวกรองพับ/กาง: ช่วงเวลา + โซน (default พับ)', async ({ page }) => {
  await login(page, 'Kao_9', '96409999');
  await dismissSwapPopup(page);
  await openExpiryModal(page);

  // default พับ — เห็นแค่ปุ่มตัวกรอง 2 ตัว ไม่เห็น chips
  await expect(page.getByRole('button', { name: /ช่วงเวลา/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /กรองตามโซน/ }).first()).toBeVisible();
  expect(await page.getByRole('button', { name: /3–6 เดือน/ }).count()).toBe(0);

  // กาง → เลือก → ปุ่ม summary อัพเดตค่าที่เลือก
  await page.getByRole('button', { name: /ช่วงเวลา/ }).first().click();
  await page.getByRole('button', { name: /6–16 เดือน/ }).first().click();
  await expect(page.getByRole('button', { name: /ช่วงเวลา/ }).first()).toContainText('6–16 เดือน');
});
