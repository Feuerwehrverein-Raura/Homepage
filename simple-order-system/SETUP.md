# Setup Guide

## Erste Schritte

### 1. System starten

```bash
# Alle Services starten
make up

# Oder mit docker-compose direkt
docker-compose up -d
```

### 2. Inventar einrichten

Öffne http://localhost:8080 und klicke auf "Inventar".

**Beispiel-Artikel:**

| Name | Kategorie | Preis | Drucker |
|------|-----------|-------|---------|
| Bier 0.5l | Getränke | 5.50 | bar |
| Weisswein 2dl | Getränke | 6.00 | bar |
| Pommes | Essen | 4.50 | kitchen |
| Bratwurst | Essen | 8.00 | kitchen |
| Cola 0.5l | Getränke | 4.00 | bar |

### 3. Erste Bestellung

1. Gehe zurück zur "Bestellung"-Ansicht
2. Gib eine Tischnummer ein (z.B. 5)
3. Wähle Artikel aus dem Menü
4. Passe Mengen an
5. Optional: Notizen hinzufügen
6. Klicke "Bestellung senden"

### 4. Kitchen Display öffnen

Öffne http://localhost:8081 in einem neuen Tab/Fenster.

Die Bestellung erscheint sofort auf dem Kitchen Display!

## Drucker einrichten

### USB-Drucker

1. Drucker per USB anschließen
2. Drucker-ID herausfinden:
   ```bash
   lsusb
   # Beispiel-Output: Bus 001 Device 004: ID 04b8:0202 Epson
   ```

3. In `backend/src/index.ts` anpassen:
   ```typescript
   import USB from 'escpos-usb';
   const device = new USB(0x04b8, 0x0202); // Vendor ID, Product ID
   ```

### Netzwerk-Drucker

In `backend/src/index.ts`:
```typescript
import Network from 'escpos-network';

// Für Bar-Drucker
const barDevice = new Network('192.168.1.100', 9100);

// Für Küchen-Drucker
const kitchenDevice = new Network('192.168.1.101', 9100);
```

## Netzwerk-Setup

### WLAN-Router Konfiguration

1. **Statische IPs vergeben** für:
   - Server: z.B. 192.168.1.10
   - Bar-Drucker: 192.168.1.100
   - Küchen-Drucker: 192.168.1.101

2. **DHCP-Bereich** für Tablets/Handys: 192.168.1.20-50

3. **5 GHz aktivieren** für bessere Performance

### Tablets/Handys einrichten

1. Mit WLAN verbinden
2. Browser öffnen
3. URL eingeben:
   - Bestellung: `http://192.168.1.10:8080`
   - Kitchen Display: `http://192.168.1.10:8081`
4. Als Bookmark/Lesezeichen speichern

**Tipp**: Vollbild-Modus nutzen (F11 oder Teilen → Zum Home-Bildschirm)

## Troubleshooting

### Container startet nicht

```bash
# Logs anzeigen
make logs

# Einzelne Service-Logs
docker-compose logs backend
docker-compose logs frontend
```

### Datenbank zurücksetzen

```bash
# Alle Daten löschen und neu starten
make clean
make up
```

### Drucker druckt nicht

1. Prüfe Verbindung:
   ```bash
   # USB
   lsusb
   
   # Netzwerk
   ping 192.168.1.100
   ```

2. Prüfe Backend-Logs:
   ```bash
   make backend-logs
   ```

3. Test-Druck:
   ```bash
   docker-compose exec backend node -e "console.log('Test')"
   ```

### WebSocket verbindet nicht

1. Prüfe Backend läuft: `curl http://localhost:3000/health`
2. Prüfe Port 3000 offen: `netstat -tuln | grep 3000`
3. Kitchen Display neu laden (Strg+F5)

## Performance-Tipps

- **Tablets**: Chrome/Safari im Vollbild-Modus
- **Kitchen Display**: Großer Monitor (24"+), Bildschirmschoner deaktivieren
- **Netzwerk**: LAN-Kabel für Server und Kitchen Display
- **Drucker**: USV (Unterbrechungsfreie Stromversorgung)

## Backup

### Datenbank sichern

```bash
# Backup erstellen
docker-compose exec postgres pg_dump -U orderuser orderdb > backup.sql

# Backup wiederherstellen
docker-compose exec -T postgres psql -U orderuser orderdb < backup.sql
```

### Inventar exportieren

```bash
# Via API
curl http://localhost:3000/api/items > items-backup.json
```

## Support

Bei Problemen:
1. README.md lesen
2. Logs prüfen: `make logs`
3. GitHub Issue erstellen
