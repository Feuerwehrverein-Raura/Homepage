---
sidebar_position: 2
---

# Bestellungen aufnehmen

Diese Anleitung erklärt die Bestellaufnahme im Kassensystem Schritt für Schritt.

## Anwendung starten

1. Öffne [order.fwv-raura.ch](https://order.fwv-raura.ch) (Cloud) oder die lokale Adresse
2. Falls IP-Whitelist aktiv: Registriere dein Gerät zuerst unter [register.fwv-raura.ch](https://register.fwv-raura.ch)
3. Melde dich mit deinen Zugangsdaten an (falls erforderlich)

## Benutzeroberfläche

### Hauptbereiche

| Bereich | Beschreibung |
|---------|--------------|
| **Header** | Aktive Tischnummer, Login-Status |
| **Kategorien** | Links: Artikelkategorien |
| **Artikel** | Mitte: Artikel der gewählten Kategorie |
| **Warenkorb** | Rechts: Aktuelle Bestellung |
| **Aktionen** | Unten: Bestellen, Bezahlen, etc. |

### Kategorie-Navigation

Die Kategorien zeigen alle verfügbaren Artikelgruppen:
- Getränke (Bier, Wein, Soft, etc.)
- Speisen (Wurst, Raclette, etc.)
- Desserts
- Sonstiges

## Bestellung erstellen

### 1. Tisch auswählen

1. Klicke auf das Tisch-Feld im Header
2. Gib die Tischnummer ein (1-99)
3. Für Take-Away: Verwende Tisch **0**
4. Bestätige mit Enter oder Klick

:::tip
Bei Tisch 0 erscheint "Take-Away" statt der Tischnummer.
:::

### 2. Artikel hinzufügen

#### Per Klick
1. Wähle die Kategorie links
2. Klicke auf den gewünschten Artikel
3. Der Artikel wird zum Warenkorb hinzugefügt

#### Menge ändern
- **+** Button: Menge erhöhen
- **-** Button: Menge verringern
- Bei Menge 0: Artikel wird entfernt

#### Per Suche
1. Klicke auf das Such-Symbol
2. Gib den Artikelnamen ein
3. Wähle aus den Ergebnissen

### 3. Notizen hinzufügen

Für Sonderwünsche oder Allergien:

1. Klicke auf den Artikel im Warenkorb
2. Klicke auf "Notiz hinzufügen"
3. Gib den Text ein (z.B. "ohne Zwiebeln", "Laktosefrei")
4. Bestätige

:::warning Allergie-Hinweise
Notizen mit Allergien (Laktose, Gluten, Nuss, Vegan) werden im Kitchen Display **rot hervorgehoben**!
:::

### 4. Bestellung senden

1. Prüfe den Warenkorb
2. Klicke auf **"Bestellen"**
3. Die Bestellung wird:
   - An den/die Drucker gesendet
   - Im Kitchen Display angezeigt
   - In der Datenbank gespeichert

### 5. Bon wird gedruckt

Je nach Artikelkonfiguration:
- **Bar-Artikel** → Bar-Drucker
- **Küchen-Artikel** → Küchen-Drucker
- **Beide** → Beide Drucker

Der Bon enthält:
- Tischnummer (gross)
- Bestellnummer
- Artikel mit Menge
- Notizen/Sonderwünsche
- Uhrzeit

## Nachbestellen

Wenn ein Tisch bereits eine offene Bestellung hat:

1. Wähle denselben Tisch erneut
2. Du siehst die bestehende Bestellung
3. Füge weitere Artikel hinzu
4. Klicke auf "Bestellen"
5. Nur die neuen Artikel werden gedruckt

## Artikel stornieren

### Vor dem Bestellen
- Klicke auf **-** bis Menge 0
- Oder: Klicke auf das **X** neben dem Artikel

### Nach dem Bestellen
1. Wähle den Tisch
2. Öffne die Bestelldetails
3. Klicke auf "Stornieren" beim Artikel
4. Bestätige
5. Der Artikel wird im Kitchen Display als storniert markiert

## Bestellung bezahlen

### Zahlungsvorgang

1. Wähle den Tisch mit der abzuschliessenden Bestellung
2. Klicke auf **"Bezahlen"**
3. Der Gesamtbetrag wird angezeigt
4. Wähle die Zahlungsart:

### Zahlungsarten

#### Bar (Barzahlung)
1. Wähle "Bar"
2. Nimm das Geld entgegen
3. Gib ggf. Wechselgeld
4. Bestätige

#### Karte (SumUp)
1. Wähle "Karte"
2. Der Betrag wird ans SumUp-Terminal gesendet
3. Gast hält Karte an Terminal
4. Warte auf Bestätigung
5. System schliesst automatisch ab

#### TWINT (RaiseNow)
1. Wähle "TWINT"
2. QR-Code wird angezeigt
3. Gast scannt mit TWINT-App
4. Warte auf Zahlungsbestätigung
5. System schliesst automatisch ab

### Nach der Zahlung

- Der Tisch wird freigegeben
- Die Bestellung verschwindet aus dem Kitchen Display
- Statistiken werden aktualisiert

## Offene Bestellungen

### Übersicht anzeigen

1. Klicke auf "Offene Bestellungen" (oder Symbol)
2. Liste aller Tische mit offenen Bestellungen
3. Zeigt Tischnummer, Betrag, Dauer

### Bestellung auswählen

Klicke auf einen Tisch um:
- Details anzuzeigen
- Nachzubestellen
- Zu bezahlen

## Tipps für effizienten Betrieb

### Schnelle Navigation
- Nutze Tastatur-Shortcuts (falls verfügbar)
- Merke dir häufige Kategorien
- Lerne Artikel-Positionen

### Bei hohem Andrang
- Nutze mehrere Geräte parallel
- Teile Bereiche auf (Getränke/Speisen)
- Halte Tischübersicht aktuell

### Fehler vermeiden
- Prüfe Tischnummer vor Bestellung
- Lies Sonderwünsche laut vor
- Bei Unsicherheit: Rückfrage beim Gast

## Fehlerbehebung

### Bestellung wird nicht gedruckt
- Prüfe Drucker-Verbindung (Einstellungen → Testdruck)
- Prüfe Papierstatus
- Prüfe Netzwerkverbindung zum Drucker

### Artikel erscheint nicht
- Prüfe im Inventar ob "Verkäuflich" aktiviert ist
- Prüfe ob Kategorie korrekt
- Cache leeren (F5 oder Ctrl+Shift+R)

### Tisch zeigt falsche Bestellung
- Bestellungen sind tischgebunden
- Prüfe ob korrekter Tisch gewählt
- Bei Verwechslung: Admin kontaktieren

### Zahlung fehlgeschlagen
- Bei Karte: Nochmals versuchen oder Bar wählen
- Bei TWINT: QR-Code neu generieren
- Bei wiederholtem Fehler: Bar-Zahlung verwenden
