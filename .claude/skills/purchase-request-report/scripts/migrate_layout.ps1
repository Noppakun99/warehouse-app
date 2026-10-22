# ย้ายโครงรายงานจาก 20 คอลัมน์ (A–T) เป็น 24 คอลัมน์ (A–X) ครั้งเดียว — ข้อตกลง /grill-with-docs 22/10/2569
# ทำบน report.xlsx ใน WorkDir (สำเนาจาก snapshot.ps1) ก่อน pr.py plan · รันซ้ำบนไฟล์ที่ย้ายแล้ว = ไม่ทำอะไร
#   รายงาน: แทรก Q จุดสั่งซื้อ (ROP) · R เหตุผลที่แจ้ง · S คงอยู่ได้อีก (วัน) หลัง P คงเหลือ + W มูลค่าสั่ง (บาท) ก่อนหมายเหตุ
#   Sheet1: แทรกตำแหน่งเดียวกัน +1 คอลัมน์ (R:T และ X) ให้ copy แถวรายงาน A:X → Sheet1 B:Y ตรงกัน
#   A1 (เซลล์รวม A1:X3): ต่อท้ายกล่องเกณฑ์การแจ้งซื้อ
param([string]$WorkDir = (Join-Path $env:TEMP 'purchase-request-report'))
$ErrorActionPreference = 'Stop'
$path = Join-Path $WorkDir 'report.xlsx'
$CRITERIA = @(
  'เกณฑ์: เรท = เฉลี่ยยอดเบิก 3 เดือนล่าสุด ÷ 30.4 (วันเฉลี่ยต่อเดือน) · Safety Stock = ใช้ 2 เดือน (Avg/วัน × 30 × 2) · จุดสั่งซื้อ (ROP) = Safety Stock + Avg/วัน × (Lead Time + 7 วันรอบแจ้งซื้อ)',
  'แจ้งซื้อเมื่อ: หมดสต็อค · คงเหลือ ≤ จุดสั่งซื้อ · lot ที่ exp ไกลสุดเหลือ ≤ 240 วัน · จำนวนแนะนำ = MIN(Max×3, MAX(Max×2, ROP)) − คงเหลือ · คงอยู่ได้อีก = คงเหลือ ÷ Avg/วัน',
  'ด่วน (อักษรสีแดง) = หมดสต็อค / คงอยู่ได้อีก ≤ Lead Time / หน่วยงานขอเบิกภายใน 14 วันแล้วไม่ได้ของหรือได้ไม่ครบ · "ถึงเกณฑ์พอแล้ว" = คงเหลือเกินจุดสั่งซื้อแล้วแต่ยังไม่มีของซื้อเข้า พิจารณายกเลิกแจ้ง'
) -join "`n"

$xl = New-Object -ComObject Excel.Application; $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.EnableEvents = $false
try {
  $wb = $xl.Workbooks.Open($path); $rp = $wb.Worksheets.Item('รายงานซื้อยา'); $s1 = $wb.Worksheets.Item('Sheet1')
  $q4 = ([string]$rp.Range('Q4').Text).Trim()
  if ($q4.StartsWith('จุดสั่งซื้อ')) { 'ย้ายโครงแล้ว — ไม่ทำอะไร'; $wb.Close($false); return }
  if (-not ([string]$rp.Range('P4').Text).Trim().StartsWith('คงเหลือ') -or -not $q4.StartsWith('ยอดเบิก รวม') -or
      -not ([string]$rp.Range('S4').Text).Trim().StartsWith('จำนวนแนะนำ') -or -not ([string]$rp.Range('T4').Text).Trim().StartsWith('หมายเหตุ') -or
      ([string]$rp.Range('U4').Text).Trim() -ne '') {
    throw 'หัวคอลัมน์ P/Q/S/T/U ไม่ใช่โครงเดิม 20 คอลัมน์ — หยุด'
  }
  $lo = $rp.ListObjects.Item(1); $n0 = $lo.ListRows.Count
  $s1last = $s1.Cells($s1.Rows.Count, 6).End(-4162).Row

  $null = $rp.Range('Q:S').EntireColumn.Insert()
  $null = $rp.Range('W:W').EntireColumn.Insert()
  $null = $s1.Range('R:T').EntireColumn.Insert()
  $null = $s1.Range('X:X').EntireColumn.Insert()

  $rp.Range('Q4').Formula = 'จุดสั่งซื้อ (ROP)'
  $rp.Range('R4').Formula = 'เหตุผลที่แจ้ง'
  $rp.Range('S4').Formula = 'คงอยู่ได้อีก (วัน)'
  $rp.Range('W4').Formula = 'มูลค่าสั่ง (บาท)'
  $rp.Columns('Q').ColumnWidth = 12; $rp.Columns('R').ColumnWidth = 24; $rp.Columns('S').ColumnWidth = 12; $rp.Columns('W').ColumnWidth = 14
  $rp.Range('R:R').WrapText = $true
  foreach ($c in 'Q', 'S') { $rp.Range("${c}5:${c}$(4 + $n0)").NumberFormat = '#,##0' }
  $rp.Range("W5:W$(4 + $n0)").NumberFormat = '#,##0.00'

  $a1 = $rp.Range('A1')
  $a1.Formula = ([string]$a1.Formula).Split("`n")[0] + "`n" + $CRITERIA
  $a1.MergeArea.WrapText = $true; $a1.MergeArea.VerticalAlignment = -4160
  foreach ($r in 1..3) { $rp.Rows($r).RowHeight = 34 }

  # ด่านหลังย้าย
  $want = @{ P = 'คงเหลือ'; Q = 'จุดสั่งซื้อ'; R = 'เหตุผลที่แจ้ง'; S = 'คงอยู่ได้อีก'; T = 'ยอดเบิก รวม'; U = 'ยอดเบิก 3'; V = 'จำนวนแนะนำ'; W = 'มูลค่าสั่ง'; X = 'หมายเหตุ' }
  foreach ($k in $want.Keys) { if (-not ([string]$rp.Range("${k}4").Text).Trim().StartsWith($want[$k])) { throw "หัว ${k}4 = '$($rp.Range("${k}4").Text)' ไม่ใช่ '$($want[$k])'" } }
  if ($lo.ListRows.Count -ne $n0) { throw 'จำนวนแถวตารางเปลี่ยน' }
  if (-not ([string]$lo.Range.Address()).EndsWith("`$X`$$(4 + $n0)")) { throw "ตารางไม่ครอบ A:X ($($lo.Range.Address()))" }
  if ([string]$rp.Range('A1').MergeArea.Address() -ne '$A$1:$X$3') { throw "เซลล์รวมหัว = $($rp.Range('A1').MergeArea.Address())" }
  if ($s1.Cells($s1.Rows.Count, 6).End(-4162).Row -ne $s1last) { throw 'Sheet1 แถวสุดท้ายเปลี่ยน' }
  $wb.Save()
  "MIGRATED: รายงาน $n0 แถว ตาราง $($lo.Range.Address()) · Sheet1 ถึงแถว $s1last"
} catch {
  "ERROR บรรทัด $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"; throw
} finally {
  if ($wb) { try { $wb.Close($false) } catch {} }; $xl.Quit(); [Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
