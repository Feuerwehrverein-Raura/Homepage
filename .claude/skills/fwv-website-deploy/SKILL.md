---
name: fwv-website-deploy
description: Aenderungen an der Vereins-Website (docker/frontend-website) oder einem anderen Container sofort live bringen — committen, pushen, auf den gruenen CI-Lauf warten, dann Watchtower --run-once auf docker.fwv-raura.ch fuer genau diesen Container, live pruefen, protokollieren. Verwenden, wenn der Nutzer "deployen", "live", "pushen" sagt oder eine Website-Aenderung sehen will. Nicht fuer die Mitglieder-App (dafuer fwv-members-release).
---

# Website / Container sofort ausliefern

Der Push allein reicht nicht: Watchtower auf dem Server laeuft nur
**stuendlich zur vollen Stunde**. Der Nutzer will nicht warten — also immer
selbst einspielen, sobald CI gruen ist. Nicht nachfragen, nicht ankuendigen
"kommt um 18:00 live".

## Schritte

1. **Vor dem Commit den Diff ansehen.** Dateien werden oft parallel in
   anderen Sitzungen geaendert — nur die eigenen Aenderungen stagen
   (`git add <datei>`, nie `git add -A`).
2. **Commit + Push:**
   ```sh
   git commit -q -F - <<'EOF' … EOF
   git pull --rebase -q && git push
   ```
   Der Rebase ist fast immer noetig: semantic-release pusht nach jedem Lauf
   einen `chore(release)`-Commit auf `main`.
3. **Auf den Build warten** (Workflow "Build and Push Docker Containers").
   Run-ID ueber den Commit holen — `gh run list --commit` liefert hier oft
   nichts, deshalb:
   ```sh
   ID=$(gh run list --limit 5 --json databaseId,headSha \
     -q '[.[] | select(.headSha|startswith("<sha7>"))][0].databaseId')
   gh run watch $ID --exit-status --interval 15 >/dev/null; echo $?
   ```
   Erst bei `success` weiter. Bei Fehler: Log lesen (`gh run view $ID --log-failed`).
4. **Heinzel-Onboarding fuer docker.fwv-raura.ch** (CLAUDE.md,
   rules/first-connection.md) — kurz in einem SSH-Aufruf: OS, Aktivitaet der
   letzten Tage, sudo-Probe. Server-Memory:
   `memory/servers/docker.fwv-raura.ch/memory.md`. SSH-User `stefan`.
5. **Einspielen** — nur die betroffenen Container, nicht zur vollen Stunde
   (sonst kollidiert es mit dem regulaeren Watchtower):
   ```sh
   ssh -o BatchMode=yes -o ConnectTimeout=5 stefan@docker.fwv-raura.ch \
     'sudo docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
      -e WATCHTOWER_CLEANUP=true nickfedor/watchtower:latest \
      --run-once fwv-frontend-website 2>&1 | tail -4'
   ```
   Erwartet: `updated=1 failed=0`. Weitere Container-Namen: `fwv-api-events`,
   `fwv-api-members`, … (siehe Server-Memory).
6. **Live pruefen** nach ~20 s mit einem Text, der nur in der neuen Fassung
   steht: `curl -s https://www.fwv-raura.ch/<seite> | grep -c "<neuer Text>"`.
7. **Protokollieren:**
   ```sh
   ssh … stefan@docker.fwv-raura.ch "logger -t heinzel '<container> per Watchtower --run-once (<was>)'"
   ```
   und im lokalen `memory/servers/docker.fwv-raura.ch/changelog.log` im
   vorhandenen Format: `[YYYY-MM-DD HH:MM] website --run-once: <was>.`
   Dort auch `Last connected` in `memory.md` aktualisieren.

## Vor dem Commit pruefen (Website)

- Statisches HTML mit Tailwind-CDN, Vereinsfarbe `fire-*` (#B91C1C ist
  `fire-700`). Lokaler Screenshot zum Pruefen:
  ```sh
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
    --disable-gpu --hide-scrollbars --window-size=1280,1500 \
    --virtual-time-budget=6000 --screenshot=$SCRATCH/x.png "file://$PWD/index.html"
  ```
  Vorstandskarte zeigt lokal einen Ladefehler (keine API) — normal.
- Keine Links erfinden. Social Media: Instagram
  `instagram.com/feuerwehrvereinraura/`, Facebook
  `facebook.com/p/Feuerwehrverein-Raura-61582127545324/` (Teilen-Links
  `facebook.com/share/…` ueber `og:url` aufloesen).
- Gebaut wird `docker/frontend-website/` (nicht `docker/Dockerfile.website`).
