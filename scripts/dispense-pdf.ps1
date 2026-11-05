# PDF แถวเบิกจากชีท 'เบิก ' (ยอดคลังยา_69.xlsm) — 1 ใบเบิก = 1 ไฟล์
#   -SortLog  = เรียงตาม log (MainLog แล้ว DetailedLog) ฉบับคลังของใบยาห้องยา1/ห้องยาG · ไม่ใส่ = เรียงตามใบ
#   -Sig      = "รหัส|lot|N|หน่วยงาน ; …" ของทุกแถว ต้องตรงก่อนทำ (กันเลขแถวขยับ)
# เลขรับใบเบิก (คอลัมน์ AD) ขึ้นหัวกระดาษกลางอัตโนมัติ — ทุกแถวต้องเลขเดียวกัน หรือว่างทั้งหมด (ใบก่อน 12/10/2569)
# เปิดไฟล์แบบอ่านอย่างเดียว ไม่ Save · ใช้สำเนาใน scratchpad ได้ (ไฟล์ใน OneDrive เปิด ReadOnly ก็ได้)
# ไฟล์นี้ต้องเซฟเป็น UTF-8 with BOM (PowerShell 5.1 อ่าน path ภาษาไทย)
param([string]$StockPath, [string]$LogPath, [string]$Out, [string]$Rows, [string]$Sig, [string]$Title, [switch]$SortLog)
$RowList = @($Rows -split ',' | ForEach-Object { [int]$_ })
$ErrorActionPreference = 'Stop'
$log = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $log.Add($m); $log | Out-File -FilePath $LogPath -Encoding utf8 }
function Invoke-Retry([scriptblock]$sb, [string]$what) {
  for ($try = 0; $try -lt 10; $try++) { try { & $sb; return } catch { $last = $_; Start-Sleep -Milliseconds 700 } }
  throw "failed: $what - $($last.Exception.Message)"
}
$xl = New-Object -ComObject Excel.Application
try {
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.ScreenUpdating = $false
  $xl.AutomationSecurity = 3; $xl.EnableEvents = $false
  $blank = $xl.Workbooks.Add(); $xl.Calculation = -4135
  $wb = $xl.Workbooks.Open($StockPath, 0, $true)
  $ws = $wb.Worksheets.Item('เบิก ')
  # PowerShell ไม่สนตัวพิมพ์: ห้ามตั้งชื่อ $sig ทับพารามิเตอร์ $Sig (เคยทำให้ด่านนี้ผ่านเสมอ — แก้ 05/11/2569)
  $actualRows = @(); foreach ($r in $RowList) { $actualRows += "$($ws.Range("E$r").Value2)|$($ws.Range("J$r").Value2)|$($ws.Range("N$r").Value2)|$($ws.Range("P$r").Value2)" }
  Say ("rows: " + ($actualRows -join ' ; '))
  if (($actualRows -join ' ; ') -ne $Sig) { throw 'row signature mismatch' }
  if ("$($ws.Range('AD6').Value2)" -ne 'เลขรับใบเบิก') { throw 'AD6 is not เลขรับใบเบิก' }
  $nos = @($RowList | ForEach-Object { "$($ws.Range("AD$_").Value2)".Trim() } | Sort-Object -Unique)
  if ($nos.Count -gt 1) { throw "rows have different เลขรับใบเบิก: $($nos -join ', ')" }
  [string]$reqNo = $nos[0]
  Say "เลขรับใบเบิก: [$reqNo]"

  if (Test-Path $Out) { throw "PDF exists already: $Out" }
  $nb = $xl.Workbooks.Add(); $ns = $nb.Worksheets.Item(1)
  Invoke-Retry { $null = $ws.Range('B6:Q6').Copy($ns.Range('A1')) } 'copy header'
  $dr = 2
  foreach ($rr in $RowList) { Invoke-Retry { $null = $ws.Range("B${rr}:Q$rr").Copy($ns.Range("A$dr")) } "copy row $rr"; $dr++ }
  # user ตกลง 05/11/2569: ตัวอักษรบนกระดาษ 10 พอยท์ (เดิม 8) — ตั้งความกว้างเองไม่ใช้ของชีท ให้รวมแล้ว Excel ย่อเหลือ 50% (ชีทตัวอักษร 20) · ปัดเป็น 49% = 9.8 พอยท์
  $pdfW = @(18.75,18.13,17.5,15,17,35,15,13,18.5,19,18,13.5,12,13.5,15,52)
  for ($c = 0; $c -lt 16; $c++) { $ns.Columns.Item($c + 1).ColumnWidth = [double]$pdfW[$c] }
  $ns.Rows.Item(1).RowHeight = $ws.Rows.Item(6).RowHeight
  # ความสูงขั้นต่ำ 56 ที่สเกล 50% = 28 พอยท์บนกระดาษ เท่าฉบับเดิม (70 × 40%) จำนวนหน้าจึงไม่เพิ่ม
  [double]$rowMin = 56
  $n = $RowList.Count
  if ($SortLog) {
    # Excel sort ไม่สนขีด: E-10 < E-11 < E-1-3 · ห้องประชุม/ตู้เย็นอยู่ท้าย
    $mis = [System.Reflection.Missing]::Value
    Invoke-Retry { $null = $ns.Range("A2:P$($n + 1)").Sort($ns.Range('B2'), 1, $ns.Range('C2'), $mis, 1, $mis, 1, 2) } 'sort'
    for ($k = 2; $k -le $n + 1; $k++) { $null = $ns.Rows.Item($k).AutoFit(); if ($ns.Rows.Item($k).RowHeight -lt $rowMin) { $ns.Rows.Item($k).RowHeight = $rowMin } }
    $ord = @(); for ($k = 2; $k -le $n + 1; $k++) { $ord += "$($ns.Range("C$k").Value2)|$($ns.Range("D$k").Value2)" }
    Say ("sorted: " + ($ord -join ' ; '))
    if ($ord.Count -ne $n) { throw 'row count changed after sort' }
  } else {
    for ($k = 2; $k -le $n + 1; $k++) { $null = $ns.Rows.Item($k).AutoFit(); if ($ns.Rows.Item($k).RowHeight -lt $rowMin) { $ns.Rows.Item($k).RowHeight = $rowMin } }
  }
  $ns.Columns.Item(2).Hidden = $true; $ns.Columns.Item(5).Hidden = $true
  $ps = $ns.PageSetup
  Invoke-Retry {
    $ps.PaperSize = 9; $ps.Orientation = 2; $ps.Zoom = $false; $ps.FitToPagesWide = 1; $ps.FitToPagesTall = $false
    $ps.LeftMargin = $xl.InchesToPoints(0.157); $ps.RightMargin = $xl.InchesToPoints(0.079)
    $ps.TopMargin = $xl.InchesToPoints(0.906); $ps.BottomMargin = $xl.InchesToPoints(0.551)
    $ps.HeaderMargin = $xl.InchesToPoints(0.512); $ps.FooterMargin = $xl.InchesToPoints(0.197)
    $ps.CenterHorizontally = $true; $ps.PrintTitleRows = '$1:$1'
    $ps.LeftHeader = ('&"-,Bold"&36' + $Title)
    if ($reqNo -ne '') { $ps.CenterHeader = ('&"-,Bold"&36เลขที่ ' + $reqNo) } else { $ps.CenterHeader = '' }
    $ps.RightHeader = '&"-,Bold"&36&D เวลา:&T'
    $ps.CenterFooter = '&20&P'
  } 'page setup'
  Invoke-Retry { $nb.ExportAsFixedFormat(0, $Out) } "export"
  $nb.Close($false); Say "PDF $Out"
  $wb.Close($false); $blank.Close($false)
}
catch { Say "ERROR: $($_.Exception.Message) @ line $($_.InvocationInfo.ScriptLineNumber)"; try { foreach ($w in @($xl.Workbooks)) { $w.Close($false) } } catch {} }
finally { $xl.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null; Say 'DONE' }
