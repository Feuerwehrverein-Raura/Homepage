# ⚡ SumUp 3G Quick Setup

## 5-Minuten Setup für dein SumUp 3G Terminal

### Schritt 1: Terminal vorbereiten

```
1. Terminal einschalten
2. Seitliches Menü → "API"
3. Falls eingeloggt: "Disconnect" drücken
4. Terminal zeigt Pairing-Code (4 Ziffern)
```

**Beispiel: `1234`**

### Schritt 2: Terminal pairen

```bash
# Im Browser oder via cURL:
curl -X POST http://localhost:3000/api/terminal/pair \
  -H "Content-Type: application/json" \
  -d '{"pairing_code": "1234"}'

# Response:
{
  "success": true,
  "reader_id": "TMXXXXXXXXX",
  "name": "SumUp 3G",
  "message": "Terminal paired successfully! Add SUMUP_READER_ID=TMXXXXXXXXX to your .env file"
}
```

### Schritt 3: .env aktualisieren

```bash
# .env
SUMUP_API_KEY=sk_live_xxxxxxxxxxxxx
SUMUP_MERCHANT_CODE=MXXXXXXXXX
SUMUP_AFFILIATE_KEY=7ca84f17-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SUMUP_READER_ID=TMXXXXXXXXX  # <-- Von Schritt 2
SUMUP_BASE_URL=https://api.sumup.com/v0.1
```

### Schritt 4: Backend neu starten

```bash
docker-compose restart backend
```

### Schritt 5: Testen! 🎉

```bash
# 1. Terminal-Status prüfen
curl http://localhost:3000/api/terminal/status

# Response:
{
  "reader_id": "TMXXXXXXXXX",
  "status": "online",
  "battery_level": 85
}

# 2. Testbestellung erstellen
# → Frontend öffnen: http://localhost:8080
# → Bestellung aufgeben
# → "SumUp Terminal (3G)" wählen
# → Betrag erscheint auf Terminal
# → Testkarte halten (4242 4242 4242 4242)
# → ✅ Zahlung erfolgreich!
```

## Troubleshooting

### Terminal zeigt "offline"

```bash
# Lösung 1: WLAN prüfen
Terminal: Einstellungen → WLAN → Neu verbinden

# Lösung 2: Terminal neu starten
Terminal aus- und wieder einschalten (10 Sek warten)

# Lösung 3: Neu pairen
Terminal: API → Disconnect → Neuer Code → Pairen wiederholen
```

### "Reader not found"

```bash
# Prüfe SUMUP_READER_ID in .env
echo $SUMUP_READER_ID

# Alle gepairten Terminals auflisten:
curl -X GET https://api.sumup.com/v0.1/readers \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### "Affiliate Key invalid"

```bash
# Erstelle Affiliate Key:
1. Gehe zu https://me.sumup.com/developers
2. Create Application → "FWV Raura Order System"
3. Kopiere Affiliate Key
4. Füge in .env ein: SUMUP_AFFILIATE_KEY=...
5. Backend neu starten
```

## Wo bekomme ich die Keys?

### API Key
```
https://me.sumup.com/developers
→ Create API Key
→ Kopiere: sk_live_xxxxxxxxxxxxx oder sk_test_xxxxxxxxxxxxx
```

### Merchant Code
```
https://me.sumup.com/account
→ Under "Account Details"
→ Kopiere: MXXXXXXXXX
```

### Affiliate Key
```
https://me.sumup.com/developers
→ Create Application
→ Name: "FWV Raura Order System"
→ Type: "Terminal Payment"
→ Kopiere: 7ca84f17-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

### Reader ID
```
# Automatisch nach Pairing:
POST /api/terminal/pair
Body: {"pairing_code": "1234"}

# Oder manuell abrufen:
GET https://api.sumup.com/v0.1/readers
```

## Workflow beim Fest

### Vorbereitung (vor dem Event)
```
1. ✅ Terminal vollständig laden
2. ✅ Terminal mit Fest-WLAN verbinden
3. ✅ Terminal-Status prüfen (online?)
4. ✅ Testbestellung durchführen
5. ✅ Bondrucker testen
```

### Während des Events
```
1. Gast bestellt am Tablet
2. "SumUp Terminal" wählen
3. Alert: "Zahlung an Terminal gesendet"
4. Terminal zeigt Betrag
5. Gast hält Karte ans Terminal
6. Terminal: "Zahlung erfolgreich"
7. Kellner: Bon wird gedruckt
8. Bon zur Küche/Bar
```

### Nach dem Event
```
1. Terminal ausloggen (API → Disconnect)
2. Alle Transaktionen in SumUp Dashboard prüfen
3. Kassenbuch aktualisieren
4. Terminal aufladen für nächstes Mal
```

## Checkliste Event-Tag

```
☐ Terminal geladen (mind. 80%)
☐ Terminal mit WLAN verbunden
☐ Terminal-Status "online" in App
☐ Testbestellung erfolgreich
☐ Bondrucker funktioniert
☐ Kitchen Display läuft
☐ Tablets geladen
☐ Backup-WLAN verfügbar
☐ Bar-Zahlung als Fallback
☐ Team instruiert
```

## Support während Event

**Terminal offline?**
→ Bar-Zahlung als Fallback

**Zahlung hängt?**
→ Terminal neu starten (10 Sek)

**Terminal nicht erreichbar?**
→ WLAN-Router prüfen

**Technischer Support:**
→ webmaster@fwv-raura.ch
→ +41 XX XXX XX XX

## Kosten-Rechner

```python
# Beispiel Chilbi:
bestellungen = 150
durchschnitt = 22.50  # CHF

umsatz = bestellungen * durchschnitt  # 3'375 CHF
gebuehren = (umsatz * 0.0195) + (bestellungen * 0.25)
# = 65.81 + 37.50 = 103.31 CHF

netto = umsatz - gebuehren  # 3'271.69 CHF
```

**Gebühren: 1.95% + CHF 0.25 pro Transaktion**

---

**Bereit? Los geht's!** 🚀💳🔥
