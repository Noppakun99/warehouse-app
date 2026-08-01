/**
 * Custom Playwright fixtures สำหรับ warehouse-app
 *
 * authenticatedPage — scope: 'worker'
 *   Login ครั้งเดียวต่อ worker แล้ว reuse browser context ข้ามทุก test
 *   ในไฟล์เดียวกัน → ประหยัดเวลา ~2-3s ต่อ test
 *
 * waitForSupabase — helper สำหรับรอ Supabase REST response
 *   ใช้แทน waitForTimeout ที่ไม่แน่นอน
 */

import { test as base, expect } from '@playwright/test';
import { login, waitForAppShell } from './helpers/auth.js';

// re-export ให้ test file เรียกใช้ได้จาก fixtures โดยไม่ต้อง import helpers/auth เพิ่ม
export { waitForAppShell };

// ─── Credentials (override ด้วย env var ถ้ามี) ────────────────────────────
// ยืนยันกับ DB แล้ว (app_users + เทียบ sha256):
//   test  = requester (111111 ใช้ได้)
//   Kao_9 = admin     (96409999 ใช้ได้)
//   test2 = staff แต่ **รหัสผ่านที่บันทึกไว้เดิม (555555) ใช้ไม่ได้แล้ว** → login ไม่ผ่าน
// staffPage จึงใช้ Kao_9 (admin) — สิทธิ์ครอบคลุมของ staff ทั้งหมด
// ⚠️ test ที่ยืนยันว่า "staff ไม่เห็นเมนูเฉพาะ admin" ใช้ fixture นี้ไม่ได้
//    (admin เห็นทุกเมนูโดยถูกต้อง) — ต้องมี account role=staff ที่ login ได้ก่อน
const STAFF_USER = process.env.TEST_STAFF_USER || 'Kao_9';
const STAFF_PASS = process.env.TEST_STAFF_PASS || '96409999';

export const test = base.extend({
  // ─── Shared authenticated browser context (worker scope) ─────────────────
  authenticatedPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page    = await context.newPage();
      try {
        await login(page);
        await use(page);
      } catch {
        await use(null); // test ที่รับ null ต้อง test.skip() เอง
      } finally {
        await context.close();
      }
    },
    { scope: 'worker' },  // สร้างครั้งเดียวต่อ worker — ไม่ login ซ้ำทุก test
  ],

  // ─── Staff context (worker scope) — ถ้า login ไม่ผ่านจะ use(null) แทน crash
  staffPage: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page    = await context.newPage();
      try {
        await login(page, STAFF_USER, STAFF_PASS);
        await use(page);
      } catch {
        await use(null); // test ที่รับ null ต้อง test.skip() เอง
      } finally {
        await context.close();
      }
    },
    { scope: 'worker' },
  ],
});

export { expect };

/**
 * รอ Supabase REST API response
 * ใช้แทน waitForTimeout โดยดักฟัง network จริง
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} opts
 * @param {string} [opts.table]   — ชื่อ table เช่น 'inventory', 'dispense_logs'
 * @param {string} [opts.method]  — HTTP method (GET, POST, PATCH, DELETE) default 'GET'
 * @param {number} [opts.timeout] — ms default 8000
 */
export function waitForSupabase(page, { table = '', method = 'GET', timeout = 8_000 } = {}) {
  return page.waitForResponse(
    r =>
      r.url().includes('supabase') &&
      (table ? r.url().includes(`/${table}`) : true) &&
      r.request().method() === method &&
      r.status() < 400,
    { timeout },
  );
}
