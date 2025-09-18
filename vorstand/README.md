# 👥 Vorstand-Management System

Dieses Verzeichnis enthält alle Informationen zu den Vorstandsmitgliedern als separate Markdown-Dateien. Jede Datei wird automatisch in die Website eingebunden und in der Vorstandssektion angezeigt.

---

## 📁 **Dateistruktur**

```
vorstand/
├── 📋 README.md           # Diese Dokumentation
├── 👑 praesident.md       # Präsident
├── ✍️ aktuar.md           # Aktuar/Schriftführer
├── 💰 kassier.md          # Kassier
├── 📦 materialwart.md     # Materialwart
└── 👤 beisitzer.md        # Beisitzer
```

---

## ✨ **Automatische Features**

- ✅ **Dynamisches Laden:** Alle Vorstandsmitglieder werden automatisch von der Website geladen
- ✅ **Responsive Design:** Optimale Darstellung auf allen Geräten
- ✅ **Reihenfolge:** Automatische Sortierung nach `order`-Feld
- ✅ **Fallback-Bilder:** Initialen werden angezeigt, wenn Profilbild fehlt
- ✅ **Hover-Tooltips:** Beschreibung wird beim Überfahren angezeigt
- ✅ **Error-Handling:** Elegante Fehlerbehandlung bei Ladeproblemen

---

## 📝 **Neues Vorstandsmitglied hinzufügen**

### **1. Markdown-Datei erstellen**
```bash
# Beispiel: neuer-beisitzer.md
vorstand/neuer-beisitzer.md
```

### **2. Frontmatter-Template verwenden**
```yaml
---
position: Beisitzer 2
name: Max Mustermann  
email: max.mustermann@fwv-raura.ch
phone: +41 79 123 45 67
image: images/max-mustermann.png
order: 6
---

Max Mustermann unterstützt den Vorstand bei verschiedenen Aufgaben und bringt seine langjährige Erfahrung in die Vereinsarbeit ein.
```

### **3. JavaScript anpassen**
In der `index.html` die neue Datei zur Liste hinzufügen:

```javascript
const memberFiles = [
    'vorstand/praesident.md',
    'vorstand/aktuar.md',
    'vorstand/kassier.md',
    'vorstand/materialwart.md',
    'vorstand/beisitzer.md',
    'vorstand/neuer-beisitzer.md'  // ← Neue Datei hinzufügen
];
```

---

## 🏗️ **Frontmatter-Schema**

```yaml
---
# === PFLICHTFELDER ===
position: string     # Funktion im Vorstand (z.B. "Präsident")
name: string         # Vollständiger Name
order: number        # Reihenfolge der Anzeige (1 = erste Position)

# === KONTAKTDATEN ===
email: string        # E-Mail-Adresse (optional)
phone: string        # Telefonnummer (optional) 

# === PROFILBILD ===
image: string        # Pfad zum Profilbild (optional)
---

# Beschreibungstext
Hier kommt eine kurze Beschreibung der Person und ihrer Aufgaben...
```

---

## 📱 **Responsive Darstellung**

### **Desktop (md:grid-cols-2)**
```
┌─────────────────┬─────────────────┐
│   Präsident     │    Aktuar       │
├─────────────────┼─────────────────┤
│   Kassier       │  Materialwart   │
├─────────────────┼─────────────────┤
│   Beisitzer     │     (leer)      │
└─────────────────┴─────────────────┘
```

### **Mobile (grid-cols-1)**
```
┌─────────────────┐
│   Präsident     │
├─────────────────┤
│    Aktuar       │
├─────────────────┤
│   Kassier       │
├─────────────────┤
│  Materialwart   │
├─────────────────┤
│   Beisitzer     │
└─────────────────┘
```

---

## 🖼️ **Profilbilder verwalten**

### **Bildanforderungen**
- **Format:** PNG, JPG oder WebP
- **Größe:** 200x200px empfohlen
- **Dateigröße:** < 100KB für optimale Ladezeiten
- **Hintergrund:** Transparent oder weiß

### **Bildpfade**
```bash
# Empfohlene Struktur
images/
├── logo.png
├── praesident.png
├── aktuar.png
├── kassier.png
├── materialwart.png
└── beisitzer.png
```

### **Fallback-System**
Wenn ein Bild nicht geladen werden kann:
1. ✅ Bild wird ausgeblendet
2. ✅ Initialen-Avatar wird angezeigt (farbig mit erstem Buchstaben)
3. ✅ Keine Fehlermeldung für Benutzer

---

## ⚙️ **Technische Details**

### **Lade-Reihenfolge**
1. **Seitenladen:** Loading-Spinner wird angezeigt
2. **Fetch-Requests:** Alle Markdown-Dateien werden parallel geladen
3. **Parsing:** Frontmatter und Beschreibung werden extrahiert
4. **Sortierung:** Nach `order`-Feld sortiert
5. **Rendering:** HTML wird generiert und eingefügt
6. **Error-Handling:** Bei Fehlern wird Fallback-Nachricht angezeigt

### **Caching**
- ✅ **Browser-Cache:** Markdown-Dateien werden vom Browser gecacht
- ✅ **CDN-freundlich:** Funktioniert mit GitHub Pages und anderen CDNs
- ✅ **Versionierung:** Änderungen werden sofort übernommen

### **Performance**
```javascript
// Parallel Loading für bessere Performance
const promises = memberFiles.map(file => this.loadMemberFromFile(file));
const results = await Promise.all(promises);
```

---

## 🔧 **Wartung und Updates**

### **Vorstandsmitglied bearbeiten**
1. ✏️ Entsprechende `.md` Datei öffnen
2. 📝 Informationen anpassen
3. 💾 Datei speichern
4. 🔄 Website lädt Änderungen automatisch

### **Reihenfolge ändern**
```yaml
# Beispiel: Kassier an erste Stelle
---
position: Kassier
order: 1  # ← Niedrigste Zahl = erste Position
---
```

### **Position entfernen**
1. ❌ `.md` Datei aus `vorstand/` Ordner löschen
2. ⚙️ Datei aus `memberFiles` Array in `index.html` entfernen

---

## 🚨 **Häufige Probleme**

### **Problem: Vorstandsmitglied wird nicht angezeigt**
**Lösungen:**
- ✅ Frontmatter-Syntax prüfen (YAML-Format)
- ✅ Dateiname in `memberFiles` Array korrekt?
- ✅ Browser-Cache leeren (Ctrl+F5)
- ✅ Browser-Konsole auf Fehler prüfen

### **Problem: Profilbild lädt nicht**
**Lösungen:**
- ✅ Bildpfad korrekt? (relativ zu index.html)
- ✅ Datei existiert im `images/` Ordner?
- ✅ Dateiname identisch (Groß-/Kleinschreibung)?
- ✅ Fallback-System wird automatisch aktiviert

### **Problem: Reihenfolge stimmt nicht**
**Lösungen:**
- ✅ `order`-Feld in allen Dateien gesetzt?
- ✅ Numerische Werte verwenden (1, 2, 3...)
- ✅ Keine doppelten `order`-Werte

---

## 📞 **Support**

**Bei Problemen mit dem Vorstand-System:**
- 📧 **Technische Fragen:** webmaster@fwv-raura.ch
- 👤 **Inhaltliche Änderungen:** aktuar@fwv-raura.ch
- 🐛 **Bug-Reports:** [GitHub Issue erstellen](https://github.com/Feuerwehrverein-Raura/Homepage/issues)

---

## 🔍 **Debugging-Tipps**

### **Browser-Konsole öffnen**
- **Chrome/Firefox:** F12 → Console-Tab
- **Fehlersuche:** Nach roten Fehlermeldungen suchen

### **Häufige Console-Meldungen**
```javascript
// ✅ Normal
"Lade Vorstandsinformationen..."

// ⚠️ Warnung (nicht kritisch)
"Konnte vorstand/beispiel.md nicht laden: HTTP error! status: 404"

// ❌ Fehler (kritisch)
"Fehler beim Laden der Vorstandsmitglieder: SyntaxError"
```

### **Network-Tab prüfen**
- **F12 → Network-Tab**
- **Seitenreload:** Alle HTTP-Requests anzeigen
- **Rote Einträge:** Fehlgeschlagene Datei-Requests

---

**💡 Tipp:** Verwenden Sie die bestehenden Dateien als Vorlage für neue Vorstandsmitglieder!
