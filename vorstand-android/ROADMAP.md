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

## Phase 3: Mailcow — E-Mail-Verwaltung (ausstehend)

Mailcow-Postfächer und Aliases direkt aus der App verwalten.

| Feature | Beschreibung |
|---------|-------------|
| Postfach-Übersicht | Alle Postfächer mit Quota-Anzeige |
| Alias-Verwaltung | Aliases erstellen, bearbeiten, löschen |
| Verteilerlisten | Verteilerlisten-Mitglieder verwalten |
| Passwort-Reset | Postfach-Passwörter zurücksetzen |

**API-Endpoints:** Backend-Proxy zu Mailcow API (kein direkter Zugriff auf Mailcow)

---

## Phase 4: Vaultwarden — Passwort-Verwaltung (ausstehend)

Geteilte Passwörter für Vereins-Accounts verwalten.

| Feature | Beschreibung |
|---------|-------------|
| Geteilte Einträge | Passwörter der Organisation anzeigen |
| Kopieren | Benutzername/Passwort in Zwischenablage kopieren |
| Suche | Nach Dienst oder Benutzername suchen |

**Hinweis:** Nur Lese-Zugriff auf geteilte Organisations-Passwörter. Vollständige Verwaltung über Vaultwarden Web-UI.

---

## Phase 5: IP-Whitelist — Kassensystem-Zugriff (ausstehend)

IP-Adressen für den Zugriff auf das Kassensystem verwalten.

| Feature | Beschreibung |
|---------|-------------|
| Whitelist anzeigen | Aktuelle IP-Adressen mit Beschreibung |
| IP hinzufügen | Neue IP-Adresse freischalten |
| IP entfernen | Zugriff entziehen |
| Aktuelle IP | Eigene IP-Adresse anzeigen und hinzufügen |

---

## Phase 6: Einstellungen & Diverses (ausstehend)

| Feature | Beschreibung |
|---------|-------------|
| Nextcloud-Berechtigungen | Cloud-Zugriff für Mitglieder verwalten |
| App-Einstellungen | Benachrichtigungs-Intervall, Theme, etc. |
| Über die App | Version, Lizenzen, Links |

---

## Zukunft: iOS & Kotlin Multiplatform

Für eine zukünftige iOS-Version ist **Kotlin Multiplatform (KMP)** der empfohlene Ansatz:
- Shared Business-Logik (ViewModels, API-Layer, Models) in Kotlin
- Native UI pro Plattform (Jetpack Compose für Android, SwiftUI für iOS)
- Schrittweise Migration möglich — kein kompletter Rewrite nötig
