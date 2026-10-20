; Windows-Installer (Inno Setup 6) fuer die Desktop-Programme der
; Flutter-Apps - Mitglieder-App und FWV Musik. Ein Skript fuer beide; was
; sich unterscheidet, kommt beim Aufruf als /D... aus dem Workflow:
;
;   iscc /DAppName="FWV Raura" /DAppId="{{...}" /DExeName=fwv_mitglieder.exe ^
;        /DVersion=1.2.3 /DQuelle=<Release-Ordner> /DSymbol=<app_icon.ico> ^
;        /DZiel=<Ausgabeordner> /DDatei=<Dateiname ohne .exe> windows-setup.iss
;
; Installiert ohne Administratorrechte ins Benutzerprofil
; (%LOCALAPPDATA%\Programs\<AppName>), mit Startmenue-Eintrag und
; Deinstallation. Nicht signiert: SmartScreen warnt beim ersten Start.
; Die AppId darf sich nie aendern - an ihr erkennt Windows ein Update.

#ifndef AppName
  #error AppName fehlt
#endif

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#Version}
AppVerName={#AppName} {#Version}
AppPublisher=Feuerwehrverein Raura
AppPublisherURL=https://www.fwv-raura.ch
AppSupportURL=https://www.fwv-raura.ch/apps.html
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#Ziel}
OutputBaseFilename={#Datei}
SetupIconFile={#Symbol}
UninstallDisplayIcon={app}\{#ExeName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#Quelle}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#ExeName}"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#ExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#ExeName}"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
