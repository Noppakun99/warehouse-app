param([string]$Src, [string]$Dest, [string]$LogPath)
$ErrorActionPreference = 'Stop'
$log = New-Object System.Collections.Generic.List[string]
function Say([string]$m) { $log.Add($m); $log | Out-File -FilePath $LogPath -Encoding utf8 }
if (Test-Path $Dest) { Say "exists $Dest"; exit 1 }
$xl = New-Object -ComObject Excel.Application
try {
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.AskToUpdateLinks = $false; $xl.EnableEvents = $false
  $wb = $xl.Workbooks.Open($Src, 0)
  $ws = $wb.Worksheets.Item('รายงานซื้อยา')
  $ws.Copy()
  $nb = $xl.ActiveWorkbook
  # ชีทเกณฑ์ (ตั้งแต่ 12/11/2569) ไปด้วย — หัวหน้าดูวิธีคิดได้ในไฟล์เดียวกัน
  if (@($wb.Worksheets | ForEach-Object { $_.Name }) -contains 'เกณฑ์การสั่งซื้อ') {
    $wb.Worksheets.Item('เกณฑ์การสั่งซื้อ').Copy([Type]::Missing, $nb.Worksheets.Item(1))
    $nb.Worksheets.Item(1).Activate()
  }
  # ชีทพื้นที่เก็บยา (ตั้งแต่ 12/11/2569) ต่อท้ายชีทเกณฑ์
  if (@($wb.Worksheets | ForEach-Object { $_.Name }) -contains 'พื้นที่เก็บยา') {
    $wb.Worksheets.Item('พื้นที่เก็บยา').Copy([Type]::Missing, $nb.Worksheets.Item($nb.Worksheets.Count))
    $nb.Worksheets.Item(1).Activate()
  }
  Say "new workbook sheets = $($nb.Worksheets.Count) name = $($nb.Worksheets.Item(1).Name)"
  $links = $nb.LinkSources(1)
  if ($links) { foreach ($l in $links) { Say "break link $l"; $nb.BreakLink($l, 1) } }
  $nb.SaveAs($Dest, 51)
  Say "SAVED $Dest"
  $nb.Close($false); $wb.Close($false)
}
catch { Say "ERROR: $($_.Exception.Message)"; try { foreach ($w in @($xl.Workbooks)) { $w.Close($false) } } catch {} }
finally { $xl.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null; Say 'DONE' }
