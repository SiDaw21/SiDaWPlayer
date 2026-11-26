# Копирует демо-аудио из web-версии рядом с будущим exe (в инсталлятор).
$ErrorActionPreference = 'Stop'
$rustRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $rustRoot '..\sidaw-player\assets\audio'
$target = Join-Path $rustRoot 'assets\audio'

if (-not (Test-Path $source)) {
    throw "Не найдены демо-треки: $source"
}
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -Path (Join-Path $source '*.wav') -Destination $target -Force
Write-Host "Демо-аудио скопировано в $target"
