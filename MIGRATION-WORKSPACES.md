# Workspace-Restructure (restructure/workspaces)

## Was sich aendert

Top-Level-Layout — alle Anwendungen wandern unter `apps/`, geteilter Code unter `packages/`,
Deployment-Konfiguration unter `infra/`:

```
vorher                                  nachher
docker/backend-members/                 apps/backend-members/
docker/backend-events/                  apps/backend-events/
docker/backend-dispatch/                apps/backend-dispatch/
docker/backend-accounting/              apps/backend-accounting/
docker/frontend-website/                apps/frontend-website/
docker/frontend-pdf-designer/           apps/frontend-pdf-designer/
docker/spam-manager/                    apps/spam-manager/
docker/wiki-docs/                       apps/wiki-docs/
docker/shared/                          packages/shared/
docker/cron/                            infra/cron/
docker/nginx/                           infra/nginx/
docker/postgres/                        infra/postgres/
docker/vaultwarden/                     infra/vaultwarden/
docker/Dockerfile.website               infra/Dockerfile.website
docker/docker-compose.prod.yml          infra/docker-compose.prod.yml
docker/docker-compose.yml               infra/docker-compose.yml
members-android/                        apps/members-android/
vorstand-android/                       apps/vorstand-android/
vorstand-desktop/                       apps/vorstand-desktop/
simple-order-system/                    apps/order-system/
                                        packages/shared-types/  (NEU)
```

Tag-Prefixe bleiben unveraendert: `members-vX.Y.Z`, `vorstand-vX.Y.Z`,
`vorstand-desktop-vX.Y.Z`, `kds-vX.Y.Z`.

## Was wurde aktualisiert

- Alle 5 GitHub-Workflows (path-filter, working-directory, build-context, find-Pfade)
- `infra/docker-compose.prod.yml` + `docker-compose.yml` build-context
- Root `package.json` mit `workspaces`-Eintrag
- Neues `packages/shared-types/` (leer, fuer schrittweise Type-Extraktion)

## Server-Deployment muss umgezogen werden

Auf `docker.fwv-raura.ch` liegt `/opt/docker/fwv-website/docker-compose.prod.yml`
weiterhin. Nach dem Merge muss einmalig:

```bash
ssh root@docker.fwv-raura.ch
cd /opt/docker/fwv-website
git pull origin main
# compose-File ist jetzt in infra/, deploy-Pfade aktualisieren falls Skripte das erwarten
```

Der Pfad zur Compose-Datei aendert sich auf dem Server, alle weiteren Path-Aenderungen
sind nur die `build:`-Contexts in der Compose — die werden ohnehin nur beim lokalen
Build verwendet (CI baut + pusht ueber ghcr.io).

## Migration-Strategie fuer shared-types

Naechster Schritt nach Merge: einzelne Modelle aus den Apps in
`packages/shared-types/` extrahieren — nicht in einem Schwung, sondern beim
naechsten Anfassen jeder API:

1. `Member` (Backend `members-api` -> `shared-types/member.ts`)
2. `Event` + `Registration`
3. `MailMessage`, `MailListItem` (aktuell dupliziert in vorstand-desktop +
   vorstand-web)
4. Notification-Types als Constant-Strings

Konsumenten importieren via `import type { Member } from '@fwv/shared-types'`.

## Rollback

Falls etwas bricht: Branch nicht mergen. Die `git mv`-History laesst sich auch
einzelne Dateien blamen — keine History geht verloren.
