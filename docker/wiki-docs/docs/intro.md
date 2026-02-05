---
sidebar_position: 1
slug: /
---

# Willkommen beim FWV Raura Wiki

Diese Dokumentation erklärt alle Funktionen der Feuerwehrverein Raura Website und Apps.

## Schnellstart

### Für Mitglieder
- [Erste Schritte](/benutzer/erste-schritte) - Registrierung und Login
- [Profil verwalten](/benutzer/profil) - Persönliche Daten aktualisieren
- [Kalender](/benutzer/kalender) - Termine abonnieren und synchronisieren
- [Events](/benutzer/events) - Zu Anlässen anmelden

### Für Vorstand
- [Vorstand-Portal](/vorstand/uebersicht) - Übersicht aller Verwaltungsfunktionen
- [Mitgliederverwaltung](/vorstand/mitglieder) - Mitglieder hinzufügen, bearbeiten, löschen
- [Event-Management](/vorstand/events) - Anlässe erstellen und verwalten
- [Anmeldungen](/vorstand/anmeldungen) - Helfer-Anmeldungen bearbeiten
- [Rundschreiben](/vorstand/nachricht) - E-Mails und Briefe versenden
- [E-Mail-Konten](/vorstand/mailcow) - Mailcow-Postfächer verwalten
- [Android App](/apps/vorstand-app) - Mobile Verwaltung

### Für Administratoren
- [Rollen & Berechtigungen](/admin/rollen) - Zugriffsrechte verwalten
- [Audit-Log](/admin/audit-log) - Aktivitäten überwachen
- [Einstellungen](/admin/einstellungen) - System-Konfiguration

### Für Anlässe
- [Kassensystem](/kassensystem/uebersicht) - Bestellungen aufnehmen und abrechnen
- [Kitchen Display](/kassensystem/kitchen-display) - Bestellungen in Küche/Bar anzeigen
- [Inventar](/inventar/uebersicht) - Lagerverwaltung und Artikelstamm
- [Tagesbericht](/kassensystem/tagesbericht) - Umsatzauswertung

### Buchhaltung
- [Buchhaltung](/api/accounting) - Kontenplan, Buchungen, Rechnungen und Berichte

### Mobile Apps
- [Vorstand App](/apps/vorstand-app) - Android-App für Vorstandsmitglieder
- [Kitchen Display App](/apps/kitchen-display-app) - Android-App für Küchen-Tablets

### API-Dokumentation
- [API-Übersicht](/api/uebersicht) - Alle REST-API-Endpoints
- [Members API](/api/members) - Mitgliederverwaltung
- [Events API](/api/events) - Event-Management
- [Dispatch API](/api/dispatch) - E-Mail, Brief-Versand, Newsletter
- [Accounting API](/api/accounting) - Buchhaltung und Finanzen

---

## System-Architektur

Das System besteht aus mehreren Microservices, die alle unter `api.fwv-raura.ch` erreichbar sind und via Traefik anhand des URL-Pfads zum richtigen Container geroutet werden:

```
┌───────────────────────────────────────────────────────────────────────┐
│                             Traefik                                   │
│                         (Reverse Proxy)                               │
└──────────────────────────────┬────────────────────────────────────────┘
                               │
  ┌────────┬────────┬──────────┼──────────┬────────┬────────┬────────┐
  │        │        │          │          │        │        │        │
┌─┴──┐  ┌──┴──┐  ┌──┴──┐  ┌───┴──┐  ┌────┴──┐  ┌─┴──┐  ┌─┴──┐  ┌─┴──┐
│Web │  │Memb.│  │Event│  │Disp. │  │Accnt. │  │Ord.│  │Inv.│  │PDF │
│site│  │ API │  │ API │  │ API  │  │  API  │  │Sys.│  │Sys.│  │Des.│
└────┘  └──┬──┘  └──┬──┘  └──┬───┘  └───┬───┘  └─┬──┘  └─┬──┘  └────┘
           │        │        │           │        │        │
           └────────┴────────┴───────────┴────────┴────────┘
                                  │
                         ┌────────┴────────┐
                         │  PostgreSQL 16  │
                         └─────────────────┘
```

### Services

| Service | Beschreibung | URL |
|---------|--------------|-----|
| **Frontend** | Hauptwebsite mit Mitgliederbereich | fwv-raura.ch |
| **Vorstand-Portal** | Verwaltungs-Dashboard | fwv-raura.ch/vorstand.html |
| **API Members** | Mitgliederverwaltung, Auth, Rollen, Fotos | api.fwv-raura.ch/members |
| **API Events** | Events, Schichten, Kalender, Anmeldungen | api.fwv-raura.ch/events |
| **API Dispatch** | E-Mail, Brief-Versand, Newsletter, PDF-Vorlagen | api.fwv-raura.ch/email |
| **API Accounting** | Kontenplan, Buchungen, Rechnungen, Berichte | api.fwv-raura.ch/accounts |
| **Kassensystem** | Bestellungen bei Anlässen | order.fwv-raura.ch |
| **Kitchen Display** | Bestellanzeige Küche/Bar | kitchen.fwv-raura.ch |
| **Inventar** | Lagerverwaltung mit Rezepten | inventar.fwv-raura.ch |
| **PDF-Designer** | Visueller Editor für PDF-Vorlagen | pdf.fwv-raura.ch |
| **Wiki** | Diese Dokumentation | wiki.fwv-raura.ch |

### Technologie-Stack

| Komponente | Technologie |
|------------|-------------|
| Backend | Node.js 18+, Express.js |
| Datenbank | PostgreSQL 16 |
| Frontend | HTML/CSS/JS, Tailwind, React |
| Authentifizierung | Authentik (OIDC/RS256), IMAP (HS256) |
| Container | Docker, Docker Compose |
| Reverse Proxy | Traefik (Let's Encrypt SSL) |
| CI/CD | GitHub Actions, Semantic Release, Watchtower |
| Android | Kotlin, Material 3, minSdk 26 |

---

## Authentifizierung

### Für Mitglieder (Authentik OIDC)
- Login über zentrales Authentik-Portal (auth.fwv-raura.ch)
- OAuth2 Authorization Code Flow mit RS256-signierten JWTs
- Single Sign-On für Website, Kassensystem und Inventar
- Passwort-Reset via E-Mail

### Für Vorstand (IMAP Login)
- Login mit Vereins-E-Mail-Konto (z.B. praesident@fwv-raura.ch)
- JWT mit HS256-Signatur, 8 Stunden gültig
- Zugang zum Vorstand-Portal und Android-App
- Cookie-Domain `.fwv-raura.ch` für Cross-Subdomain-Zugriff

---

## Versionierung

Die aktuelle Version kann über den Health-Endpoint abgefragt werden:

```bash
curl https://api.fwv-raura.ch/health
# {"status":"ok","service":"api-members","version":"1.145.0"}
```

Jeder Backend-Service hat einen eigenen `/health` Endpoint.

---

## Hilfe & Support

Bei Problemen:
1. Prüfe diese Dokumentation
2. Kontaktiere den Webmaster: webmaster@fwv-raura.ch
3. Bei technischen Problemen: Beschreibe genau was passiert ist

### Häufige Fragen

**Ich kann mich nicht einloggen**
→ Prüfe ob dein Authentik-Konto aktiviert ist. Kontaktiere den Vorstand falls nötig.

**Die Website lädt nicht**
→ Prüfe deine Internetverbindung. Bei anhaltendem Problem: status.fwv-raura.ch

**Ich sehe keine Events**
→ Events werden nur angezeigt wenn sie veröffentlicht sind. Vorstand kann alle Events sehen.

**Die Vorstand-App funktioniert nicht**
→ Prüfe ob du die neueste Version installiert hast (Auto-Update prüft bei jedem Start). Stelle sicher, dass du dich mit einer erlaubten Vorstand-E-Mail anmeldest.
