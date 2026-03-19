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

Push-Location $projectRoot
try {
  $outputJs = 'public/wasm-synth/synthcore.js'
  $sourceFiles = Get-ChildItem 'native/synth-core' -Filter '*.c' | Sort-Object Name | ForEach-Object {
    (Join-Path 'native/synth-core' $_.Name).Replace('\', '/')
  }
  $emccArgs = @()
  $emccArgs += $sourceFiles
  $emccArgs += @(
    '-O3'
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

  & emcc @emccArgs

  if ($LASTEXITCODE -ne 0) {
    throw 'The synth emcc build failed.'
  }
} finally {
  Pop-Location
}
