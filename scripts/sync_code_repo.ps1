param(
  [string]$RemoteUrl = "git@github.com:Steppenwoolf/broant-code.git",
  [string]$Branch = "main",
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $RepoRoot

$files = git ls-files | Where-Object {
  (
    $_ -match '^(src|entrypoints|packages/mcp/src|docs)/' -or
    $_ -in @('AGENTS.md', 'CLAUDE.md', 'README.md', 'package.json', 'packages/mcp/package.json', 'tsconfig.json', 'wxt.config.ts')
  ) -and
  $_ -notmatch '(__tests__|payloads|scenarios)' -and
  $_ -notmatch '\.(png|jpg|jpeg|webp|gif|svg|ico|gz|zip)$'
}

$tmpDir = Join-Path $env:TEMP "broant-code-sync"
if (Test-Path $tmpDir) { Remove-Item -Recurse -Force $tmpDir }
New-Item -ItemType Directory -Path $tmpDir | Out-Null

$totalBytes = 0
foreach ($rel in $files) {
  $src = Join-Path $RepoRoot $rel
  if (-not (Test-Path $src)) { continue }
  $dst = Join-Path $tmpDir $rel
  $dstParent = Split-Path -Parent $dst
  if (-not (Test-Path $dstParent)) { New-Item -ItemType Directory -Path $dstParent -Force | Out-Null }
  Copy-Item -Path $src -Destination $dst -Force
  $totalBytes += (Get-Item $src).Length
}

Write-Output ("Prepared " + $files.Count + " files (" + [math]::Round($totalBytes / 1MB, 2) + " MB) in " + $tmpDir)

if ($DryRun) {
  Remove-Item -Recurse -Force $tmpDir
  exit 0
}

$srcCommit = git rev-parse --short HEAD
Push-Location $tmpDir
try {
  git init -b $Branch | Out-Null
  git add -A
  git commit -m "sync: clean code snapshot from broant@$srcCommit" | Out-Null
  git remote add origin $RemoteUrl
  git push -u --force origin $Branch
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
}
