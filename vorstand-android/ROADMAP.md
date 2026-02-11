# Vorstand App — Entwicklungs-Roadmap

## Phase 1: Grundfunktionen (abgeschlossen)

| Feature | Status |
|---------|--------|
| Login (IMAP-Auth) | Done |
| Mitglieder CRUD | Done |
| Events & Schichten | Done |
| Anmeldungen verwalten | Done |
| Audit-Log | Done |
| Auto-Update (GitHub Releases) | Done |
| Hintergrund-Benachrichtigungen (WorkManager) | Done |

---

## Phase 2: Dispatch — Nachrichtenversand (abgeschlossen)

Nachrichten per E-Mail und Briefpost direkt aus der App versenden.

| Feature | Status |
|---------|--------|
| Nachricht verfassen (E-Mail / Brief / Smart) | Done |
| Empfänger-Auswahl nach Status (Aktiv/Passiv/Ehren) | Done |
| E-Mail-Vorlagen anzeigen & verwenden | Done |
| Pingen-Dashboard (Guthaben, Statistiken, Brief-Historie) | Done |
| Versand-Protokoll mit Filtern | Done |
| PDF-Beilagen | Done |

**Technische Details:**
- 4-Tab-Layout: Senden, Vorlagen, Post, Verlauf
- Smart Dispatch: Automatische Zustellart-Erkennung (E-Mail vs. Post)
- Staging-Modus für Pingen (keine echten Kosten beim Testen)
- Template-CRUD nur im Web-Portal (zu komplex für Mobile)

---

## Phase 3: Mailcow — E-Mail-Verwaltung (abgeschlossen)

Mailcow-Postfächer und Aliases direkt aus der App verwalten.

| Feature | Status |
|---------|--------|
| Postfächer CRUD (mit Quota-Anzeige) | Done |
| Alias-Verwaltung (CRUD) | Done |
| Speicher-Übersicht (farbige Fortschrittsbalken) | Done |
| Zustellliste + Alias-Sync | Done |

**Technische Details:**
- 4-Tab-Layout: Postfächer, Aliase, Speicher, Verteiler
- Zugang über Mehr > E-Mail
- Quota-Farben: Grün (<70%), Gelb (70-90%), Rot (>90%)
- Alias-Sync aktualisiert mitglieder@fwv-raura.ch

---

## Phase 4: Vaultwarden — Passwort-Verwaltung (abgeschlossen)

Geteilte Passwörter für Vereins-Accounts verwalten.

| Feature | Status |
|---------|--------|
| Vault-Login (E-Mail + Master-Passwort) | Done |
| Geteilte Einträge anzeigen | Done |
| Passwort/Benutzername kopieren | Done |
| Suche nach Dienst oder Benutzername | Done |
| Auto-Login mit gespeicherten Credentials | Done |

**Technische Details:**
- Bitwarden-kompatible Crypto (PBKDF2-SHA256, AES-256-CBC)
- Credentials in EncryptedSharedPreferences
- Organisation: "FWV-Raura" mit Auto-Invite (Cron-Job)

---

## Phase 5: Einstellungen & Diverses (abgeschlossen)

| Feature | Status |
|---------|--------|
| App-Theme (System/Hell/Dunkel) | Done |
| Benachrichtigungs-Einstellungen | Done |
| Auto-Update-Prüfung Toggle | Done |
| Über die App (Version, Lizenzen) | Done |
| Links (Website, GitHub, Datenschutz) | Done |

**Technische Details:**
- AppSettings mit SharedPreferences
- Theme via AppCompatDelegate.setDefaultNightMode()
- Zugang über Mehr > Einstellungen / Über die App
- Nextcloud-Berechtigungen bleiben im Mitglieder-Detail (wie auf Website)

---

## Phase 6: Massen-PDF-Versand (abgeschlossen)

Post-Massenversand per Pingen direkt aus der App.

| Feature | Status |
|---------|--------|
| PDF-Dokument auswählen | Done |
| Empfänger-Auswahl (alle/einzelne) | Done |
| Staging-Modus Toggle | Done |
| Massenversand starten | Done |
| Kosten-Vorschau | Done |
| Erfolgs-/Fehler-Bericht | Done |

**Technische Details:**
- PDF per Android Document Picker (ACTION_OPEN_DOCUMENT)
- Nur Mitglieder mit Post-Zustellung und gültiger Adresse
- Batch-Versand in 5er-Gruppen (Backend)
- Kassier erhält automatisch Kostenbenachrichtigung
- Zugang über Mehr > Post

---

## Zukunft: iOS & Kotlin Multiplatform

Für eine zukünftige iOS-Version ist **Kotlin Multiplatform (KMP)** der empfohlene Ansatz:
- Shared Business-Logik (ViewModels, API-Layer, Models) in Kotlin
- Native UI pro Plattform (Jetpack Compose für Android, SwiftUI für iOS)
- Schrittweise Migration möglich — kein kompletter Rewrite nötig
