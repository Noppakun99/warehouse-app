# ย้ายกล่องเกณฑ์จากหัวเขียว A1:X3 ไปชีทแยก "เกณฑ์การสั่งซื้อ" + ขยายคอลัมน์ R/X + ความสูงแถวพอดี (user สั่ง 12/11/2569)
# ครั้งเดียว · รันซ้ำ = ไม่ทำอะไร · ทำบนสำเนาเท่านั้น (ห้ามเปิดไฟล์ใน OneDrive — AutoSave)
# ข้อความเกณฑ์ใน A1 เดิมต้องตรงกับที่สคริปต์รู้จัก ไม่งั้นหยุด (กันเกณฑ์ตกหล่นแบบเงียบ)
# แถว 11–12 (ถึงเกณฑ์พอแล้ว · เพดานพื้นที่) pr.py เขียนใหม่ทุกรอบ = CRIT_CELLS
param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference = 'Stop'
$SHEET = 'เกณฑ์การสั่งซื้อ'
$STATIC = @(
  @('เรท', 'เฉลี่ยยอดเบิก 3 เดือนล่าสุด ÷ 30.4 (วันเฉลี่ยต่อเดือน)'),
  @('Safety Stock', 'ใช้ 2 เดือน (Avg/วัน × 30 × 2)'),
  @('จุดสั่งซื้อ (ROP)', 'Safety Stock + Avg/วัน × (Lead Time + 7 วันรอบแจ้งซื้อ)'),
  @('แจ้งซื้อเมื่อ', 'หมดสต็อค · คงเหลือ ≤ จุดสั่งซื้อ · lot ที่ exp ไกลสุดเหลือ ≤ 240 วัน'),
  @('จำนวนแนะนำ', 'MIN(Max×3, MAX(Max×2, ROP)) − คงเหลือ'),
  @('คงอยู่ได้อีก', 'คงเหลือ ÷ Avg/วัน'),
  @('ด่วน (อักษรสีแดง)', 'หมดสต็อค / คงอยู่ได้อีก ≤ Lead Time / หน่วยงานขอเบิกภายใน 14 วันแล้วไม่ได้ของหรือได้ไม่ครบ')
)
$MINH = 24.95
$xl = New-Object -ComObject Excel.Application; $xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($Path); $rp = $wb.Worksheets.Item('รายงานซื้อยา')
  if (@($wb.Worksheets | ForEach-Object { $_.Name }) -contains $SHEET) { "มีชีท $SHEET แล้ว — ไม่ทำอะไร"; $wb.Close($false); return }
  $lines = ([string]$rp.Range('A1').Formula) -split "`n"
  if ($lines.Count -ne 5) { throw "A1 มี $($lines.Count) บรรทัด (คาด 5)" }
  $s = $STATIC
  $exp2 = "เกณฑ์: $($s[0][0]) = $($s[0][1]) · $($s[1][0]) = $($s[1][1]) · $($s[2][0]) = $($s[2][1])"
  $exp3 = "$($s[3][0]): $($s[3][1]) · $($s[4][0]) = $($s[4][1]) · $($s[5][0]) = $($s[5][1])"
  $pre4 = "$($s[6][0]) = $($s[6][1]) · `"ถึงเกณฑ์พอแล้ว`" = "
  if ($lines[1] -ne $exp2) { throw "A1 บรรทัด 2 ไม่ตรง: $($lines[1])" }
  if ($lines[2] -ne $exp3) { throw "A1 บรรทัด 3 ไม่ตรง: $($lines[2])" }
  if (-not $lines[3].StartsWith($pre4)) { throw "A1 บรรทัด 4 ไม่ตรง: $($lines[3])" }
  if (-not $lines[4].StartsWith('เพดานพื้นที่ (')) { throw "A1 บรรทัด 5 ไม่ใช่เพดานพื้นที่: $($lines[4])" }
  $enough = $lines[3].Substring($pre4.Length)
  $ceil = $lines[4] -split ': ', 2

  $ws = $wb.Worksheets.Add([Type]::Missing, $rp); $ws.Name = $SHEET
  $ws.Range('A1').Formula = 'เกณฑ์การแจ้งสั่งซื้อยา (ใช้กับชีท รายงานซื้อยา)'
  $ws.Range('A1').Font.Size = 14; $ws.Range('A1').Font.Bold = $true
  $ws.Range('A1:B1').Interior.Color = $rp.Range('A1').Interior.Color; $ws.Range('A1').Font.Color = $rp.Range('A1').Font.Color
  $ws.Range('A3').Formula = 'หัวข้อ'; $ws.Range('B3').Formula = 'วิธีคิด'
  $r = 4
  foreach ($x in $STATIC) { $ws.Range("A$r").Formula = [string]$x[0]; $ws.Range("B$r").Formula = [string]$x[1]; $r++ }
  $ws.Range("A$r").Formula = 'ถึงเกณฑ์พอแล้ว'; $ws.Range("B$r").Formula = [string]$enough; $r++
  $ws.Range("A$r").Formula = [string]$ceil[0]; $ws.Range("B$r").Formula = [string]$ceil[1]
  if ($r -ne 12) { throw "แถวสุดท้าย $r (pr.py CRIT_CELLS คาด 12)" }
  $t = $ws.Range('A3:B12')
  $t.Font.Size = 12; $t.VerticalAlignment = -4108; $t.WrapText = $true; $t.Borders.LineStyle = 1
  $ws.Range('A3:B3').Font.Bold = $true; $ws.Range('A3:B3').Interior.Color = $rp.Range('A4').Interior.Color; $ws.Range('A3:B3').Font.Color = $rp.Range('A4').Font.Color
  $ws.Range('A4:A12').Font.Bold = $true
  $ws.Columns('A').ColumnWidth = 34; $ws.Columns('B').ColumnWidth = 110
  $null = $ws.Range('A3:B12').Rows.AutoFit()
  "ชีท $SHEET : 9 หัวข้อ (แถว 4-12)"

  # หัวเขียวเหลือบรรทัดเดียว + ชี้ไปชีทเกณฑ์
  $rp.Range('A1').Formula = [string]"$($lines[0]) ,วิธีคิดดูชีท $SHEET"
  foreach ($i in 1..3) { $rp.Rows($i).RowHeight = 14 }
  "A1: $($rp.Range('A1').Text)"

  # เหตุผล (R) / หมายเหตุ (X) กว้างขึ้น แถวยาวไม่เกิน 2–3 บรรทัด → ความสูงพอดีทุกแถว ต่ำสุดเท่าแถวปกติ
  $rp.Columns('R').ColumnWidth = 55; $rp.Columns('X').ColumnWidth = 50
  $lo = $rp.ListObjects.Item(1); $last = 4 + $lo.ListRows.Count
  $null = $rp.Range("A5:X$last").Rows.AutoFit()
  for ($i = 5; $i -le $last; $i++) { if ($rp.Rows($i).RowHeight -lt $MINH) { $rp.Rows($i).RowHeight = $MINH } }
  "R=55 X=50 · autofit 5-$last"
  $rp.Activate(); $rp.Range('A1').Select()
  $wb.Save(); 'SAVED'
} catch {
  "ERROR บรรทัด $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"; throw
} finally {
  if ($wb) { try { $wb.Close($false) } catch {} }; $xl.Quit(); [Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
