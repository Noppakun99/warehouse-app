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
  Say "new workbook sheets = $($nb.Worksheets.Count) name = $($nb.Worksheets.Item(1).Name)"
  $links = $nb.LinkSources(1)
  if ($links) { foreach ($l in $links) { Say "break link $l"; $nb.BreakLink($l, 1) } }
  $nb.SaveAs($Dest, 51)
  Say "SAVED $Dest"
  $nb.Close($false); $wb.Close($false)
}
catch { Say "ERROR: $($_.Exception.Message)"; try { foreach ($w in @($xl.Workbooks)) { $w.Close($false) } } catch {} }
finally { $xl.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null; Say 'DONE' }
