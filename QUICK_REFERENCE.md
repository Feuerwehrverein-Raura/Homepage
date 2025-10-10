# 📋 Quick Reference Guide

Fast reference for common tasks and solutions.

---

## 🚀 Quick Start

```bash
# Clone and setup
git clone https://github.com/Feuerwehrverein-Raura/Homepage.git
cd Homepage
npm install

# Run scripts
npm run generate-ics      # Generate calendar
npm run generate-pdfs     # Generate shift PDFs
npm test                  # Test PDF generation

# Start local server
python -m http.server 8000
# Open http://localhost:8000
```

---

## 📝 Create New Event

### **Template:**
```yaml
---
id: event-name-2025
title: Event Title
subtitle: Short description
startDate: 2025-12-31T20:00:00
endDate: 2025-12-31T23:59:59
location: Location Name
category: Hauptveranstaltung
organizer: Name
email: email@feuerwehrverein-raura.ch
registrationRequired: true
registrationDeadline: 2025-12-20T23:59:59
cost: CHF 25.- pro Person
tags: [Tag1, Tag2]
participantRegistration: true
maxParticipants: 50
status: confirmed
---

# Event Title

Event description here...
```

### **Save as:**
```
events/event-name-2025.md
```

### **Commit:**
```bash
git add events/event-name-2025.md
git commit -m "✨ Add: Event Name 2025"
git push
```

---

## 👷 Add Shifts to Event

### **In event file:**
```yaml
shifts:
  - id: aufbau-1
    name: Aufbau Tag 1
    date: 2025-10-05
    time: 17:00-20:00
    needed: 5
    description: Grundaufbau
  - id: samstag-bar-12-14
    name: Bar Samstag Mittag
    date: 2025-10-18
    time: 12:00-14:00
    needed: 2
    description: Getränke ausgeben
```

### **Create assignment file:**
```bash
# Filename: events/event-name-2025-assignments.md
```

```markdown
# Schichtplan Event Name 2025

**Event:** event-name-2025
**Status:** In Planung

---

## Aufbau
### aufbau-1 (05.10.2025, 17:00-20:00) - 5 Personen benötigt
- René Käslin
- **[OFFEN - 4 Plätze]**

## Samstag Betrieb
### samstag-bar-12-14 (18.10.2025, 12:00-14:00) - 2 Personen benötigt
- **[OFFEN - 2 Plätze]**
```

---

## 🐛 Fix Common Errors

### **Error: Invalid time value**
```yaml
# ❌ Wrong
startDate: 14.10.2025 14:00
startDate: 2025-10-14

# ✅ Correct
startDate: 2025-10-14T14:00:00
```

### **Error: Event not appearing**
```bash
# Check:
1. File in events/ folder? ✓
2. Ends with .md? ✓
3. Valid frontmatter? ✓
4. Has id, title, dates? ✓
5. GitHub Actions passed? ✓
```

### **Error: PDF not generating**
```bash
# Reinstall Puppeteer
npm install puppeteer

# Test
npm test
```

---

## 📅 Date Format Rules

```yaml
# ✅ CORRECT - ISO 8601
startDate: 2025-10-14T14:00:00
endDate: 2025-10-14T18:00:00
registrationDeadline: 2025-10-01T23:59:59

# ❌ WRONG
startDate: 14.10.2025 14:00
startDate: Oct 14, 2025
startDate: 2025-10-14          # Missing time!
```

**Format:** `YYYY-MM-DDTHH:MM:SS`
- `YYYY` = 4-digit year
- `MM` = 2-digit month (01-12)
- `DD` = 2-digit day (01-31)
- `T` = Separator (literal "T")
- `HH` = 2-digit hour (00-23)
- `MM` = 2-digit minute (00-59)
- `SS` = 2-digit second (00-59)

---

## 🎫 Event Types Cheat Sheet

### **1. Helper Event (with shifts)**
```yaml
registrationRequired: true
shifts: [...]  # Define shifts
```
**Result:** Shift selection checkboxes

### **2. Participant Event**
```yaml
registrationRequired: true
participantRegistration: true
maxParticipants: 50
```
**Result:** Participant count selection

### **3. Info Only**
```yaml
registrationRequired: false
```
**Result:** Display only, no registration

---

## 🔧 npm Scripts

```bash
npm run generate-ics      # Generate calendar.ics
npm run generate-shifts   # Generate shift PDFs
npm run generate-pdfs     # Same as above
npm test                  # Test PDF generation
```

---

## 📂 File Naming Conventions

```bash
# Events
events/chilbi-2025.md
events/grillplausch-sommer-2025.md

# Assignments
events/chilbi-2025-assignments.md
events/grillplausch-sommer-2025-assignments.md

# ❌ Don't use
events/chilbi_2025.md        # Underscore
events/Chilbi-2025.md        # Capital letters
events/chilbi-2025-plan.md   # Wrong suffix
```

---

## 🎨 Category Options

```yaml
category: Hauptveranstaltung   # Major event
category: Gesellschaftsanlass  # Social event
category: Ausflug             # Trip/outing
category: Vereinsintern       # Internal meeting
```

---

## 🏷️ Common Tags

```yaml
tags: [Chilbi, Helfer, Festwirtschaft]
tags: [Ausflug, Geselligkeit, Familie]
tags: [Übung, Ausbildung, Feuerwehr]
tags: [Vorstand, Sitzung, Administration]
```

---

## 📧 Email Fields

```yaml
# Event contact
organizer: René Käslin
email: rene.kaeslin@fwv-raura.ch

# Common emails
email: info@feuerwehrverein-raura.ch
email: webmaster@feuerwehrverein-raura.ch
email: vorstand@feuerwehrverein-raura.ch
```

---

## 🔍 Debug Commands

```bash
# Test ICS generation
node scripts/generate-ics.js

# Check event file syntax
cat events/your-event.md | head -n 30

# Validate dates
cat events/your-event.md | grep -E "startDate|endDate"

# Check GitHub Actions
# Go to: Repository → Actions tab

# View calendar file
cat calendar.ics

# Test PDF generation
node scripts/test-pdf.js
```

---

## 📊 Check Event Status

```bash
# Count events
ls events/*.md | grep -v README | grep -v assignments | wc -l

# List all events
ls events/*.md | grep -v README | grep -v assignments

# Find events with shifts
grep -l "shifts:" events/*.md

# Find events needing registration
grep -l "registrationRequired: true" events/*.md
```

---

## 🗂️ Project Structure Quick Map

```
Homepage/
├── index.html              → Main page
├── calendar.html           → Calendar view
├── events.html            → Events list
├── schichtplan-manager.html → Shift manager
├── calendar.ics           → Generated ICS feed
│
├── events/                → Event markdown files
│   ├── *.md              → Event definitions
│   └── *-assignments.md  → Shift assignments
│
├── scripts/              → Automation
│   ├── generate-ics.js   → ICS generation
│   └── generate-shift-plans.js → PDF generation
│
├── pdfs/                 → Generated PDFs
├── js/                   → JavaScript modules
└── images/               → Images and assets
```

---

## ⚡ Keyboard Shortcuts (Browser)

```
F12           → Open developer console
Ctrl+Shift+R  → Hard refresh (clear cache)
Ctrl+F        → Search in page
```

---

## 🌐 Important URLs

```
Production: https://feuerwehrverein-raura.github.io/Homepage/
Calendar:   https://feuerwehrverein-raura.github.io/Homepage/calendar.html
Events:     https://feuerwehrverein-raura.github.io/Homepage/events.html
ICS Feed:   https://feuerwehrverein-raura.github.io/Homepage/calendar.ics

Repository: https://github.com/Feuerwehrverein-Raura/Homepage
Actions:    https://github.com/Feuerwehrverein-Raura/Homepage/actions
Issues:     https://github.com/Feuerwehrverein-Raura/Homepage/issues
```

---

## 📞 Quick Contacts

```
Webmaster:   webmaster@feuerwehrverein-raura.ch
Präsident:   rene.kaeslin@fwv-raura.ch
Aktuar:      stefan.mueller@fwv-raura.ch
Info:        info@feuerwehrverein-raura.ch
```

---

## 🔄 Git Commands

```bash
# Status
git status

# Add files
git add events/new-event.md
git add .

# Commit
git commit -m "✨ Add new event"
git commit -m "🐛 Fix date format"
git commit -m "📝 Update documentation"

# Push
git push origin main

# Pull latest
git pull origin main

# View history
git log --oneline -10

# Undo last commit (keep changes)
git reset --soft HEAD~1

# Discard local changes
git checkout -- filename
```

---

## 🎯 Commit Message Emojis

```
✨ :sparkles:    New feature
🐛 :bug:         Bug fix
📝 :memo:        Documentation
🎨 :art:         Styling/formatting
♻️ :recycle:     Refactoring
🧪 :test_tube:   Tests
⚡ :zap:         Performance
🔧 :wrench:      Configuration
🚀 :rocket:      Deployment
🔥 :fire:        Remove code
```

---

## 📋 Pre-flight Checklist

Before pushing new event:

- [ ] Event file in `events/` folder
- [ ] Filename: `event-name-year.md`
- [ ] Frontmatter starts and ends with `---`
- [ ] All required fields present
- [ ] Dates in ISO 8601 format
- [ ] Valid email address
- [ ] If shifts: assignment file created
- [ ] Committed with clear message
- [ ] Pushed to GitHub
- [ ] GitHub Actions passed
- [ ] Website updated (check live)

---

## 🆘 Emergency Contacts

**Website down?**
1. Check GitHub Pages status
2. Check GitHub Actions for errors
3. Contact: webmaster@feuerwehrverein-raura.ch

**Event not showing?**
1. Wait 5 minutes (build time)
2. Hard refresh browser (Ctrl+Shift+R)
3. Check GitHub Actions
4. Verify event file format

**ICS generation failing?**
1. Check date formats in events
2. Run `node scripts/generate-ics.js` locally
3. Read error messages carefully
4. See `scripts/README.md` troubleshooting

---

## 📚 Documentation Links

- [Main README](README.md) - Project overview
- [Events README](events/README.md) - Event management
- [Scripts README](scripts/README.md) - Script details
- [PDFs README](pdfs/README.md) - PDF generation
- [JS README](js/README.md) - JavaScript modules
- [Fixes Summary](FIXES_AND_UPDATES.md) - Recent updates

---

## 💡 Tips & Tricks

**Tip 1:** Use existing events as templates
```bash
cp events/chilbi-2024.md events/chilbi-2026.md
# Edit dates and details
```

**Tip 2:** Test locally before pushing
```bash
node scripts/generate-ics.js
# Check for errors before git push
```

**Tip 3:** Use VS Code snippets
```json
{
  "Event Template": {
    "prefix": "event",
    "body": [
      "---",
      "id: ${1:event-id}",
      "title: ${2:Event Title}",
      "startDate: ${3:2025-01-01T14:00:00}",
      "endDate: ${4:2025-01-01T18:00:00}",
      "location: ${5:Location}",
      "organizer: ${6:Organizer}",
      "email: ${7:email@example.com}",
      "---",
      "",
      "# ${2:Event Title}",
      "",
      "${8:Description}"
    ]
  }
}
```

**Tip 4:** Validate dates online
```
https://www.timestamp-converter.com/
# Paste your ISO date to verify
```

**Tip 5:** Use GitHub Desktop
```
Download: https://desktop.github.com/
# Easier than command line for beginners
```

---

## ⏱️ Typical Timings

```
Event creation:        5 minutes
Git commit/push:       1 minute
GitHub Actions build:  2-3 minutes
Website update:        1 minute
Total time:           ~10 minutes
```

---

## 🎓 Learning Resources

**Git Basics:**
- https://git-scm.com/docs
- https://learngitbranching.js.org/

**Markdown:**
- https://www.markdownguide.org/
- https://daringfireball.net/projects/markdown/

**YAML:**
- https://yaml.org/
- https://www.cloudbees.com/blog/yaml-tutorial-everything-you-need-get-started

**ISO 8601 Dates:**
- https://en.wikipedia.org/wiki/ISO_8601
- https://www.iso.org/iso-8601-date-and-time-format.html

---

## 🔖 Bookmark These

```
✓ Repository: github.com/Feuerwehrverein-Raura/Homepage
✓ Live Site: feuerwehrverein-raura.github.io/Homepage
✓ Actions: github.com/Feuerwehrverein-Raura/Homepage/actions
✓ Issues: github.com/Feuerwehrverein-Raura/Homepage/issues
```

---

**Version:** 1.0.0  
**Last Updated:** October 2025  
**Maintained by:** Feuerwehrverein Raura IT Team

---

**🔥 Need help? Check the full documentation or contact webmaster@feuerwehrverein-raura.ch**
