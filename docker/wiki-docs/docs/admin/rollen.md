---
sidebar_position: 1
---

# Rollen & Berechtigungen

## Rollen-Hierarchie

```
Admin
  └── Vorstand
        ├── Präsident
        ├── Vizepräsident
        ├── Aktuar
        ├── Kassier
        ├── Materialwart
        └── Beisitzer
```

## Berechtigungen

| Aktion | Vorstand | Admin |
|--------|----------|-------|
| Mitglieder ansehen | ✅ | ✅ |
| Mitglieder erstellen | ✅ | ✅ |
| Mitglieder bearbeiten | ✅ | ✅ |
| Mitglieder löschen | ❌ | ✅ |
| Events verwalten | ✅ | ✅ |
| Audit-Log ansehen | ✅ | ✅ |
| Mailcow verwalten | ✅ | ✅ |
| System-Einstellungen | ❌ | ✅ |

## Admin-Rolle zuweisen

1. Gehe zu Mitglieder
2. Wähle das Mitglied aus
3. Setze "Funktion" auf "Admin"
4. Speichern

Das Mitglied hat nun volle Admin-Rechte.

## Technische Details

Die Rolle wird im JWT-Token gespeichert:

```json
{
  "email": "user@fwv-raura.ch",
  "role": "admin",
  "groups": ["vorstand", "admin"],
  "type": "vorstand"
}
```
