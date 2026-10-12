---
name: fwv-members-release
description: Neue Version der Mitglieder-App (Flutter, flutter/mitglieder, com.fwv.members) in den Google-Play-Test bringen — Versionshinweise schreiben, Tag members-vX.Y.Z setzen, Build Android Members beobachten. Verwenden, wenn eine App-Aenderung bei den Mitgliedern ankommen soll ("Release", "neue Version", "in den Play Store"). Ein normaler Push auf main baut die App nur zur Kontrolle.
---

# Mitglieder-App releasen

Ein Push auf `main` startet nur "Flutter-Apps" (Analyse, Tests,
Debug-Build). In den Play Store kommt erst etwas mit einem Tag
`members-vX.Y.Z` → Workflow `build-android-members.yml`: Tests, signiertes
AAB + APK, Upload in den internen Track, Hochstufen in den geschlossenen
Test (`alpha`), GitHub-Release, rollender Zeiger `members-latest` (den
verlinken Website und Anleitung).

## Schritte

1. **Letzte Version:** `git tag -l 'members-v*' --sort=-v:refname | head -1`.
   Naechste Patch-Version, ausser der Nutzer sagt etwas anderes.
2. **Versionshinweise** in `flutter/mitglieder/play/whatsnew/whatsnew-de-CH`
   ersetzen (nicht anhaengen): nur was seit dem letzten Tag neu ist,
   Aufzaehlung mit `• `, fuer Mitglieder verstaendlich, max. 500 Zeichen.
   Was neu ist: `git log --oneline members-vLETZTE..HEAD -- flutter/`.
   Nur diese Datei pflegen: der Workflow kopiert sie als `whatsnew-de-DE`
   (Standardsprache der App in Play ist de-DE). Was Play gespeichert hat,
   zeigt der Workflow `play-zeigen.yml`.
3. Commit `chore(members): Versionshinweise X.Y.Z`, dann
   ```sh
   git pull --rebase -q && git push
   git tag members-vX.Y.Z && git push origin members-vX.Y.Z
   ```
   Version und versionCode leitet der Workflow aus dem Tag ab
   (`X*10000+Y*100+Z`) — `pubspec.yaml` nicht anfassen.
4. **Beobachten:** `gh run list --workflow build-android-members.yml --limit 1`,
   dann `gh run watch <id> --exit-status`. Schlaegt nur das Hochstufen fehl:
   Workflow `play-hochstufen.yml` von Hand (versionCode, internal → alpha).
   Schlaegt etwas anderes fehl: Log lesen (`gh run view <id> --log-failed`),
   Ursache beheben (nie nur neu starten), dann Tag verschieben:
   `git push origin :refs/tags/members-vX.Y.Z && git tag -f members-vX.Y.Z
   && git push origin members-vX.Y.Z` und wieder beobachten.
5. **Workflow geaendert?** Der Release-Job setzt
   `defaults.run.working-directory: flutter/mitglieder` - Pfade in neuen
   `run:`-Schritten sind relativ dazu (oder `working-directory:
   ${{ github.workspace }}` setzen). Release 1.0.7 scheiterte genau daran.

## Tester-Zugang (geschlossener Test)

Mitglieder schalten sich selbst frei: Google-Gruppe
`groups.google.com/g/fwv-raura-app` (Sichtbarkeit "Jeder im Web", Beitritt
"Jeder kann beitreten"), dann Opt-in
`play.google.com/apps/testing/com.fwv.members`. Beschrieben in
`docker/frontend-website/anleitung-app.html` und `apps.html`.

## App-Symbol

Android-Launcher-Icons (`flutter/mitglieder/android/app/src/main/res/mipmap-*`)
sind aus dem Play-Store-Icon
`members-android/app/src/main/play/listings/de-CH/graphics/icon/icon.png`
erzeugt: Motiv 300/432 px mittig auf #B91C1C (= Hintergrund des Motivs und
`@color/primary`). Aendert sich das Play-Icon, die Symbole genauso neu
erzeugen. Das iOS-Icon (AppIcon-1024) zeigt noch das runde Abzeichen;
angleichen braucht das Motiv in 1024 px.
