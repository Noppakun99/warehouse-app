// usageReport.js — หน้า "ค้นยา · สรุปรับ-เบิก" (โหมดค้นยาของ ReorderApp — 14/11/2569) — pure module (no supabase)
// golden test: src/lib/usageReport.test.js (npm run test:usagereport)
//
// ตัวเลขคงเหลือ / หน่วยหลัก / เรท มาจาก buildDrugProfile ตัวเดียวกับบัตรยา → ตรงกันโดยโครงสร้าง (Rule #6)
// ยอดเบิกช่วงรายงาน + รายหน่วยงาน = summarizeUsage (drugProfile.js) · Excel / ข้อความไลน์ / ใบพิมพ์ อ่านจาก report ชุดเดียวกับจอ

import {
  buildDrugProfile, summarizeUsage, receiptsInRange, usageMonthsBase, latestPurchaseUnit,
  isPurchaseReceipt, packUnitLabel, packWord, parseUnitFactor, unitLabel,
} from './drugProfile.js'
import { listMonthYM, thaiMonthLabel } from './reorder.js'
import { purchaseDatesByCode, requestState, pendingRequestFor, todayIso } from './purchaseReportSheet.js'

const round2 = (n) => Math.round(n * 100) / 100

// บรรทัดรับ (1 แถว = 1 lot) → รายบิล (วันรับ + เลขบิล + บริษัท — key เดียวกับ billGroupKey ของ AP, Rule #19)
// บิลเดียวหลาย lot = รับ 1 ครั้ง · qtyMain = null ถ้า lot ใดแปลงหน่วยไม่ได้
export function groupReceiptBills(receipts = []) {
  const map = new Map()
  for (const x of receipts) {
    const k = `${x.date}|${x.billNumber}|${x.supplier}`
    let b = map.get(k)
    if (!b) { b = { date: x.date, billNumber: x.billNumber, supplier: x.supplier, purchaseType: x.purchaseType, lots: 0, qtyMain: 0 }; map.set(k, b) }
    b.lots += 1
    b.qtyMain = b.qtyMain == null || x.qtyMain == null ? null : round2(b.qtyMain + x.qtyMain)
  }
  return [...map.values()]
}

// ── ประกอบรายงาน 1 รหัส ──────────────────────────────────────────────
// rows = inventory ของรหัส · receiveRows = receive_logs เรียงใหม่→เก่า (ทั้งหมด — ใช้หาหน่วยซื้อ/วันที่ของซื้อมาส่ง)
// dispenseRows = dispense_logs ครอบช่วงรายงาน + 4 เดือนของเรท · range = { from, to } ISO · rateMonths = ['YYYY-MM'…]
export function buildDrugUsageReport({
  code, rows = [], receiveRows = [], dispenseRows = [], excludeStatus = null, purchaseRequests = [],
  range, rateMonths = [], today = new Date(),
}) {
  const profile = buildDrugProfile({
    rows, purchaseUnit: latestPurchaseUnit(receiveRows), excludeStatus, receiveRows, today,
    usage: { months: rateMonths, monthsBase: usageMonthsBase(dispenseRows) },
  })
  if (!profile) return null
  const months = listMonthYM(range.from, range.to)
  const usage = summarizeUsage({ dispenseRows, mainUnit: profile.mainUnit, months })
  const receipts = receiptsInRange(receiveRows, { ...range, mainUnit: profile.mainUnit })
  const allReceipts = receiptsInRange(receiveRows, { from: '0000-00-00', to: '9999-99-99', mainUnit: profile.mainUnit })
  const lastPurchase = receiveRows.find(isPurchaseReceipt)

  const todayStr = todayIso(today)
  const dates = purchaseDatesByCode(receiveRows)[String(code).trim()] || []
  const latest = [...purchaseRequests].sort((a, b) => String(b.notified_on || '').localeCompare(String(a.notified_on || '')))[0]

  return {
    code: profile.code, name: profile.name, type: profile.type,
    mainUnit: profile.mainUnit,
    total: profile.total, split: profile.split,
    discontinued: profile.discontinued, excludeStatus: profile.excludeStatus,
    belowSS: profile.belowSS,
    rate: profile.rate,
    unitNote: profile.unitNote,
    range: {
      from: range.from, to: range.to, months,
      label: months.length ? `${thaiMonthLabel(months[0])}–${thaiMonthLabel(months[months.length - 1])}` : '-',
    },
    usage,
    receipts,
    receiptBills: groupReceiptBills(receipts),
    // รวมรับเข้าในหน่วยหลัก — บิลใดแปลงหน่วยไม่ได้ = รวมไม่ได้ (null) ไม่ใช่ข้ามบิลนั้นเงียบๆ
    receivedTotal: receipts.length && receipts.every(r => r.qtyMain != null)
      ? round2(receipts.reduce((s, r) => s + r.qtyMain, 0)) : (receipts.length ? null : 0),
    lastReceipt: groupReceiptBills(allReceipts)[0] || null,   // บิลล่าสุดทั้งบิล (ไม่ใช่ lot แรกของบิล)
    lastPurchaseDate: lastPurchase?.receive_date || null,
    pendingRequest: pendingRequestFor(purchaseRequests, dates, todayStr),
    latestRequest: latest ? { ...latest, ...requestState(latest, dates, todayStr) } : null,
  }
}

// ── รูปแบบตัวเลข/วันที่ (DD/MM/YYYY พ.ศ. — Rule #3) ────────────────────────
export const fmtQty = (n) => n == null ? '-' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
export const fmtThaiDate = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${Number(m[1]) + 543}` : '-'
}
// หน่วยสั้นในประโยค: "1000เม็ด" → "กล่อง" · หน่วยไม่มีเลข = ตัวมันเอง
export const unitShort = (unit) => parseUnitFactor(unit).factor > 1 ? packWord(unit) : (String(unit || '').trim() || 'หน่วย')

export function purchaseStatusText(r) {
  if (r.pendingRequest) {
    const p = r.pendingRequest
    return `แจ้งซื้อ ${fmtThaiDate(p.notified_on)} รอของ ${fmtQty(p.waitDays)} วัน${p.count > 1 ? ` (ค้าง ${p.count} ครั้ง)` : ''}`
  }
  const l = r.latestRequest
  if (!l) return 'ไม่มีรายการแจ้งซื้อ'
  if (l.state === 'arrived') return `แจ้งซื้อล่าสุด ${fmtThaiDate(l.notified_on)} · มาส่งแล้ว${l.arrivedOn ? ` ${fmtThaiDate(l.arrivedOn)}` : ''}`
  if (l.state === 'cancelled') return `แจ้งซื้อล่าสุด ${fmtThaiDate(l.notified_on)} · ยกเลิก`
  return `แจ้งซื้อ ${fmtThaiDate(l.notified_on)}`
}

// แถวที่นับในยอดเบิกแต่ไม่ใช่หน่วยงาน (เบิกเพิ่มจากความผิดพลาด ฯลฯ) — บอกไว้ให้ยอดรวมกระทบกับรายหน่วยงานได้
export const nonDeptText = (u) => u.nonDepartments.length
  ? u.nonDepartments.map(d => `${d.department} ${fmtQty(d.qty)}`).join(' · ') : null

const lowestText = (u) => {
  if (!u.lowest.length) return null
  const names = u.lowest.map(d => d.department)
  const shown = names.length > 3 ? `${names.slice(0, 3).join(', ')} และอีก ${names.length - 3} หน่วยงาน` : names.join(', ')
  return `${shown} ${fmtQty(u.lowest[0].qty)}`
}

// ── ข้อความไลน์ ─────────────────────────────────────────────────────
export function usageReportLineText(reports = []) {
  if (!reports.length) return ''
  const r0 = reports[0]
  const head = reports.length > 1
    ? [`สรุปรับ-เบิกยา ${reports.length} รายการ`, `ช่วง ${r0.range.label} (${r0.range.months.length} เดือน)`, '']
    : []
  const blocks = reports.map(r => {
    const u = unitShort(r.mainUnit)
    const lines = [`${r.name} (${r.code})`]
    if (reports.length === 1) lines.push(`ช่วง ${r.range.label} (${r.range.months.length} เดือน)`)
    const extra = [r.split.pending > 0 && `รอตรวจรับ ${fmtQty(r.split.pending)}`, r.split.expired > 0 && `หมดอายุ ${fmtQty(r.split.expired)}`].filter(Boolean)
    lines.push(`• คงเหลือ ${fmtQty(r.total)} ${packUnitLabel(r.mainUnit)}${extra.length ? ` (${extra.join(' · ')})` : ''}`)
    if (r.rate) {
      lines.push(r.rate.avgMonth > 0
        ? `• เรท ${fmtQty(r.rate.avgMonth)} ${u}/เดือน (${r.rate.monthLabel}) ใช้ได้อีก ${r.rate.coverage}`
        : `• ไม่มีการเบิกช่วง ${r.rate.monthLabel}`)
    }
    lines.push(`• เบิกรวม ${fmtQty(r.usage.total)} ${u} ${fmtQty(r.usage.count)} ครั้ง จาก ${r.usage.departments.length} หน่วยงาน`)
    if (r.usage.top) {
      const low = lowestText(r.usage)
      lines.push(`• เบิกมากสุด ${r.usage.top.department} ${fmtQty(r.usage.top.qty)} (${fmtQty(r.usage.top.count)} ครั้ง)${low ? ` · น้อยสุด ${low}` : ''}`)
    }
    if (nonDeptText(r.usage)) lines.push(`• รวมในยอดเบิก (ไม่ใช่หน่วยงาน): ${nonDeptText(r.usage)}`)
    if (r.receiptBills.length) {
      const last = r.receiptBills[0]
      lines.push(`• รับเข้า ${r.receiptBills.length} บิล${r.receivedTotal != null ? ` รวม ${fmtQty(r.receivedTotal)} ${u}` : ''} · ล่าสุด ${fmtThaiDate(last.date)} ${last.supplier}${last.qtyMain != null ? ` ${fmtQty(last.qtyMain)} ${u}` : ''}`)
    } else {
      lines.push(`• ไม่มีรับเข้าในช่วงนี้${r.lastReceipt ? ` (รับล่าสุด ${fmtThaiDate(r.lastReceipt.date)} ${r.lastReceipt.supplier})` : ''}`)
    }
    lines.push(`• ${purchaseStatusText(r)}`)
    return lines.join('\n')
  })
  return [...head, blocks.join('\n\n')].join('\n')
}

// ── ข้อความไลน์จากบัตรยา (ปุ่มคัดลอกบน DrugProfileModal — user สั่ง 15/11/2569) ──────────
// p = buildDrugProfile + purchaseRequest (fetchDrugProfile) · statusTexts = ข้อความชิปสถานะบนบัตร (statusChips)
// updatedAtText = เวลานำเข้า Excel ล่าสุดตามที่บัตรแสดง — บัตรยาไม่ใช่ยอดสด ต้องบอกเวลาเสมอ (CONTEXT §บัตรยา)
export const CARD_LINE_LOTS = 10
const fmtDateObj = (d) => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}` : null
export function drugCardLineText(p, { statusTexts = [], updatedAtText = '' } = {}) {
  if (!p) return ''
  const lines = [`${p.name} (รหัส ${p.code})`]
  if (updatedAtText) lines.push(`ยอด ณ นำเข้า Excel ล่าสุด ${updatedAtText}`)
  const split = [
    p.split.pending > 0 && `รอตรวจรับ ${fmtQty(p.split.pending)}`,
    p.split.expired > 0 && `หมดอายุ ${fmtQty(p.split.expired)}`,
  ].filter(Boolean)
  lines.push(`• คงเหลือ ${fmtQty(p.total)} ${packUnitLabel(p.mainUnit)}${split.length ? ` (พร้อมเบิก ${fmtQty(p.split.ready)} · ${split.join(' · ')})` : ''}`)
  statusTexts.forEach(t => lines.push(`• ${t}`))
  if (p.rate) {
    lines.push(p.rate.avgMonth > 0
      ? `• เรท ${fmtQty(p.rate.avgMonth)} ${unitShort(p.rate.unit)}/เดือน (${p.rate.monthLabel}) ใช้ได้อีก ${p.rate.coverage}`
      : `• ไม่มีการเบิกช่วง ${p.rate.monthLabel}`)
  }
  if (p.purchaseRequest) lines.push(`• แจ้งซื้อแล้ว ${fmtQty(p.purchaseRequest.waitDays)} วัน (แจ้ง ${fmtThaiDate(p.purchaseRequest.notified_on)})`)
  if (p.lots.length) {
    lines.push('', `ราย lot (${p.lots.length}):`)
    p.lots.slice(0, CARD_LINE_LOTS).forEach(l => {
      const exp = fmtDateObj(l.expDate) || (l.exp && l.exp !== '-' ? l.exp : 'ไม่ระบุ')
      const loc = l.locations.length ? ` · ชั้น ${l.locations.join(', ')}` : ''
      lines.push(`- lot ${l.lot} หมดอายุ ${exp} · ${fmtQty(l.qty)} ${packUnitLabel(l.unit)}${loc}${l.pending ? ' · รอตรวจรับ' : ''}`)
    })
    if (p.lots.length > CARD_LINE_LOTS) lines.push(`- และอีก ${p.lots.length - CARD_LINE_LOTS} lot (ดูในบัตรยา)`)
  }
  const last = p.receiveHistory?.[0]
  const top = p.dispenseHistory?.topDept
  if (last || top) lines.push('')
  if (last) lines.push(`• รับล่าสุด ${fmtThaiDate(last.date)} ${last.supplier} (บิล ${last.billNumber})`)
  if (top) lines.push(`• เบิกบ่อยสุด ${top.department} (${fmtQty(top.count)} จาก ${fmtQty(top.of)} ครั้ง)`)
  return lines.join('\n')
}

// ── Excel 4 ชีท (สรุป · รายเดือน · หน่วยงาน · รับเข้า) ──────────────────────
// คืน [{ name, rows: aoa, cols: [ความกว้าง] }] — ตัวเขียนไฟล์อยู่ exportExcel.js (exportSheetsToExcel)
export function usageReportSheets(reports = [], { updatedAt = null } = {}) {
  const r0 = reports[0]
  const title = [
    [`สรุปรับ-เบิกยา ช่วง ${r0?.range.label || '-'} (${r0?.range.months.length || 0} เดือน)`],
    [updatedAt ? `ข้อมูลคงคลัง ณ นำเข้าล่าสุด ${fmtThaiDate(updatedAt)}` : 'ข้อมูลคงคลัง ณ นำเข้าล่าสุด'],
    [],
  ]
  const num = (n) => n == null ? '' : n

  const summary = [...title, [
    'รหัส', 'ชื่อยา', 'หน่วยหลัก', 'คงเหลือ', 'รอตรวจรับ', 'หมดอายุ',
    'เรท/เดือน', 'ช่วงเรท', 'คงอยู่ได้อีก', 'เบิกรวมในช่วง', 'จำนวนครั้ง', 'จำนวนหน่วยงาน',
    'เบิกมากสุด', 'จำนวน', 'เบิกน้อยสุด', 'จำนวน', 'รับเข้าในช่วง', 'รับล่าสุด', 'บริษัทล่าสุด', 'แจ้งซื้อ',
  ], ...reports.map(r => [
    r.code, r.name, r.mainUnit || '', num(r.total), num(r.split.pending), num(r.split.expired),
    num(r.rate?.avgMonth), r.rate?.monthLabel || '', r.rate?.coverage || '',
    num(r.usage.total), r.usage.count, r.usage.departments.length,
    r.usage.top?.department || '', num(r.usage.top?.qty),
    r.usage.lowest.map(d => d.department).join(', '), num(r.usage.lowest[0]?.qty),
    num(r.receivedTotal), r.lastReceipt ? fmtThaiDate(r.lastReceipt.date) : '', r.lastReceipt?.supplier || '',
    purchaseStatusText(r),
  ])]

  const months = r0?.range.months || []
  const monthly = [...title, ['รหัส', 'ชื่อยา', 'หน่วยหลัก', ...months.map(thaiMonthLabel), 'รวม', 'เฉลี่ย/เดือน'],
    ...reports.map(r => [
      r.code, r.name, r.mainUnit || '', ...r.usage.monthly.map(m => m.qty), r.usage.total,
      months.length ? round2(r.usage.total / months.length) : 0,
    ])]

  const depts = [...title, ['รหัส', 'ชื่อยา', 'หน่วยหลัก', 'อันดับ', 'หน่วยงาน', 'จำนวน', 'ครั้ง', 'สัดส่วน (%)']]
  for (const r of reports) {
    r.usage.departments.forEach((d, i) => depts.push([r.code, r.name, r.mainUnit || '', i + 1, d.department, d.qty, d.count, round2(d.share * 100)]))
    r.usage.nonDepartments.forEach(d => depts.push([r.code, r.name, r.mainUnit || '', 'ไม่ใช่หน่วยงาน', d.department, d.qty, d.count, round2(d.share * 100)]))
  }

  const recv = [...title, ['รหัส', 'ชื่อยา', 'วันที่รับ', 'บริษัท', 'เลขบิล', 'Lot', 'ประเภท', 'จำนวนตามบิล', 'หน่วยตามบิล', 'จำนวน (หน่วยหลัก)', 'หน่วยหลัก', 'ราคา/หน่วย']]
  for (const r of reports) {
    for (const x of r.receipts) {
      recv.push([r.code, r.name, fmtThaiDate(x.date), x.supplier, x.billNumber, x.lot, x.purchaseType || '', x.qty, x.unit, num(x.qtyMain), r.mainUnit || '', x.price || ''])
    }
  }

  return [
    { name: 'สรุป', rows: summary, cols: [10, 34, 12, 10, 10, 10, 10, 16, 14, 12, 10, 12, 20, 10, 28, 10, 12, 12, 24, 36] },
    { name: 'รายเดือน', rows: monthly, cols: [10, 34, 12, ...months.map(() => 9), 10, 12] },
    { name: 'หน่วยงาน', rows: depts, cols: [10, 34, 12, 8, 26, 10, 8, 12] },
    { name: 'รับเข้า', rows: recv, cols: [10, 34, 12, 28, 18, 14, 14, 12, 12, 16, 12, 12] },
  ]
}

// ── ใบพิมพ์ (A4 ตั้ง — 1 ยาต่อหน้า) ─────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

export function usageReportHtml(reports = [], { printedBy = '', printedAt = new Date(), updatedAt = null } = {}) {
  const at = `${String(printedAt.getDate()).padStart(2, '0')}/${String(printedAt.getMonth() + 1).padStart(2, '0')}/${printedAt.getFullYear() + 543}`
  const section = (r, i) => {
    const u = unitShort(r.mainUnit)
    const max = Math.max(1, ...r.usage.monthly.map(m => m.qty))
    const low = lowestText(r.usage)
    return `
<section class="${i ? 'pb' : ''}">
  <h1>สรุปรับ-เบิกยา ช่วง ${esc(r.range.label)} (${r.range.months.length} เดือน)</h1>
  <h2>${esc(r.name)} <span class="code">${esc(r.code)}</span></h2>
  <table class="kv">
    <tr><th>คงเหลือ</th><td>${fmtQty(r.total)} ${esc(packUnitLabel(r.mainUnit))}${r.split.pending > 0 ? ` · รอตรวจรับ ${fmtQty(r.split.pending)}` : ''}${r.split.expired > 0 ? ` · หมดอายุ ${fmtQty(r.split.expired)}` : ''}</td></tr>
    <tr><th>เรท</th><td>${r.rate && r.rate.avgMonth > 0 ? `${fmtQty(r.rate.avgMonth)} ${esc(u)}/เดือน (${esc(r.rate.monthLabel)}) · คงอยู่ได้อีก ${esc(r.rate.coverage)}` : 'ไม่มีการเบิกใน 4 เดือนที่ปิดงวดแล้ว'}</td></tr>
    <tr><th>เบิกรวม</th><td>${fmtQty(r.usage.total)} ${esc(u)} · ${fmtQty(r.usage.count)} ครั้ง · ${r.usage.departments.length} หน่วยงาน</td></tr>
    <tr><th>เบิกมาก/น้อยสุด</th><td>${r.usage.top ? `${esc(r.usage.top.department)} ${fmtQty(r.usage.top.qty)}${low ? ` · น้อยสุด ${esc(low)}` : ''}` : '-'}</td></tr>
    <tr><th>แจ้งซื้อ</th><td>${esc(purchaseStatusText(r))}</td></tr>
  </table>
  <h3>ยอดเบิกรายเดือน (${esc(u)})</h3>
  <table class="grid"><thead><tr><th>เดือน</th><th class="n">จำนวน</th><th></th></tr></thead><tbody>
  ${r.usage.monthly.map(m => `<tr><td>${esc(m.label)}</td><td class="n">${fmtQty(m.qty)}</td><td class="barc"><span class="bar" style="width:${round2(m.qty / max * 100)}%"></span></td></tr>`).join('')}
  </tbody></table>
  <h3>หน่วยงานที่เบิก</h3>
  ${r.usage.departments.length ? `<table class="grid"><thead><tr><th class="n">#</th><th>หน่วยงาน</th><th class="n">จำนวน (${esc(u)})</th><th class="n">ครั้ง</th><th class="n">สัดส่วน</th></tr></thead><tbody>
  ${r.usage.departments.map((d, k) => `<tr><td class="n">${k + 1}</td><td>${esc(d.department)}</td><td class="n">${fmtQty(d.qty)}</td><td class="n">${d.count}</td><td class="n">${round2(d.share * 100)}%</td></tr>`).join('')}
  </tbody></table>` : '<p class="muted">ไม่มีการเบิกในช่วงนี้</p>'}
  ${nonDeptText(r.usage) ? `<p class="muted">รวมในยอดเบิก (ไม่ใช่หน่วยงาน): ${esc(nonDeptText(r.usage))}</p>` : ''}
  <h3>รับเข้าในช่วง${r.receiptBills.length ? ` (${r.receiptBills.length} บิล · ${r.receipts.length} lot)` : ''}</h3>
  ${r.receipts.length ? `<table class="grid"><thead><tr><th>วันที่รับ</th><th>บริษัท</th><th>เลขบิล</th><th>Lot</th><th class="n">จำนวน</th></tr></thead><tbody>
  ${r.receipts.map(x => `<tr><td>${fmtThaiDate(x.date)}</td><td>${esc(x.supplier)}</td><td>${esc(x.billNumber)}</td><td>${esc(x.lot)}</td><td class="n">${x.qtyMain != null ? `${fmtQty(x.qtyMain)} ${esc(u)}` : `${fmtQty(x.qty)} ${esc(unitLabel(x.unit))}`}</td></tr>`).join('')}
  </tbody></table>` : `<p class="muted">ไม่มีรับเข้าในช่วงนี้${r.lastReceipt ? ` — รับล่าสุด ${fmtThaiDate(r.lastReceipt.date)} ${esc(r.lastReceipt.supplier)}` : ''}</p>`}
  <p class="foot">พิมพ์ ${at}${printedBy ? ` โดย ${esc(printedBy)}` : ''}${updatedAt ? ` · ข้อมูลคงคลัง ณ ${fmtThaiDate(updatedAt)}` : ''}</p>
</section>`
  }
  return `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>สรุปรับ-เบิกยา</title>
<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 14mm 12mm; }
  body { font-family: 'Sarabun', sans-serif; font-size: 14px; color: #000; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 2px; font-weight: 700; }
  h2 { font-size: 18px; margin: 0 0 8px; font-weight: 700; }
  h3 { font-size: 14px; margin: 14px 0 4px; font-weight: 700; }
  .code { font-size: 13px; font-weight: 600; color: #333; }
  table { width: 100%; border-collapse: collapse; }
  .kv th { text-align: left; width: 130px; font-weight: 600; padding: 2px 6px 2px 0; vertical-align: top; }
  .kv td { padding: 2px 0; }
  .grid th { text-align: left; border-bottom: 2px solid #000; padding: 3px 6px; font-weight: 700; }
  .grid td { border-bottom: 1px solid #ccc; padding: 3px 6px; }
  .grid tr:nth-child(even) td { background: #f8fafc; }
  .n, .grid th.n { text-align: right; white-space: nowrap; }
  .barc { width: 45%; }
  .bar { display: inline-block; height: 9px; background: #64748b; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .muted { color: #555; margin: 2px 0; }
  .foot { margin-top: 14px; font-size: 12px; color: #444; }
  .pb { page-break-before: always; }
</style></head><body>
${reports.map(section).join('\n')}
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 400));</script>
</body></html>`
}
