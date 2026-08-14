# FWV Vorstand — Desktop-App

Desktop-Version der Vorstandsverwaltung, gebaut mit
[Tauri 2](https://v2.tauri.app). Spricht dieselben Backends wie das
Web-Portal (`api.fwv-raura.ch`, `vault.fwv-raura.ch`,
`order.fwv-raura.ch`) und deckt denselben Funktionsumfang ab:
Mitglieder, Anlaesse, Versand, Mailcow, Vaultwarden, Audit-Protokoll.

Gegenueber dem Portal im Browser bringt die App drei Dinge: das
Login-Token liegt im Schluesselbund des Betriebssystems statt im
Browser-Storage, PDFs lassen sich direkt lokal oeffnen, und die App
aktualisiert sich selbst.

## Technik

- **Frontend:** React 18, Vite 5, Tailwind 3, Zustand, React Router
- **Backend:** Rust (Tauri 2) — Keychain-Zugriff, Datei-Handling,
  Vaultwarden-Krypto
- **Bundle-ID:** `ch.fwvraura.vorstand.desktop`

Die erlaubten Netzwerkziele stehen als CSP in
`src-tauri/tauri.conf.json` — ein neues Backend muss dort **und** in
`src-tauri/capabilities/default.json` eingetragen werden, sonst
blockiert Tauri die Anfrage zur Laufzeit.

## Entwickeln

Voraussetzungen: Node 20, Rust stable. Unter Linux zusaetzlich
`libwebkit2gtk-4.1-dev`, `librsvg2-dev`, `patchelf` und
`libsecret-1-dev`.

```bash
cd vorstand-desktop
npm install
npm run tauri dev      # Dev-Server auf Port 1420 + App-Fenster
npm run tauri build    # Installer fuer die aktuelle Plattform
```

## Plattformen

| Plattform | Artefakt | Token-Speicher |
| --- | --- | --- |
| Windows | `.msi` | Anmeldeinformationsverwaltung |
| Linux (Debian/Ubuntu) | `.deb` | keyutils (Kernel-Keyring) |
| macOS (Intel + Apple Silicon) | `.dmg` (Universal) | Schluesselbund |

Die `keyring`-Crate hat **keine** Default-Features: ohne passendes
Plattform-Feature faellt sie still auf einen In-Memory-Store zurueck
und das Token ist nach jedem Neustart weg. Darum ist sie in
`src-tauri/Cargo.toml` pro Zielplattform gesetzt — beim Hinzufuegen
einer Plattform daran denken.

### macOS ist nicht signiert

Der Mac-Build entsteht ohne Apple-Zertifikat, weil noch kein Apple
Developer Program besteht (gleicher Stand wie bei `members-ios`).
Gatekeeper meldet darum beim ersten Start, die App sei „beschaedigt".
Einmalige Freigabe:

```bash
xattr -dr com.apple.quarantine "/Applications/FWV Vorstand.app"
```

Sobald ein Developer-Account da ist, reicht es, die Secrets
`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `KEYCHAIN_PASSWORD`, `APPLE_ID`,
`APPLE_PASSWORD` und `APPLE_TEAM_ID` im Repo zu hinterlegen — der
Workflow liest sie bereits aus, und `tauri-action` uebernimmt
Signieren und Notarisieren dann von selbst.

## Release

Gebaut wird von `.github/workflows/build-desktop-vorstand.yml`:

- **Pull Request** mit Aenderungen an `vorstand-desktop/**` →
  kompiliert alle drei Plattformen, veroeffentlicht nichts
- **Tag `vorstand-desktop-v*`** → baut, erzeugt das GitHub-Release und
  markiert es als „Latest"
- **Manueller Dispatch** → erzeugt **ebenfalls ein Release** unter
  `vorstand-desktop-v<version>`. Nicht als Testbuild verwenden; dafuer
  ist der Pull Request da.

```bash
# Version in package.json, src-tauri/Cargo.toml und
# src-tauri/tauri.conf.json gleichziehen, dann:
git tag vorstand-desktop-v1.28.0
git push origin vorstand-desktop-v1.28.0
```

### Auto-Update

Der Updater fragt
`releases/latest/download/latest.json` ab — das Desktop-Release **muss**
also auf „Latest" stehen. Der Workflow setzt das nach jedem Tag-Build
explizit, damit spaeter erzeugte Android-Releases den Zeiger nicht
uebernehmen.

Die Bundles werden mit einem Minisign-Schluesselpaar signiert
(`TAURI_SIGNING_PRIVATE_KEY` als Secret, der oeffentliche Teil steht in
`tauri.conf.json`). Das ist unabhaengig von der Apple-Signierung: es
schuetzt den Update-Kanal, nicht den Erststart.

Der macOS-Job baut ein Universal-Binary. `tauri-action` traegt es in
`latest.json` unter beiden Keys (`darwin-aarch64` und `darwin-x86_64`)
ein, das Update erreicht also Intel- wie Apple-Silicon-Macs.
