// installEnv.test.js — Golden tests สำหรับ src/lib/installEnv.js
// รัน: node src/lib/installEnv.test.js  (npm run test:installenv)
// กฎ: ต้องผ่าน 100% ก่อน commit
// ครอบ: ติดตั้งแล้วไม่แสดง / คอมไม่แสดง / Android มี prompt vs ไม่มี / iPhone / iPad (รายงานเป็น Mac) /
//       LINE + Facebook บน iPhone และ Android / ลิงก์เปิดในเบราว์เซอร์

import { detectInstallEnv, externalBrowserUrl } from './installEnv.js'

let pass = 0, fail = 0
const fails = []
function assertEq(actual, expected, label) {
  if (actual === expected) { pass++; return }
  fail++
  fails.push(`  ✗ ${label}\n     expected: ${JSON.stringify(expected)}\n     actual:   ${JSON.stringify(actual)}`)
}
const mode = (o) => { const r = detectInstallEnv(o); return r.show ? r.mode : 'hidden' }

const UA = {
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipadOS: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  iphoneLine: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/14.12.0',
  androidLine: 'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 Line/14.12.1/IAB',
  androidFb: 'Mozilla/5.0 (Linux; Android 14; SM-A546E; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]',
}

console.log('\n=== detectInstallEnv ===')
assertEq(mode({ ua: UA.iphoneSafari, standalone: true }), 'hidden', 'เปิดแบบติดตั้งแล้ว (standalone) → ไม่แสดง')
assertEq(mode({ ua: UA.winChrome, hasPrompt: true }), 'hidden', 'คอม Windows แม้มี prompt → ไม่แสดง (staff ใช้คอม)')
assertEq(mode({ ua: UA.macSafari, maxTouchPoints: 0 }), 'hidden', 'Mac จริง (ไม่มีจอสัมผัส) → ไม่แสดง')
assertEq(mode({ ua: UA.androidChrome, hasPrompt: true }), 'prompt', 'Android Chrome มี prompt → กดปุ่มเดียวติดตั้ง')
assertEq(mode({ ua: UA.androidChrome, hasPrompt: false }), 'android', 'Android ยังไม่มี prompt → สอนผ่านเมนู ⋮')
assertEq(mode({ ua: UA.iphoneSafari }), 'ios', 'iPhone Safari → สอนกดแชร์')
assertEq(mode({ ua: UA.ipadOS, maxTouchPoints: 5 }), 'ios', 'iPad (รายงานเป็น Mac แต่มีจอสัมผัส) → ios')
assertEq(mode({ ua: UA.iphoneLine }), 'inapp', 'LINE บน iPhone → ให้เปิดในเบราว์เซอร์ก่อน')
assertEq(mode({ ua: UA.androidLine, hasPrompt: true }), 'inapp', 'LINE บน Android → inapp มาก่อน prompt')
assertEq(mode({ ua: UA.androidFb }), 'inapp', 'Facebook in-app → inapp')
assertEq(mode({}), 'hidden', 'ไม่มีข้อมูล → ไม่แสดง')

console.log('\n=== externalBrowserUrl ===')
assertEq(externalBrowserUrl('https://my-warehouse-app.netlify.app/'), 'https://my-warehouse-app.netlify.app/?openExternalBrowser=1', 'เติมพารามิเตอร์')
assertEq(externalBrowserUrl('https://x.app/?a=1#h'), 'https://x.app/?a=1&openExternalBrowser=1#h', 'คงพารามิเตอร์เดิม + hash')
assertEq(externalBrowserUrl('https://x.app/?openExternalBrowser=1'), 'https://x.app/?openExternalBrowser=1', 'มีอยู่แล้วไม่ซ้ำ')

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) { console.log(fails.join('\n')); process.exit(1) }
