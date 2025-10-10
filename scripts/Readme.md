# 📜 Scripts Documentation

This directory contains automation scripts for the Feuerwehrverein Raura Homepage project.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Scripts](#scripts)
  - [generate-ics.js](#generate-icsjs)
  - [generate-shift-plans.js](#generate-shift-plansjs)
  - [test-pdf.js](#test-pdfjs)
- [Requirements](#requirements)
- [Usage](#usage)
- [Troubleshooting](#troubleshooting)

---

## 🎯 Overview

These scripts automate various tasks for the homepage:

| Script | Purpose | Trigger | Output |
|--------|---------|---------|--------|
| `generate-ics.js` | Generate calendar ICS file | GitHub Actions / Manual | `calendar.ics` |
| `generate-shift-plans.js` | Generate shift plan PDFs | Manual | `pdfs/*.pdf` |
| `test-pdf.js` | Test PDF generation | Manual | Test PDFs |

---

## 📜 Scripts

### generate-ics.js

**Purpose:** Generates an ICS (iCalendar) file from all markdown event files

**Features:**
- ✅ Parses YAML frontmatter from event markdown files
- ✅ Validates date formats (ISO 8601)
- ✅ Handles multiple line endings (Windows/Unix)
- ✅ Skips assignment files and README.md
- ✅ Creates RFC 5545 compliant ICS format
- ✅ Detailed error logging with filename context

**Input:**
```
events/*.md  (excluding *-assignments.md and README.md)
```

**Output:**
```
calendar.ics  (in project root)
```

**Date Format Requirements:**
```yaml
# ✅ Correct - ISO 8601 format
startDate: 2025-10-14T14:00:00
endDate: 2025-10-14T18:00:00

# ❌ Incorrect formats
startDate: 14.10.2025 14:00
startDate: October 14, 2025 2pm
startDate: 2025-10-14  # Missing time component
```

**Required Frontmatter Fields:**
- `id` - Unique event identifier
- `title` - Event title
- `startDate` - Event start (ISO 8601)
- `endDate` - Event end (ISO 8601)

**Optional Fields:**
- `location` - Event location
- `organizer` - Organizer name
- `email` - Contact email
- `category` - Event category
- `registrationDeadline` - Registration deadline (ISO 8601)

**Error Handling:**
- Invalid dates: Logs warning, skips event
- Missing fields: Logs warning, skips event
- Parse errors: Logs error with details, continues
- No events: Creates empty calendar

**Usage:**
```bash
# Manual run
node scripts/generate-ics.js

# Via npm script
npm run generate-ics

# Automated via GitHub Actions
# Triggered on push to events/** or daily at 6:00 AM
```

**Output Example:**
```
🚀 Starting ICS generation...

📁 Found 5 files in events directory
⏭️  Skipping: README.md
⏭️  Skipping: chilbi-2025-assignments.md
✅ Loaded: Chilbi 2025 (2025-10-14T12:00:00.000Z)
✅ Loaded: Grillplausch Sommer (2025-06-17T14:00:00.000Z)

📊 Total events loaded: 2

✅ Generated calendar.ics with 2 events
📍 Output: /path/to/Homepage/calendar.ics
```

---

### generate-shift-plans.js

**Purpose:** Generates PDF work schedules for events with shift assignments

**Features:**
- ✅ Loads event data and shift assignments
- ✅ Generates individual shift plan PDFs
- ✅ Creates overview PDF with all events
- ✅ Uses Puppeteer for PDF generation
- ✅ Matches original "Arbeitsplan Chilbi" format
- ✅ Handles multi-day events with shift grouping

**Input:**
```
events/*.md                    # Event definitions
events/*-assignments.md        # Shift assignments
```

**Output:**
```
pdfs/
├── arbeitsplan-[event-id].pdf
├── arbeitsplan-[event-id].html
└── overview-all-events.pdf
```

**PDF Structure:**
```
Feuerwehrverein Raura, Kaiseraugst
Arbeitsplan [Event Title]

Aufbau [Date] ab [Time] für [Event]
- Person 1
- Person 2
[...]

[Day], [Date]    Küche           Bar             Service/Kasse
12:00-14:00     - Person A      - Person B      - Person C
                -               -               -
14:00-16:00     - Person D      - Person E      - Person F
[...]

Springer: [Names]

Abbau [Date]
- Person X
- Person Y
```

**Usage:**
```bash
# Generate all shift plans
node scripts/generate-shift-plans.js

# Or via npm script
npm run generate-shifts
npm run generate-pdfs  # Alias
```

**Requirements:**
- Node.js >= 14.0.0
- Puppeteer ^21.0.0
- Events with `shifts` array in frontmatter
- Corresponding `-assignments.md` files

---

### test-pdf.js

**Purpose:** Test PDF generation functionality without full event data

**Features:**
- ✅ Creates sample event with mock data
- ✅ Tests single event PDF generation
- ✅ Tests overview PDF generation
- ✅ Validates file creation and sizes
- ✅ Provides detailed output logs

**Usage:**
```bash
node scripts/test-pdf.js
```

**Output:**
```
🧪 PDF Generation Test
📄 Generating single event PDF...
✅ Event PDF created: pdfs/arbeitsplan-test-event.pdf
📄 Generating overview PDF...
✅ Overview PDF created: pdfs/overview-all-events.pdf
✅ PDF generator closed

🎉 PDF Generation Test Complete!

Generated files:
- Event PDF: pdfs/arbeitsplan-test-event.pdf
- Overview PDF: pdfs/overview-all-events.pdf

File information:
- Event PDF: 45.2 KB
- Overview PDF: 38.7 KB
```

---

## 🔧 Requirements

### System Requirements
```bash
# Node.js version
node --version  # Should be >= 14.0.0

# Check npm
npm --version
```

### Dependencies

**Production:**
```json
{
  "puppeteer": "^21.0.0",
  "html-pdf": "^3.0.1",
  "jspdf": "^2.5.1"
}
```

**Installation:**
```bash
# Install all dependencies
npm install

# Or install specific packages
npm install puppeteer html-pdf jspdf
```

---

## 🚀 Usage

### Local Development

```bash
# Clone repository
git clone https://github.com/Feuerwehrverein-Raura/Homepage.git
cd Homepage

# Install dependencies
npm install

# Run ICS generation
npm run generate-ics

# Run shift plan generation
npm run generate-shifts

# Test PDF generation
node scripts/test-pdf.js
```

### GitHub Actions Integration

The `generate-ics.js` script runs automatically via GitHub Actions:

**Triggers:**
- Push to `events/**` (any .md file changes)
- Daily at 6:00 AM UTC (scheduled)

**Workflow File:** `.github/workflows/generate-calendar.yml`

**Manual Trigger:**
```bash
# In GitHub
Actions → Generate Calendar ICS → Run workflow
```

---

## 🐛 Troubleshooting

### Common Issues

#### Issue 1: "Invalid time value" Error

**Symptom:**
```
Error generating ICS file: RangeError: Invalid time value
```

**Causes:**
- Invalid date format in event frontmatter
- Missing date fields
- Incorrect ISO 8601 format

**Solution:**
```yaml
# ✅ Fix date format
startDate: 2025-10-14T14:00:00  # Must include time
endDate: 2025-10-14T18:00:00    # ISO 8601 format

# Check for typos
starDate: ...   # ❌ Wrong
startDate: ...  # ✅ Correct
```

**Debug:**
```bash
# Run script with verbose output
node scripts/generate-ics.js

# Check each event file
cat events/your-event.md | grep -A2 "startDate"
```

---

#### Issue 2: No Events Generated

**Symptom:**
```
⚠️ No events found to generate ICS file
✅ Generated empty calendar.ics (no events available)
```

**Causes:**
- No `.md` files in `events/` folder
- All events are `-assignments.md` files
- Frontmatter parsing errors

**Solution:**
```bash
# Check event files exist
ls -la events/*.md

# Verify frontmatter format
head -n 20 events/your-event.md

# Ensure proper YAML syntax
---
id: test-event
title: Test Event
startDate: 2025-10-14T14:00:00
endDate: 2025-10-14T18:00:00
---
```

---

#### Issue 3: PDF Generation Fails

**Symptom:**
```
❌ Error generating PDF: ...
```

**Causes:**
- Puppeteer not installed
- Missing event data
- No assignment files

**Solution:**
```bash
# Reinstall Puppeteer
npm install puppeteer

# Check assignment files exist
ls events/*-assignments.md

# Run test first
node scripts/test-pdf.js
```

---

#### Issue 4: GitHub Actions Permission Denied

**Symptom:**
```
Error: Process completed with exit code 1
Permission denied
```

**Solution:**
```yaml
# In .github/workflows/generate-calendar.yml
# Ensure permissions are set:
permissions:
  contents: write  # Required for pushing
```

---

### Debug Mode

Enable detailed logging:

```bash
# Set DEBUG environment variable
DEBUG=* node scripts/generate-ics.js

# Or add console.log in scripts
# Already implemented in generate-ics.js
```

---

## 📚 Additional Resources

### Date Format References
- [ISO 8601 Standard](https://en.wikipedia.org/wiki/ISO_8601)
- [JavaScript Date](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date)

### ICS Format
- [RFC 5545 (iCalendar)](https://tools.ietf.org/html/rfc5545)
- [ICS File Format](https://icalendar.org/)

### PDF Generation
- [Puppeteer Docs](https://pptr.dev/)
- [html-pdf](https://www.npmjs.com/package/html-pdf)

---

## 🔄 Script Maintenance

### Adding New Scripts

1. Create script file in `scripts/` directory
2. Add npm script to `package.json`:
   ```json
   "scripts": {
     "your-script": "node scripts/your-script.js"
   }
   ```
3. Document in this README
4. Add error handling and logging

### Best Practices

- ✅ Use clear, descriptive console.log messages
- ✅ Include emoji prefixes (📄, ✅, ❌, ⚠️) for readability
- ✅ Validate all inputs before processing
- ✅ Handle errors gracefully with try-catch
- ✅ Log file paths and counts
- ✅ Use `process.exit(1)` for errors
- ✅ Test with edge cases

---

## 📞 Support

**Issues with scripts:**
- 🐛 Report bugs: [GitHub Issues](https://github.com/Feuerwehrverein-Raura/Homepage/issues)
- 📧 Technical contact: webmaster@feuerwehrverein-raura.ch
- 📖 Main README: [../README.md](../README.md)
- 📝 Event README: [../events/README.md](../events/README.md)

---

**Last Updated:** October 2025  
**Maintained by:** Feuerwehrverein Raura IT Team
