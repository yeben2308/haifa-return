# Export input columns of mosadot-maklot.xlsx to JSON (UTF-8) for the initial load of the Google Sheet.
# Header names are read from the file itself (no Hebrew literals here - encoding safety).
param([string]$Src, [string]$Out)
$tmp = 'C:\Temp\maklot_export.xlsx'
Copy-Item -LiteralPath $Src $tmp -Force
$xl = New-Object -ComObject Excel.Application
$xl.Visible = $false; $xl.DisplayAlerts = $false
try {
  $wb = $xl.Workbooks.Open($tmp, 0, $true)
  $ws = $wb.Worksheets.Item(1)
  $data = $ws.UsedRange.Value2
  $nRows = $ws.UsedRange.Rows.Count
  # 1-based column positions in the sheet (see CLAUDE.md table; column 17 is an unnamed helper)
  # supervisor, authority, symbol, name, staff, students, classes, existing sqm, principal-capacity, notes, institution type, stages
  $cols = @(1, 2, 5, 6, 7, 8, 9, 11, 14, 16, 25, 26)
  $header = @(); foreach ($c in $cols) { $header += [string]$data[1, $c] }
  $rows = New-Object System.Collections.ArrayList
  for ($r = 2; $r -le $nRows; $r++) {
    $sym = $data[$r, 5]
    if ($null -eq $sym -or [string]$sym -eq '') { continue }
    $row = @(); foreach ($c in $cols) { $v = $data[$r, $c]; if ($null -eq $v) { $v = '' }; $row += [string]$v }
    [void]$rows.Add($row)
  }
  $obj = [ordered]@{ header = $header; symbolIndex = 2; rows = $rows; pulledAt = (Get-Item -LiteralPath $Src).LastWriteTime.ToString('s') }
  $json = $obj | ConvertTo-Json -Depth 5 -Compress
  [System.IO.File]::WriteAllText($Out, $json, (New-Object System.Text.UTF8Encoding($false)))
  "rows=$($rows.Count) cols=$($header.Count)"
} finally {
  if ($wb) { $wb.Close($false) }
  $xl.Quit()
}
