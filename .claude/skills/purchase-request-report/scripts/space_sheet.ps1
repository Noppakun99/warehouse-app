# สร้าง/อัพเดตชีท "พื้นที่เก็บยา" จาก space.json (pr.py space) — user สั่ง 12/11/2569
# ทำบนสำเนาเท่านั้น (ห้ามเปิดไฟล์ใน OneDrive — AutoSave) · รันซ้ำ = เขียนตารางใหม่ทั้งชีท
param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$Json)
$ErrorActionPreference = 'Stop'
$j = Get-Content -Raw -Encoding UTF8 $Json | ConvertFrom-Json
$SHEET = [string]$j.sheet; $r0 = [int]$j.row0; $rows = @($j.rows)
$xl = New-Object -ComObject Excel.Application; $xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($Path); $rp = $wb.Worksheets.Item('รายงานซื้อยา')
  $names = @($wb.Worksheets | ForEach-Object { $_.Name })
  if ($names -contains $SHEET) { $ws = $wb.Worksheets.Item($SHEET); $null = $ws.Cells.Clear() }
  else {
    $after = $rp; if ($names -contains 'เกณฑ์การสั่งซื้อ') { $after = $wb.Worksheets.Item('เกณฑ์การสั่งซื้อ') }
    $ws = $wb.Worksheets.Add([Type]::Missing, $after); $ws.Name = $SHEET
  }
  $ws.Range('A1').Formula = [string]"พื้นที่เก็บยา $($rows.Count) รายการที่ห้องเก็บจำกัด (ใช้คิดเพดานพื้นที่ในชีท รายงานซื้อยา)"
  $ws.Range('A1').Font.Size = 14; $ws.Range('A1').Font.Bold = $true
  $ws.Range('A1:G1').Interior.Color = $rp.Range('A1').Interior.Color; $ws.Range('A1').Font.Color = $rp.Range('A1').Font.Color
  $ws.Range('A2').Formula = 'พื้นที่เก็บได้ = จำนวนลังที่วางได้ × จำนวนต่อลัง ,วิธีคิดเพดานดูชีท เกณฑ์การสั่งซื้อ ,รายการนอกตารางนี้ใช้เกณฑ์ปกติ'
  $h = @('ลำดับ', 'รหัส', 'รายการยา', 'หน่วย', 'วางได้ (ลัง)', 'จำนวนต่อลัง', 'พื้นที่เก็บได้')
  for ($c = 0; $c -lt 7; $c++) { $ws.Cells.Item($r0 - 1, $c + 1).Formula = [string]$h[$c] }
  $ws.Range("B$r0:B$($r0 + $rows.Count - 1)").NumberFormat = '@'
  $i = 0
  foreach ($x in $rows) {
    $r = $r0 + $i; $i++
    $ws.Cells.Item($r, 1).Value2 = [double]$i
    $ws.Cells.Item($r, 2).Formula = [string]$x.code
    $ws.Cells.Item($r, 3).Formula = [string]$x.name
    $ws.Cells.Item($r, 4).Formula = [string]$x.unit
    $ws.Cells.Item($r, 5).Value2 = [double]$x.cases
    $ws.Cells.Item($r, 6).Value2 = [double]$x.per
    $ws.Cells.Item($r, 7).Value2 = [double]$x.space
  }
  $last = $r0 + $rows.Count - 1
  $t = $ws.Range("A$($r0 - 1):G$last")
  $t.Font.Size = 12; $t.VerticalAlignment = -4108; $t.Borders.LineStyle = 1
  $hd = $ws.Range("A$($r0 - 1):G$($r0 - 1)")
  $hd.Font.Bold = $true; $hd.HorizontalAlignment = -4108; $hd.WrapText = $true
  $hd.Interior.Color = $rp.Range('A4').Interior.Color; $hd.Font.Color = $rp.Range('A4').Font.Color
  $ws.Range("A${r0}:B$last").HorizontalAlignment = -4108; $ws.Range("D${r0}:D$last").HorizontalAlignment = -4108
  $ws.Range("E${r0}:G$last").NumberFormat = '#,##0'
  $w = @(8, 12, 52, 14, 14, 14, 16)
  for ($c = 0; $c -lt 7; $c++) { $ws.Columns($c + 1).ColumnWidth = $w[$c] }
  $rp.Activate(); $rp.Range('A1').Select()
  $wb.Save(); "SAVED ชีท $SHEET : $($rows.Count) รายการ (แถว $r0-$last)"
} catch {
  "ERROR บรรทัด $($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"; throw
} finally {
  if ($wb) { try { $wb.Close($false) } catch {} }; $xl.Quit(); [Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
}
