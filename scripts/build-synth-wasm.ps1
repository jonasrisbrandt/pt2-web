param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$nativeRoot = Join-Path $projectRoot 'native\synth-core'
$outDir = Join-Path $projectRoot 'public\wasm-synth'

if (-not (Get-Command emcc -ErrorAction SilentlyContinue)) {
  throw "Emscripten compiler 'emcc' was not found in PATH."
}

if (-not (Test-Path (Join-Path $nativeRoot 'synthcore.c'))) {
  throw "Synth core source is missing from native\\synth-core."
}

New-Item -ItemType Directory -Force $outDir | Out-Null

function Invoke-SynthEmccBuild {
  param(
    [Parameter(Mandatory = $true)]
    [string]$OptimizationLevel
  )

  $outputJs = 'public/wasm-synth/synthcore.js'
  $sourceFiles = Get-ChildItem 'native/synth-core' -Filter '*.c' | Sort-Object Name | ForEach-Object {
    (Join-Path 'native/synth-core' $_.Name).Replace('\', '/')
  }

  $emccArgs = @()
  $emccArgs += $sourceFiles
  $emccArgs += @(
    $OptimizationLevel
    '-sALLOW_MEMORY_GROWTH=1'
    '-sSTACK_SIZE=1048576'
    '-sMODULARIZE=1'
    '-sEXPORT_ES6=1'
    '-sEXPORT_NAME=createSynthCoreModule'
    '-sENVIRONMENT=web'
    '-sEXPORT_ALL=1'
    "-sEXPORTED_RUNTIME_METHODS=['ccall']"
    "-sEXPORTED_FUNCTIONS=['_malloc','_free','_pt2_synth_boot','_pt2_synth_reset','_pt2_synth_set_synth','_pt2_synth_set_param','_pt2_synth_note_on','_pt2_synth_note_off','_pt2_synth_panic','_pt2_synth_render_preview','_pt2_synth_preview_buffer','_pt2_synth_preview_buffer_length','_pt2_synth_render_sample','_pt2_synth_sample_buffer','_pt2_synth_sample_buffer_length','_pt2_synth_telemetry_buffer','_pt2_synth_telemetry_buffer_length']"
    '-o'
    $outputJs
  )

  $buildOutput = & emcc @emccArgs 2>&1
  $exitCode = $LASTEXITCODE

  foreach ($line in $buildOutput) {
    Write-Host $line
  }

  return [PSCustomObject]@{
    ExitCode = $exitCode
    Output = ($buildOutput -join [Environment]::NewLine)
    OptimizationLevel = $OptimizationLevel
  }
}

function Test-IsBinaryenPolicyBlock {
  param(
    [Parameter(Mandatory = $true)]
    [string]$BuildOutput
  )

  return $BuildOutput -match 'wasm-opt' -and (
    $BuildOutput -match 'WinError 4551' -or
    $BuildOutput -match 'is blocked by policy' -or
    $BuildOutput -match 'The file cannot be accessed by the system'
  )
}

Push-Location $projectRoot
try {
  $preferredBuild = Invoke-SynthEmccBuild -OptimizationLevel '-O3'

  if ($preferredBuild.ExitCode -eq 0) {
    Write-Host 'Synth wasm build completed with release optimization (-O3).'
    return
  }

  if (-not (Test-IsBinaryenPolicyBlock -BuildOutput $preferredBuild.Output)) {
    throw 'The synth emcc build failed.'
  }

  Write-Warning 'Binaryen post-link optimization was blocked by local policy. Retrying synth wasm build with -O1 to produce usable synced wasm artifacts.'
  $fallbackBuild = Invoke-SynthEmccBuild -OptimizationLevel '-O1'

  if ($fallbackBuild.ExitCode -ne 0) {
    throw 'The synth emcc build failed.'
  }

  Write-Warning 'Synth wasm build completed with fallback optimization (-O1). Release-level Binaryen optimization is still unavailable on this machine.'
} finally {
  Pop-Location
}
