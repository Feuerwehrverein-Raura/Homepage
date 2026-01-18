---
sidebar_position: 2
---

# Audit-Log

Das Audit-Log protokolliert alle wichtigen Aktivitäten im System.

## Zugriff

1. Melde dich im Vorstand-Bereich an
2. Gehe zu "Audit-Log"

## Protokollierte Aktionen

| Aktion | Beschreibung |
|--------|--------------|
| `LOGIN_SUCCESS` | Erfolgreicher Login |
| `LOGIN_FAILED` | Fehlgeschlagener Login |
| `MEMBER_CREATE` | Mitglied erstellt |
| `MEMBER_UPDATE` | Mitglied bearbeitet |
| `MEMBER_DELETE` | Mitglied gelöscht |
| `AUDIT_VIEW` | Audit-Log angesehen |

## Log-Eintrag Format

```json
{
  "id": 123,
  "action": "MEMBER_UPDATE",
  "user_email": "aktuar@fwv-raura.ch",
  "ip_address": "192.168.1.100",
  "details": {
    "member_id": 5,
    "member_name": "Max Muster",
    "updated_fields": ["phone", "email"]
  },
  "created_at": "2026-01-18T12:30:00Z"
}
```

## Filterung

Du kannst das Log filtern nach:
- **Aktion** - z.B. nur Logins
- **E-Mail** - Aktivitäten eines bestimmten Users
- **Zeitraum** - Von/Bis Datum

## Aufbewahrung

Log-Einträge werden unbegrenzt aufbewahrt.
