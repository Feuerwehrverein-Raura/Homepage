# 🚀 Quick Start Guide

## In 5 Minuten zum laufenden System!

### Voraussetzungen
- Docker & Docker Compose installiert
- Git installiert

### Schritt 1: Projekt klonen
```bash
git clone <your-repo>
cd simple-order-system
```

### Schritt 2: System starten
```bash
# Alle Services hochfahren
docker-compose up -d

# Warten bis alles läuft (ca. 30 Sekunden)
docker-compose ps
```

### Schritt 3: Beispieldaten laden
```bash
# Optional: Beispiel-Artikel für schnellen Start
./seed.sh
```

### Schritt 4: Loslegen! 🎉

**Bestellung aufgeben:**
1. Öffne http://localhost:8080
2. Klicke auf "Inventar" → "Neuer Artikel"
3. Erstelle ein paar Artikel (z.B. "Bier 0.5l", CHF 5.50, Kategorie "Getränke", Drucker "bar")
4. Zurück zu "Bestellung"
5. Tischnummer eingeben (z.B. 5)
6. Artikel auswählen
7. "Bestellung senden" klicken

**Kitchen Display ansehen:**
- Öffne http://localhost:8081
- Bestellung erscheint sofort!
- Mit "Erledigt" abschließen

## 📱 Auf Tablet/Handy nutzen

1. Finde die IP-Adresse deines Computers:
   ```bash
   # Linux/Mac
   ip addr show | grep inet
   
   # Windows
   ipconfig
   ```

2. Auf dem Tablet im gleichen WLAN: `http://192.168.x.x:8080`

3. Als Bookmark speichern!

## 🖨️ Drucker einrichten

**USB-Drucker:**
1. Drucker anschließen
2. In `backend/src/index.ts` die `printReceipt()` Funktion anpassen
3. Container neu starten: `docker-compose restart backend`

**Netzwerk-Drucker:**
1. Drucker-IP herausfinden (z.B. 192.168.1.100)
2. In `backend/src/index.ts` anpassen
3. Container neu starten

## 🛠️ Nützliche Commands

```bash
# Logs anzeigen
docker-compose logs -f

# System stoppen
docker-compose down

# System neu starten
docker-compose restart

# Alles löschen und neu starten
docker-compose down -v
docker-compose up -d
./seed.sh
```

## ❓ Probleme?

**Container startet nicht:**
```bash
docker-compose logs backend
```

**Port bereits belegt:**
In `docker-compose.yml` Ports ändern:
```yaml
ports:
  - "8090:80"  # Statt 8080
```

**Datenbank zurücksetzen:**
```bash
docker-compose down -v
docker-compose up -d
./seed.sh
```

## 📚 Mehr Infos

- **README.md** - Vollständige Dokumentation
- **SETUP.md** - Detaillierte Setup-Anleitung
- **STRUCTURE.md** - Projektstruktur

## 💡 Tipps

- **Entwicklung**: `make logs` zum Debugging
- **Produktion**: Passwörter in `.env` ändern!
- **Backup**: `docker-compose exec postgres pg_dump -U orderuser orderdb > backup.sql`

## 🎯 Was jetzt?

1. ✅ System läuft
2. ✅ Beispieldaten geladen
3. ✅ Erste Bestellung erfolgreich
4. → Drucker einrichten (optional)
5. → Auf Tablets/Handys nutzen
6. → GitHub Actions für automatische Builds aktivieren
7. → Produktiv gehen! 🚀

Viel Erfolg! Bei Fragen → GitHub Issues
