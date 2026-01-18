---
sidebar_position: 3
---

# System-Einstellungen

## Umgebungsvariablen

Die Anwendung wird über Umgebungsvariablen konfiguriert:

### API Members
| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `DATABASE_URL` | PostgreSQL Connection String | - |
| `JWT_SECRET` | Secret für Token-Signierung | - |
| `ADMIN_EMAIL` | Admin E-Mail | admin@fwv-raura.ch |
| `ADMIN_PASSWORD` | Admin Passwort | - |
| `IMAP_HOST` | Mailcow IMAP Server | - |
| `VORSTAND_EMAILS` | Erlaubte Vorstand-E-Mails | - |

### API Events
| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `DATABASE_URL` | PostgreSQL Connection String | - |
| `JWT_SECRET` | Secret für Token-Signierung | - |
| `DISPATCH_API_URL` | URL der Dispatch API | - |

### API Dispatch
| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `DATABASE_URL` | PostgreSQL Connection String | - |
| `SMTP_HOST` | SMTP Server | - |
| `SMTP_PORT` | SMTP Port | 587 |
| `SMTP_USER` | SMTP Benutzer | - |
| `SMTP_PASSWORD` | SMTP Passwort | - |
| `MAILCOW_API_URL` | Mailcow API URL | - |
| `MAILCOW_API_KEY` | Mailcow API Key | - |

## Deployment

Die Anwendung läuft auf Docker mit:
- **Traefik** als Reverse Proxy
- **Watchtower** für automatische Updates
- **PostgreSQL** als Datenbank

### Container aktualisieren

Container werden automatisch via Watchtower aktualisiert, wenn neue Images gepusht werden.

Manuelles Update:
```bash
docker pull ghcr.io/feuerwehrverein-raura/fwv-raura-api-members:latest
docker compose up -d
```
