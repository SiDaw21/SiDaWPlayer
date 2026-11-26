# Сборка Windows-установщика SiDaW Player.
# Требования: Rust (rustup + MSVC build tools) и Inno Setup 6.
$ErrorActionPreference = 'Stop'
$rustRoot = Split-Path -Parent $PSScriptRoot
Push-Location $rustRoot

try {
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        throw 'cargo не найден. Установи Rust: https://rustup.rs (выбери toolchain x86_64-pc-windows-msvc).'
    }
    & (Join-Path $PSScriptRoot 'copy-assets.ps1')
    & cargo build --release
    if ($LASTEXITCODE -ne 0) { throw "cargo build завершился с кодом $LASTEXITCODE" }

    $iss = Join-Path $rustRoot 'installer\setup.iss'
    $iscc = (Get-Command iscc -ErrorAction SilentlyContinue).Source
    if (-not $iscc) {
        $iscc = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
    }
    if (-not (Test-Path $iscc)) {
        throw 'Inno Setup 6 не найден. Установи его: https://jrsoftware.org/isdl.php и запусти скрипт снова.'
    }
    & $iscc $iss
    if ($LASTEXITCODE -ne 0) { throw "ISCC завершился с кодом $LASTEXITCODE" }

    $setup = Join-Path $rustRoot 'installer\Output\SiDaWPlayer-setup.exe'
    Write-Host "Готово: $setup"
}
finally {
    Pop-Location
}
