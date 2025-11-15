# Mailcow Verteilerliste für Event-Einladungen

## Übersicht

Statt einzelne E-Mail-Adressen zu verwalten, nutzen wir eine **Mailcow Verteilerliste** (Alias). Alle Event-Einladungen gehen an eine einzige E-Mail-Adresse, die Mailcow dann automatisch an alle Mitglieder weiterleitet.

**Vorteile:**
- ✅ Einfache Verwaltung (alles in Mailcow)
- ✅ Keine Empfänger-Liste in GitHub pflegen
- ✅ Mitglieder können sich selbst an-/abmelden
- ✅ Nur eine E-Mail-Adresse in GitHub Secret

## Schritt 1: Verteilerliste in Mailcow erstellen

### 1.1 In Mailcow einloggen

Gehen Sie zu Ihrem Mailcow Admin-Panel:
```
https://mail.ihre-domain.de
```

### 1.2 Alias erstellen

1. **Navigation:** E-Mail → Konfiguration → Alias
2. **Klicken Sie auf:** "Alias hinzufügen"
3. **Füllen Sie aus:**
   - **Alias-Adresse:** `alle@fwv-raura.ch` (oder `verteiler@fwv-raura.ch`)
   - **Ziel-Adressen:**
     ```
     praesident@fwv-raura.ch
     stefan+fwv-raura@juroct.ch
     kassier@fwv-raura.ch
     mitglied1@example.com
     mitglied2@example.com
     ```
     (Ein Empfänger pro Zeile)
   - **Aktiv:** ✅ (Häkchen setzen)
   - **Öffentlich:** ❌ (Optional - wenn Mitglieder selbst E-Mails senden dürfen)
4. **Klicken Sie auf:** "Hinzufügen"

### 1.3 Testen

Senden Sie eine Test-E-Mail an `alle@fwv-raura.ch`:

```bash
echo "Test" | mail -s "Verteiler-Test" alle@fwv-raura.ch
```

Alle konfigurierten Empfänger sollten die E-Mail erhalten.

## Schritt 2: GitHub Secret erstellen

### 2.1 Secret anlegen

1. Gehen Sie zu: **GitHub Repository → Settings → Secrets and variables → Actions**
2. Klicken Sie auf: **"New repository secret"**
3. Füllen Sie aus:
   - **Name:** `EMAIL_RECIPIENTS_TO`
   - **Value:** `alle@fwv-raura.ch`

   (Oder für mehrere Verteiler, komma-separiert: `alle@fwv-raura.ch,vorstand@fwv-raura.ch`)
4. Klicken Sie auf: **"Add secret"**

### 2.2 Andere Secrets erstellen

Erstellen Sie auch diese Secrets (falls noch nicht vorhanden):

| Secret Name | Beispiel-Wert | Beschreibung |
|-------------|---------------|--------------|
| `SMTP_HOST` | `mail.fwv-raura.ch` | Mailcow Server |
| `SMTP_PORT` | `587` | SMTP Port (587 oder 465) |
| `SMTP_USER` | `alle@fwv-raura.ch` | SMTP Benutzername |
| `SMTP_PASS` | `IhrPasswort123` | SMTP Passwort |
| `FROM_EMAIL` | `alle@fwv-raura.ch` | Absender-Adresse |
| `EMAIL_RECIPIENTS_TO` | `alle@fwv-raura.ch` | Verteilerliste (neu!) |

## Schritt 3: Testen

### 3.1 Via GitHub Actions

1. Gehen Sie zu: **Actions → Send Event Email Invitations**
2. Klicken Sie auf: **"Run workflow"**
3. Geben Sie ein: `events/weihnachtshock2025.md`
4. Klicken Sie auf: **"Run workflow"**

### 3.2 Logs prüfen

Erwartete Ausgabe:
```
🚀 Event E-Mail Versand gestartet...
📄 Lade Event-Datei: events/weihnachtshock2025.md
✅ Event geladen: Weihnachtshock 2025
📋 Verwende Mailcow Verteilerliste...
✅ 1 aktive Empfänger gefunden
🎨 Erstelle E-Mail-Template...
✅ Template erstellt
📧 Versende E-Mails...
✅ E-Mail gesendet an alle@fwv-raura.ch
✅ Alle E-Mails erfolgreich versendet!
```

### 3.3 Mailcow Logs prüfen

In Mailcow UI:
1. Gehen Sie zu: **Logs → Postfix**
2. Suchen Sie nach: `from=<alle@fwv-raura.ch>`
3. Sie sollten sehen:
   - Eine eingehende E-Mail von GitHub Actions
   - Mehrere ausgehende E-Mails an alle Verteiler-Mitglieder

## Empfänger verwalten

### Empfänger hinzufügen

1. **Mailcow:** E-Mail → Konfiguration → Alias
2. Klicken Sie auf den **Bearbeiten-Button** (✏️) neben `alle@fwv-raura.ch`
3. Fügen Sie die neue E-Mail-Adresse in **Ziel-Adressen** hinzu
4. Speichern

**Wichtig:** Keine Änderung in GitHub nötig!

### Empfänger entfernen

1. **Mailcow:** E-Mail → Konfiguration → Alias
2. Bearbeiten Sie `alle@fwv-raura.ch`
3. Entfernen Sie die E-Mail-Adresse aus **Ziel-Adressen**
4. Speichern

### Mehrere Verteiler

Sie können auch mehrere Verteiler nutzen:

**In Mailcow:**
- `events-all@fwv-raura.ch` → Alle Mitglieder
- `events-vorstand@fwv-raura.ch` → Nur Vorstand
- `events-helfer@fwv-raura.ch` → Nur Helfer

**In GitHub Secret `EMAIL_RECIPIENTS_TO`:**
```
events-all@fwv-raura.ch,events-vorstand@fwv-raura.ch
```

So gehen E-Mails an mehrere Listen gleichzeitig.

## Erweiterte Konfiguration

### Automatische Antworten

In Mailcow können Sie Auto-Responder einrichten:

1. **Mailcow:** E-Mail → Konfiguration → Auto-Antworten
2. Erstellen Sie eine Auto-Antwort für `alle@fwv-raura.ch`
3. Text z.B.: "Diese ist eine automatische Verteiler-E-Mail. Bitte nicht antworten."

### Catch-All für Bounces

Falls eine Empfänger-Adresse nicht mehr existiert:

1. **Mailcow:** E-Mail → Konfiguration → Alias
2. Fügen Sie einen **Catch-All** hinzu für Bounces
3. Leiten Sie Fehler-Mails an: `webmaster@fwv-raura.ch`

### Selbstverwaltung durch Mitglieder

Wenn Sie möchten, dass Mitglieder sich selbst an-/abmelden:

**Option 1: Mailman-Integration (komplex)**
- Installieren Sie Mailman in Mailcow
- Erstellen Sie eine Mailingliste

**Option 2: Einfache Anleitung für Mitglieder**
```
An-/Abmeldung für Event-Einladungen:
E-Mail an: webmaster@fwv-raura.ch
Betreff: Anmeldung Event-Verteiler
Text: Bitte nehmen Sie mich in den Event-Verteiler auf.
```

Dann pflegen Sie die Liste manuell in Mailcow.

## Troubleshooting

### E-Mails kommen nicht an

**1. Prüfen Sie Mailcow Logs:**
```
Mailcow UI → Logs → Postfix
```
Suchen Sie nach der Event-E-Mail.

**2. Prüfen Sie den Alias:**
- Ist `alle@fwv-raura.ch` aktiv?
- Sind alle Ziel-Adressen korrekt?

**3. Prüfen Sie Spam-Ordner:**
- Event-E-Mails könnten als Spam erkannt werden
- Verbessern Sie SPF/DKIM/DMARC

### E-Mails gehen nur an einige Empfänger

- Prüfen Sie Mailcow Logs auf Fehler
- Manche Empfänger-Adressen könnten ungültig sein
- Mailcow zeigt "bounced" für fehlerhafte Adressen

### GitHub Actions Fehler: "No recipients found"

- Secret `EMAIL_RECIPIENTS_TO` ist nicht gesetzt
- Oder Secret-Name ist falsch geschrieben
- Gehen Sie zu GitHub Settings → Secrets und prüfen Sie

## Vorteile vs. JSON-Liste

| Methode | Vorteile | Nachteile |
|---------|----------|-----------|
| **Mailcow Verteiler** | ✅ Zentrale Verwaltung<br>✅ Keine GitHub-Änderungen<br>✅ Mailcow Features (Bounces, etc.)<br>✅ Einfacher | ❌ Weniger granulare Kontrolle |
| **JSON-Liste** | ✅ Gruppen-Support<br>✅ Granulare Kontrolle<br>✅ Git-basiert | ❌ Komplexere Verwaltung<br>❌ GitHub Secret ändern bei Updates |

**Empfehlung:** Nutzen Sie die Mailcow Verteilerliste! Einfacher und professioneller.

## Support

Bei Fragen:
- GitHub Issues: https://github.com/Feuerwehrverein-Raura/Homepage/issues
- E-Mail: webmaster@fwv-raura.ch
- Mailcow Doku: https://docs.mailcow.email/

---

🔥 Viel Erfolg mit dem E-Mail-System!
