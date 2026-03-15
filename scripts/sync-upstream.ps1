param(
  [string]$SourceRoot
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$vendorRoot = Join-Path $projectRoot 'vendor\p2-clone'

if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Join-Path $projectRoot '..\external_repos\p2-clone'
}

$SourceRoot = [System.IO.Path]::GetFullPath($SourceRoot)

if (-not (Test-Path $SourceRoot)) {
  throw "Upstream source directory was not found: $SourceRoot"
}

New-Item -ItemType Directory -Force $vendorRoot | Out-Null

Copy-Item -Recurse -Force (Join-Path $SourceRoot 'src') (Join-Path $vendorRoot 'src')
Copy-Item -Recurse -Force (Join-Path $SourceRoot 'release\other') (Join-Path $vendorRoot 'release\other')
Copy-Item -Force (Join-Path $SourceRoot 'LICENSE') (Join-Path $vendorRoot 'LICENSE')
Copy-Item -Force (Join-Path $SourceRoot 'README.md') (Join-Path $vendorRoot 'README.md')
