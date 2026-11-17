# iOS-Patches für den TestFlight-Build

Stand: 2026-11-17, geprüft gegen `origin/main` `78109aa` (Capacitor 8.5.3, Swift Package Manager, kein CocoaPods).
Hier liegen **nur Vorlagen**. Unter `ios/` wurde nichts geändert und nichts committet. Du spielst die Änderungen selbst ein, prüfst sie in Xcode und entscheidest, ob du sie später committest (`ios/` gehört nur absichtlich in einen Commit, siehe `CLAUDE.md`).

| Datei | Wohin | Pflicht? |
|---|---|---|
| `Info.plist.patch` | `ios/App/App/Info.plist` per `git apply` | ja (enthält 4 Pflicht- und 3 empfohlene Änderungen) |
| `Info.plist.additions.xml` | dieselben Änderungen zum Abtippen/Kopieren, mit Begründung je Schlüssel | Alternative zum Patch |
| `PrivacyInfo.xcprivacy` | neue Datei `ios/App/App/PrivacyInfo.xcprivacy`, **im Target „App“** | ja |

Die Projekt-Einstellungen (Team, Version, Build-Nummer, Geräte) änderst du in der Xcode-Oberfläche, nicht per Patch – siehe Abschnitt 3.

---

## 1. Info.plist

Am einfachsten im Terminal, im Projektordner, auf dem Branch, aus dem du baust (z. B. `test/friends-build`):

- [ ] `git status --short ios/` ist leer (sonst erst klären, was dort schon geändert ist)
- [ ] `git apply --check docs/friend-test/ios-patches/Info.plist.patch` meldet nichts (= passt)
- [ ] `git apply docs/friend-test/ios-patches/Info.plist.patch`
- [ ] `plutil -lint ios/App/App/Info.plist` meldet `OK`
- [ ] `git diff ios/App/App/Info.plist` ansehen: 7 Änderungen (siehe Tabelle)

Falls `git apply --check` scheitert (jemand hat die Datei inzwischen geändert): Xcode öffnen → links `App` → `App` → `Info.plist` → Rechtsklick → **Open As → Source Code** und die Blöcke aus `Info.plist.additions.xml` von Hand übernehmen.

| # | Schlüssel | Änderung | Warum |
|---|---|---|---|
| 1 | `ITSAppUsesNonExemptEncryption` | neu, `false` | Exportkonformität; sonst fragt App Store Connect bei jedem Build nach und der Build bleibt auf „Missing Compliance“ |
| 2 | `NSCalendarsFullAccessUsageDescription`, `NSCalendarsUsageDescription` | Text konkreter (Dienste/Schichten, nur lesen) | Apple lehnt vage Texte ab; Text muss Daten **und** Nutzen nennen |
| 3 | `NSHealthShareUsageDescription` | Text nennt die gelesenen Daten und den Zweck | alter Text „um dein Training zu analysieren“ ist zu vage |
| 4 | `NSHealthUpdateUsageDescription` | ehrlicher Text („liest nur“) | App fragt nie Schreibrechte an; Schlüssel muss aber bleiben, weil das Health-Plugin Schreib-APIs enthält |
| 5 | `CFBundleDevelopmentRegion` | `en` → `de` | App läuft fest auf Deutsch |
| 6 | `UISupportedInterfaceOrientations` | nur Hochformat | App ist nicht fürs Querformat gebaut |
| 7 | `UIRequiredDeviceCapabilities` | `armv7` → `arm64` | Altlast der Capacitor-Vorlage, harmlos |

Mitteilungen (lokale Trainings-Erinnerung) brauchen **keinen** Info.plist-Text – iOS zeigt seinen eigenen Dialog.

## 2. Privacy Manifest (`PrivacyInfo.xcprivacy`)

Seit Mai 2024 verlangt Apple für jede App ein Privacy Manifest, sobald sie bestimmte „Required-Reason-APIs“ nutzt. MyRace nutzt über das Plugin `@capacitor/preferences` **UserDefaults**; das Plugin bringt kein eigenes Manifest mit. Fehlt der Eintrag, kommt nach dem Upload eine Mail „ITMS-91053: Missing API declaration“ (inzwischen wird der Upload abgelehnt).

So fügst du die Datei ein (wichtig: **über Xcode**, sonst landet sie nicht im App-Bundle):

- [ ] Xcode öffnen (`npx cap open ios`)
- [ ] Links im Projekt-Navigator den gelben Ordner **App** (unter dem blauen Projekt „App“) markieren
- [ ] Menü **File → Add Files to "App"…**
- [ ] `docs/friend-test/ios-patches/PrivacyInfo.xcprivacy` auswählen
- [ ] im Dialog: **Copy items if needed** (bzw. „Action: Copy“) an, **Add to targets: App** angehakt → **Add**
- [ ] Kontrolle: Datei liegt jetzt in `ios/App/App/PrivacyInfo.xcprivacy`; Target „App“ → **Build Phases → Copy Bundle Resources** enthält `PrivacyInfo.xcprivacy`
- [ ] Datei in Xcode anklicken: sie öffnet sich als Tabelle („Privacy Tracking Enabled: NO“, „Privacy Accessed API Types: 1 item“)

Damit ändert sich auch `ios/App/App.xcodeproj/project.pbxproj` – das ist gewollt.

**Was drinsteht und warum**

- `NSPrivacyAccessedAPICategoryUserDefaults` mit Grund `CA92.1` (die App liest nur ihre eigenen Werte).
- Kein `FileTimestamp`, `SystemBootTime`, `DiskSpace`: am Code geprüft (`node_modules/@capacitor/*/ios`, `@capgo/capacitor-health`, `@ebarooni/capacitor-calendar`, `AppDelegate.swift`, `SceneDelegate.swift`) – nicht genutzt. Das Kalender-Plugin liest `EKEvent.creationDate`; das ist ein Termin-Feld, kein Datei-Zeitstempel.
- `@capacitor/ios` (Capacitor, Cordova) bringt eigene Manifeste mit (leer). Keine weiteren Plugins mit eigenem Manifest gefunden.
- „Erhobene Daten“ (E-Mail, Nutzer-ID, Gesundheit, Fitness, sonstige Inhalte, Support, Produktinteraktion, Absturzdaten), kein Tracking. Diese Liste muss zu deinen Angaben unter **App Store Connect → App → App-Datenschutz** passen (für TestFlight noch nicht Pflicht, vor dem App-Store-Release schon). Wenn du Sentry nicht nutzt (`REACT_APP_SENTRY_DSN` leer), kannst du den Block `CrashData` löschen.

Erneut prüfen, wenn ein **neues Capacitor-Plugin** dazukommt (z. B. `@capacitor/filesystem` → FileTimestamp, `@capacitor/device` → DiskSpace).

## 3. Einstellungen in Xcode (kein Patch)

Xcode → links blaues Projekt **App** → unter TARGETS **App**:

**Reiter „Signing & Capabilities“**
- [ ] **Automatically manage signing**: an
- [ ] **Team**: dein bezahltes Team (heißt wie du, z. B. „Anton Albers“), **nicht** „… (Personal Team)“. Im Projekt steht heute `DEVELOPMENT_TEAM = R8MHV8V5N8` – vermutlich das kostenlose Personal Team; Xcode trägt beim Wechsel die neue Team-ID ein.
- [ ] **Bundle Identifier**: `com.anton.myrace` (steht schon so in `project.pbxproj` und `capacitor.config.ts`)
- [ ] Capability **HealthKit** ist sichtbar (Entitlement `com.apple.developer.healthkit` steht schon in `App/App.entitlements`). „Clinical Health Records“ und „Background Delivery“ **aus** lassen – nicht benutzt.
- [ ] Keine weiteren Capabilities nötig: keine Associated Domains (App nutzt nur das URL-Schema `myrace://`), keine Push Notifications (siehe Risiko in `testflight.md`), kein Background Mode.

**Reiter „General“**
- [ ] **Supported Destinations**: nur **iPhone** (iPad mit „–“ entfernen). Empfehlung: Die App ist nicht für iPad gestaltet; mit iPad-Unterstützung testet Apple später im App-Review auch auf dem iPad. Ändert `TARGETED_DEVICE_FAMILY` von `"1,2"` auf `1`.
- [ ] **Minimum Deployments**: iOS **15.0** (bleibt; passt zu `CapApp-SPM/Package.swift`)
- [ ] **Identity → Version**: `1.0` (= `MARKETING_VERSION`)
- [ ] **Identity → Build**: `1` für den ersten Upload, danach bei **jedem** Upload +1 (2, 3, …). Version `1.0` bleibt für den ganzen Freundes-Test gleich.
- [ ] **App Icons and Launch Screen → App Icon**: `AppIcon` (eine 1024×1024-Datei, RGB, **ohne Alpha** – geprüft, passt; Xcode erzeugt alle kleineren Größen selbst)

**Hinweis:** In der Debug-Konfiguration verweist das Projekt auf `ios/App/debug.xcconfig`, die Datei fehlt im Repo und lokal. Das ergibt beim Debug-Build höchstens eine gelbe Warnung; **Archive** baut in Release und ist nicht betroffen.

## 4. Kontrolle vor dem Archive

- [ ] `plutil -lint ios/App/App/Info.plist ios/App/App/PrivacyInfo.xcprivacy` → zweimal `OK`
- [ ] Xcode oben: Schema **App**, Ziel **Any iOS Device (arm64)**
- [ ] Product → Build (⌘B) läuft ohne roten Fehler durch
