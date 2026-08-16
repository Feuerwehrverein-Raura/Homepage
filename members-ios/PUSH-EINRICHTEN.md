# Push einrichten

Der Code ist fertig und wartet auf zwei Dateien, die nur über die Portale
zu bekommen sind. Bis sie da sind, läuft die App normal — nur ohne
Mitteilungen aufs Gerät. `PushService.isConfigured` prüft das zur
Laufzeit, damit nichts abstürzt.

Warum überhaupt Firebase: Das Backend nimmt unter
`POST members/me/fcm-token` einen **FCM**-Token entgegen, keinen
APNs-Token. Android und iOS teilen sich denselben Zustellweg. Ein
direkter APNs-Weg würde eine Änderung am Backend verlangen.

## 1. Apple: APNs-Schlüssel

Im Apple Developer Portal unter **Certificates, Identifiers & Profiles →
Keys**:

1. Neuen Schlüssel anlegen, **Apple Push Notifications service (APNs)**
   ankreuzen.
2. Die `.p8`-Datei herunterladen. **Sie lässt sich nur einmal laden** —
   danach ist sie weg.
3. **Key-ID** und **Team-ID** notieren.

Ausserdem unter **Identifiers** die App-ID `ch.fwvraura.members`
anlegen (falls noch nicht vorhanden) und dort **Push Notifications**
aktivieren.

## 2. Firebase: iOS-App registrieren

In der Firebase-Konsole, im **selben Projekt wie die Android-App** —
sonst laufen zwei getrennte Zustellwege:

1. iOS-App hinzufügen, Bundle-ID `ch.fwvraura.members`.
2. **`GoogleService-Info.plist`** herunterladen und nach
   `members-ios/Resources/` legen. XcodeGen nimmt sie beim nächsten
   `xcodegen generate` mit ins Bündel.
3. Unter **Projekteinstellungen → Cloud Messaging → Apple app
   configuration** die `.p8` aus Schritt 1 hochladen, mit Key-ID und
   Team-ID.

## 3. Firebase-SDK einbinden

In `project.yml` ergänzen:

```yaml
packages:
  Firebase:
    url: https://github.com/firebase/firebase-ios-sdk
    from: 12.12.0

targets:
  FWVMembers:
    dependencies:
      - package: Firebase
        product: FirebaseMessaging
```

Der Code ist darauf vorbereitet: `PushService` bindet Firebase über
`#if canImport(...)` ein und läuft ohne das SDK genauso.

## 4. Berechtigung im Ziel

Ebenfalls in `project.yml`, unter den Target-Settings:

```yaml
        INFOPLIST_KEY_UIBackgroundModes: remote-notification
```

Und eine `FWVMembers.entitlements` mit `aps-environment`
(`development` bzw. `production`) — Xcode legt sie beim Aktivieren der
Push-Fähigkeit selbst an, wenn das Projekt einmal signiert gebaut wird.

## 5. Prüfen

Push funktioniert **nicht im Simulator** (mit Ausnahme lokaler
Testmitteilungen). Es braucht ein echtes Gerät:

```bash
# Token-Registrierung im Log mitlesen
xcrun devicectl device info details --device <UDID>
```

Im Backend lässt sich danach prüfen, ob unter dem Mitglied ein Token
mit `platform = "ios"` steht.
