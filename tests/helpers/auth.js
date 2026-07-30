// Helper: login ด้วย username + password
export async function login(page, username = 'test', password = '111111') {
  await page.goto('/');
  await page.getByPlaceholder('กรอกชื่อผู้ใช้').fill(username);
  await page.getByPlaceholder('รหัสผ่าน').fill(password);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  // รอจน sidebar โผล่ = login สำเร็จ + AppShell render แล้ว
  // (เดิมรอ text "สวัสดี," ซึ่งถูกลบตอน redesign sidebar → test ทั้ง repo พังหมด
  //  ปุ่ม "หน้าหลัก" เป็น landmark ที่เสถียรกว่า: มีทุก role และไม่ผูกกับ layout เดิม)
  await page.getByRole('button', { name: 'หน้าหลัก' }).first().waitFor({ state: 'visible', timeout: 15_000 });
}
