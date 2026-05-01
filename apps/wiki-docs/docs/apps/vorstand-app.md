---
sidebar_position: 1
---

# Vorstand App

Native Android-App für Vorstandsmitglieder zur mobilen Vereinsverwaltung.

## Download & Installation

1. Gehe zu [GitHub Releases](https://github.com/Feuerwehrverein-Raura/Homepage/releases)
2. Lade die neueste `vorstand-app-vX.X.X.apk` herunter (Tags: `vorstand-v*`)
3. Öffne die APK-Datei auf deinem Android-Gerät
4. Erlaube bei Bedarf die Installation aus unbekannten Quellen

**Systemvoraussetzungen:**
- Android 8.0 (API 26) oder neuer
- Internetverbindung

## Login

Die App verwendet das gleiche Login wie das Vorstand-Portal im Browser:

1. Öffne die App
2. Gib deine Vereins-E-Mail-Adresse ein (z.B. `praesident@fwv-raura.ch`)
3. Gib dein E-Mail-Passwort ein
4. Tippe auf **Anmelden**

> Die Anmeldung erfolgt über IMAP — es werden die gleichen Zugangsdaten wie für den E-Mail-Abruf verwendet. Der JWT-Token (HS256, 8h gültig) wird verschlüsselt auf dem Gerät gespeichert.

**Erlaubte E-Mail-Adressen:** Nur Vorstand-Mailboxen können sich anmelden (z.B. praesident, aktuar, kassier, materialwart, beisitzer). Die erlaubten Adressen werden serverseitig via `VORSTAND_EMAILS` konfiguriert.

---

## Funktionen

### Navigation

Nach dem Login siehst du eine Bottom-Navigation mit 5 Tabs:

| Tab | Funktion |
|-----|----------|
| **Mitglieder** | Mitglieder anzeigen, suchen, bearbeiten, Fotos verwalten |
| **Events** | Anlässe und Schichten verwalten, Anmeldungen bearbeiten |
| **Dispatch** | Nachrichten versenden (in Entwicklung) |
| **Verwaltung** | Mitgliedschaftsanträge und Admin-Funktionen |
| **Mehr** | Einstellungen, Audit-Log, Logout |

---

### Mitgliederverwaltung

#### Mitglieder anzeigen
- Liste aller Mitglieder mit Suchfunktion
- Tippe auf ein Mitglied für Details (inkl. Foto, Kontaktdaten, Status)

#### Mitglied bearbeiten
1. Tippe auf ein Mitglied in der Liste
2. Tippe auf das Bearbeiten-Symbol
3. Ändere die gewünschten Felder
4. Tippe auf **Speichern**

#### Neues Mitglied erfassen
1. Tippe auf das **+** Symbol
2. Fülle die Pflichtfelder aus (Vorname, Nachname, etc.)
3. Tippe auf **Speichern**

#### Foto verwalten
- Im Mitglied-Detail: Foto hochladen oder löschen
- Fotos werden auf dem Server unter `/uploads` gespeichert

---

### Event-Management

#### Events anzeigen
- Liste aller Anlässe (vergangene und zukünftige)
- Tippe auf ein Event für Details mit Schichten

#### Schichten verwalten
1. Öffne ein Event
2. Sieh die definierten Schichten (mit Bereich, z.B. Küche, Bar)
3. Tippe auf eine Schicht für die Anmeldungen

#### Anmeldungen bearbeiten
- Sieh wer sich für welche Schicht angemeldet hat
- Bestätige oder lehne Anmeldungen ab
- Schlage alternative Schichten vor

---

### Mitgliedschaftsanträge

Im Tab **Verwaltung** können Mitgliedschaftsanträge bearbeitet werden:

1. Offene Anträge werden mit Badge-Zähler angezeigt
2. Tippe auf einen Antrag für Details
3. **Genehmigen** oder **Ablehnen**

---

### Audit-Log

Das Audit-Log zeigt alle Änderungen im System:

1. Gehe zu **Mehr** > **Audit-Log**
2. Sieh die letzten Aktivitäten:
   - Mitglieder erstellt/bearbeitet/gelöscht
   - Anmeldungen genehmigt/abgelehnt
   - Logins

---

## Benachrichtigungen

Die App informiert dich im Hintergrund über wichtige Änderungen via Android WorkManager:

### Aktivieren
1. Erlaube Benachrichtigungen für die App in den Android-Einstellungen
2. Die App prüft automatisch alle 15 Minuten auf neue Aktivitäten

### Benachrichtigte Ereignisse
- Neues Mitglied erstellt
- Mitglied bearbeitet
- Mitglied gelöscht / Löschantrag gestellt
- Neuer Mitgliedschaftsantrag

> Tipp: Bei mehreren Änderungen wird eine zusammenfassende Benachrichtigung angezeigt.

---

## Auto-Update

Die App prüft beim Start automatisch auf Updates via GitHub Releases:

1. Beim App-Start wird geprüft, ob ein neues Release mit Tag `vorstand-v*` verfügbar ist
2. Falls ja, erscheint ein Dialog mit der neuen Version
3. Tippe auf **Herunterladen** um die neue Version zu installieren

---

## Logout

1. Gehe zu **Mehr**
2. Tippe auf **Abmelden**
3. Der Token wird aus dem verschlüsselten Speicher gelöscht
4. Der Vorstand-Cookie auf `.fwv-raura.ch` wird ebenfalls gelöscht
5. Du wirst zum Login-Screen weitergeleitet

---

## Geplante Funktionen (Phase 2)

Folgende Features sind in Planung:

| Feature | Beschreibung |
|---------|--------------|
| **Dispatch** | Nachrichten per E-Mail und Brief direkt aus der App versenden |
| **E-Mail/Mailcow** | Mailcow-Postfächer und Aliases verwalten |
| **Pingen** | Briefversand über Pingen-Integration |
| **IP-Whitelist** | Kassensystem-Zugriff konfigurieren |
| **Cloud-Berechtigungen** | Nextcloud-Zugriff verwalten |

---

## Problemlösung

### Login funktioniert nicht
- Prüfe ob E-Mail und Passwort korrekt sind
- Stelle sicher, dass du eine Vorstand-Mailbox verwendest (praesident, aktuar, etc.)
- Prüfe deine Internetverbindung
- IMAP-Port 993 muss erreichbar sein

### Keine Benachrichtigungen
- Prüfe die Benachrichtigungseinstellungen in Android
- Stelle sicher, dass die App nicht vom Energiesparen ausgeschlossen ist
- Die Prüfung erfolgt alle 15 Minuten — es kann etwas dauern

### App stürzt ab
- Stelle sicher, dass du die neueste Version verwendest (Auto-Update)
- Lösche die App-Daten in den Android-Einstellungen
- Installiere die App neu

### Session abgelaufen
- Der Vorstand-Token ist 8 Stunden gültig
- Nach Ablauf wirst du automatisch zum Login weitergeleitet
- Bei Problemen: Manuell abmelden und neu anmelden

---

## Technische Details

| Eigenschaft | Wert |
|-------------|------|
| Min. Android | 8.0 (API 26) |
| Sprache | Kotlin |
| Architektur | MVVM (Model-View-ViewModel) |
| API-Kommunikation | Retrofit + Gson |
| UI-Framework | Material 3 |
| Hintergrund-Sync | WorkManager (AuditNotificationWorker) |
| Token-Speicherung | EncryptedSharedPreferences |
| Auto-Update | UpdateChecker (GitHub Releases, Tag-Filter `vorstand-v*`) |
| CI/CD | GitHub Actions (`build-android-vorstand.yml`) |
| Signing | Keystore via GitHub Secrets |
