; Inno Setup 6 — установщик SiDaW Player (Rust edition)
#define MyAppName "SiDaW Player"
#define MyAppVersion "0.4.0"
#define MyAppPublisher "SiDaW"
#define MyAppExeName "sidaw-player.exe"

[Setup]
AppId={{4D8B9C10-6E2F-4D58-9E1A-7A5C3F0B2D41}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
OutputDir=Output
OutputBaseFilename=SiDaWPlayer-setup
Compression=lzma2
SolidCompression=yes
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayIcon={app}\{#MyAppExeName}

[Languages]
Name: "russian"; MessagesFile: "compiler:Languages\Russian.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Создать ярлык на рабочем столе / Create desktop shortcut"; GroupDescription: "Дополнительно / Additional"

[Files]
Source: "..\target\release\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\assets\audio\*.wav"; DestDir: "{app}\assets\audio"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Запустить SiDaW Player / Launch SiDaW Player"; Flags: postinstall nowait skipifsilent
