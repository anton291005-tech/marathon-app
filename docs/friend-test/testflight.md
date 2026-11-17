# TestFlight-Checkliste – MyRace Freundes-Test

Stand: 2026-11-17 (Nacht), geprüft gegen `origin/main` `78109aa`. Paket W5 aus `docs/friend-test/plan.md`.
Für: Anton, erster TestFlight-Upload. Ziel: Dienstag Developer-Account beantragen, Mittwoch hochladen, ab Donnerstag 3–4 Freunde auf dem iPhone.

Nur Dokumentation. Unter `ios/` wurde nichts geändert. Die fertigen Änderungen liegen in `docs/friend-test/ios-patches/` (Anleitung dort im `README.md`).

**Inhalt**
1. Das Wichtigste in Kürze
2. Prüfung des iOS-Projekts (Befunde)
3. Vorher einstellen: Vercel, Supabase, Strava
4. Build-Variablen für die App (`REACT_APP_*`)
5. Schritt für Schritt ab „Developer-Account freigeschaltet“
6. Text „Was testen?“
7. Typische Fehler und Lösungen
8. Risiken und offene Punkte
9. Quellen

---

## 1. Das Wichtigste in Kürze

Fünf Dinge, ohne die der Freundes-Test scheitert – in dieser Reihenfolge erledigen:

- [ ] **E-Mail-Versand in Supabase** (Abschnitt 3.2): Der eingebaute Supabase-Mailversand schickt nur an Mitglieder deines Supabase-Teams. Deine Freunde bekämen keine Bestätigungs-Mail und kämen nicht ins Konto. Entweder eigenen SMTP-Dienst eintragen oder für den Test „Confirm email“ ausschalten.
- [ ] **Server-Code live auf Production** (Abschnitt 3.1): Die iOS-App ruft immer `https://marathon-app-alpha.vercel.app` auf. Neue Server-Teile aus dem Freundes-Build (z. B. `api/strava/sync.js` aus W2) wirken erst, wenn sie dort deployt sind. Previews gehen nicht (Deployment Protection).
- [ ] **Migrationen 023 → 024 → 025** im Supabase-SQL-Editor, bevor die Freunde die App öffnen.
- [ ] **Strava**: Athleten-Kapazität von 1 (Single Player Mode) auf 10 erhöhen und Strava-Abo aktiv halten, sonst kann sich nur dein eigenes Konto verbinden.
- [ ] **Info.plist-Patch und Privacy Manifest** einspielen (`ios-patches/README.md`), dann Archive und Upload.

Empfehlung für die Tester: **externe Gruppe** mit Einladung per E-Mail oder öffentlichem Link (Abschnitt 5, Schritt M). Plan B, falls die kurze Beta-Prüfung von Apple bis Donnerstag nicht durch ist: interne Tester.

---

## 2. Prüfung des iOS-Projekts (Befunde)

Geprüft: `ios/App/App/Info.plist`, `ios/App/App.xcodeproj/project.pbxproj`, `ios/App/App/App.entitlements`, `ios/App/App/Assets.xcassets/AppIcon.appiconset`, `ios/App/App/AppDelegate.swift`, `SceneDelegate.swift`, `ios/App/CapApp-SPM/Package.swift`, `capacitor.config.ts`, Plugins in `node_modules`.

Legende: **Pflicht** = ohne das scheitert Upload oder Prüfung · **Empfohlen** = besser vor dem Test · **ok** = passt.

| # | Punkt | Ist | Soll / Lösung | Bewertung |
|---|---|---|---|---|
| 1 | Bundle-ID | `com.anton.myrace` (Debug + Release, `capacitor.config.ts` `appId`) | so lassen | ok |
| 2 | App-Name auf dem Homescreen | `CFBundleDisplayName` = `MyRace` | so lassen | ok |
| 3 | Version / Build | `MARKETING_VERSION = 1.0`, `CURRENT_PROJECT_VERSION = 1` | erster Upload `1.0 (1)`, jeder weitere Upload Build +1 (`1.0 (2)`, …). Version bleibt `1.0` für den ganzen Test | ok |
| 4 | Team | `DEVELOPMENT_TEAM = R8MHV8V5N8`, `CODE_SIGN_STYLE = Automatic` | vermutlich kostenloses Personal Team → in Xcode auf das bezahlte Team umstellen (Abschnitt 5, Schritt C) | Pflicht |
| 5 | Exportkonformität | `ITSAppUsesNonExemptEncryption` **fehlt** | `false` ergänzen (Patch) | Pflicht |
| 6 | Privacy Manifest | `PrivacyInfo.xcprivacy` **fehlt** in der App | neue Datei mit UserDefaults `CA92.1` (für `@capacitor/preferences`) – Vorlage im Patch-Ordner | Pflicht |
| 7 | Kalender-Text | `NSCalendarsFullAccessUsageDescription` + `NSCalendarsUsageDescription` vorhanden, Deutsch, ordentlich | konkreter: Dienste/Schichten nennen, „ändert und löscht keine Termine“ (Patch). Die App liest nur (`requestFullCalendarAccess`, `listEventsInRange`), Full Access ist also richtig | Empfohlen |
| 8 | Health lesen | „Diese App liest deine Trainingsdaten, um dein Training zu analysieren.“ | zu vage (Apple lehnt solche Texte regelmäßig ab). Neuer Text nennt Datenarten und Zweck (Patch) | Pflicht |
| 9 | Health schreiben | „Diese App speichert Trainingsdaten, um deinen Fortschritt zu verbessern.“ | App schreibt nie in Health (`requestAuthorization` nur mit `read`). Schlüssel bleibt nötig, weil das Plugin `@capgo/capacitor-health` Schreib-APIs enthält; Text ehrlich machen (Patch) | Pflicht |
| 10 | Mitteilungen | lokale Erinnerungen über `@capacitor/local-notifications` | brauchen keinen Info.plist-Text | ok |
| 11 | Push | Plugin `@capacitor/push-notifications` ist eingebunden, im Code nie benutzt; kein `aps-environment`-Entitlement | nichts tun. Möglich: Hinweis-Mail „ITMS-90078 Missing Push Notification Entitlement“ nach dem Upload – nur eine Warnung, blockiert nichts. Plugin nach dem Test entfernen | ok (Warnung möglich) |
| 12 | Entitlements | `App.entitlements`: nur `com.apple.developer.healthkit = true` | passt. Background Delivery, Clinical Records, Associated Domains, Push: nicht nötig | ok |
| 13 | URL-Schema | `CFBundleURLTypes` → Schema `myrace` (Name `com.myrace.app`) | passt für `myrace://auth/confirm` (Supabase-Bestätigung/Passwort) und `myrace://strava-connected` (Strava-Rückkehr). `SceneDelegate` leitet `openURLContexts` an Capacitor weiter, `src/index.tsx` wertet beide aus | ok |
| 14 | Associated Domains / Universal Links | keine | nicht nötig | ok |
| 15 | App-Icon | 1 Datei `AppIcon-512@2x.png`, 1024×1024, RGB, **kein Alpha**, „universal“ | passt (Xcode erzeugt alle Größen aus der 1024er). Kein Farbprofil eingebettet – unkritisch | ok |
| 16 | Startbild | `LaunchScreen.storyboard` mit `Splash` | passt | ok |
| 17 | Deployment Target | iOS 15.0 (Projekt und `CapApp-SPM`) | passt (iPhone 13 und alle Freunde-iPhones mit iOS 15+) | ok |
| 18 | Gerätefamilie | `TARGETED_DEVICE_FAMILY = "1,2"` (iPhone + iPad) | Empfehlung nur iPhone (`1`), in Xcode „Supported Destinations“. Sonst testet Apple später auch auf dem iPad | Empfohlen |
| 19 | Ausrichtung | iPhone: Hochformat + Querformat links/rechts | nur Hochformat (Patch) | Empfohlen |
| 20 | `UIRequiredDeviceCapabilities` | `armv7` | `arm64` (Patch), harmlos | Optional |
| 21 | Entwicklungssprache | `CFBundleDevelopmentRegion = en` | `de` (Patch) | Optional |
| 22 | Scene-Konfiguration | `UIApplicationSceneManifest`, ein Fenster, `SceneDelegate` | passt (Capacitor 8.5, Commit `82e0a10`) | ok |
| 23 | Netzwerk (ATS) | `NSAllowsLocalNetworking = false`, keine Ausnahmen | passt, alle Aufrufe gehen über HTTPS | ok |
| 24 | `debug.xcconfig` | im Projekt für Debug referenziert, Datei fehlt | nur gelbe Warnung im Debug-Build, Archive (Release) unberührt | ok |
| 25 | Script `deploy:ios` | öffnet `ios/App/App.xcworkspace` | gibt es seit Swift Package Manager nicht mehr → schlägt beim Öffnen fehl. Stattdessen `npm run cap:ios` | Hinweis |
| 26 | Lokale Strava-Variable | `.env.local`: `STRAVA_REDIRECT_URI` endet auf `/api/strava/callbacks` (Plural) | Route heißt `/api/strava/callback`. Betrifft nur den lokalen Server, nicht Vercel – dort genau prüfen (Abschnitt 3.1) | Hinweis |

Fertige Änderungen: `ios-patches/Info.plist.patch` (Punkte 5, 7, 8, 9, 19, 20, 21), `ios-patches/Info.plist.additions.xml` (dasselbe zum Abtippen), `ios-patches/PrivacyInfo.xcprivacy` (Punkt 6). Punkte 3, 4, 18 stellst du in Xcode ein.

---

## 3. Vorher einstellen

### 3.1 Vercel (Projekt `marathon-app`, Production-Domain `marathon-app-alpha.vercel.app`)

Wichtig zum Verständnis: Die **iOS-App** bekommt ihre `REACT_APP_*`-Werte beim Bauen auf **deinem Mac** (Abschnitt 4), nicht von Vercel. Vercel braucht die Server-Variablen für `api/**` und die `REACT_APP_*`-Werte nur für die Web-Version.

**Server-Code live bringen**
- [ ] Der getestete Integrations-Branch (`test/friends-build`) ist auf **Production** deployt. Weg 1 (empfohlen): nach deiner Freigabe nach `main` mergen → Vercel baut Production. Weg 2 ohne Merge: aus einem sauberen Worktree des Branches `vercel deploy --prod` – Achtung, der nächste Push auf `main` überschreibt das wieder.
- [ ] Kontrolle: Vercel → Projekt → Deployments → oberster Eintrag mit „Production“ zeigt den richtigen Commit; unter „Functions“ stehen alle Funktionen aus `vercel.json` (heute 6, mit W2 7: `api/strava/sync.js`).
- Previews taugen für die App nicht: Deployment Protection lässt die App nicht durch, und die App spricht fest die Production-Domain an (`src/lib/api/apiBaseUrl.ts`).

**Umgebungsvariablen** (Vercel → Projekt → Settings → Environment Variables; Haken bei **Production**, sinnvollerweise auch **Preview**). Nur Namen, Werte aus den genannten Quellen:

| Variable | Pflicht? | Wofür (Code) | Woher der Wert |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | ja | KI-Coach `POST /api/ai`, Claude-Rückfall der Plan-Erstellung (`api/_lib/coachHandlers.js`, `api/onboarding/generate-plan-full.ts`, `claudePlanGenerator.js`) | console.anthropic.com → API Keys |
| `SUPABASE_SERVICE_ROLE_KEY` | ja | Token-Prüfung jeder bezahlten Route (`api/_lib/requireUser.js`), KI-Einwilligung, Rate Limit, Konto löschen, Strava (`stravaService.js`) | Supabase → Project Settings → API Keys → `service_role` (geheim!) |
| `REACT_APP_SUPABASE_URL` | ja | Web-Build **und** Server (Server nimmt sie als Supabase-URL, Rückfall `SUPABASE_URL`) | Supabase → Project Settings → API → Project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | ja (Web) | Web-Build | Supabase → API Keys → `anon`/publishable |
| `SUPABASE_URL` | nein | nur Rückfall, wenn `REACT_APP_SUPABASE_URL` fehlt | wie oben |
| `STRAVA_CLIENT_ID` | ja (Strava) | `api/strava/auth.js`, Token-Tausch | strava.com/settings/api → Client ID |
| `STRAVA_CLIENT_SECRET` | ja (Strava) | Token-Tausch und Refresh | strava.com/settings/api → Client Secret |
| `STRAVA_REDIRECT_URI` | ja (Strava) | muss exakt `https://marathon-app-alpha.vercel.app/api/strava/callback` sein (Einzahl `callback`) | selbst eintragen |
| `PLAN_CORE_MODE` | ja | Plan-Kern (`api/_lib/planCoreRoute.ts`), Production steht seit 2026-11-07 auf `on` | `on` |
| `API_QUOTA_EXEMPT_USER_IDS` | nein | nimmt Konten vom Rate Limit aus (`api/_lib/apiQuota.js`) | deine Supabase-User-ID, falls du viel testest |
| `REACT_APP_SUPPORT_EMAIL` | **neu**, ja | Support-/Feedback-Adresse statt Platzhalter `support@example.invalid` (W3) | deine echte Adresse |
| `REACT_APP_SHIFT_MODE` | **neu**, nein | Schicht-Modus (W1); Standard **an**, nur `0`/`false` schaltet aus | nicht setzen (= an) |
| `REACT_APP_AI_API_BASE` | nein (Web) | im Web leer lassen = gleiche Domain | – |
| `OPENAI_API_KEY`, `OPENAI_PROJECT`, `OPENAI_ORG`, `OPENAI_MODEL` | nein | Altlast, keine aktive Route nutzt OpenAI | weglassen |
| `AI_SERVER_PORT` | nein | nur lokaler Express-Server | – |

- [ ] Nach jeder Änderung an Variablen: Vercel → Deployments → letztes Production-Deployment → **Redeploy** (Variablen gelten erst im neuen Build).
- [ ] Kurztest im Browser: `https://marathon-app-alpha.vercel.app/privacy-policy` lädt (Datenschutz-URL für App Store Connect).

### 3.2 Supabase (Projekt in eu-central-1)

**Migrationen** – im SQL-Editor, in genau dieser Reihenfolge, jeweils ganzen Dateiinhalt einfügen → **Run**:
- [ ] `supabase/migrations/023_shift_mode.sql` (W1: `shift_entries`, `profiles.works_shifts`, `profiles.shift_defaults`)
- [ ] `supabase/migrations/024_strava_sync_state.sql` (W2: Sync-Status an `strava_connections`)
- [ ] `supabase/migrations/025_feedback_usage.sql` (W3: `user_feedback`, `usage_events`)
- [ ] Kontrolle (ein Lauf im SQL-Editor, jede Zeile muss erscheinen):

```sql
select 'shift_entries' as t, to_regclass('public.shift_entries') is not null as ok
union all select 'user_feedback', to_regclass('public.user_feedback') is not null
union all select 'usage_events', to_regclass('public.usage_events') is not null
union all select 'profiles.works_shifts', exists (select 1 from information_schema.columns where table_schema='public' and table_name='profiles' and column_name='works_shifts')
union all select 'strava_connections.last_synced_at', exists (select 1 from information_schema.columns where table_schema='public' and table_name='strava_connections' and column_name='last_synced_at')
union all select 'RLS an (3 Tabellen)', (select bool_and(relrowsecurity) from pg_class where oid in ('public.shift_entries'::regclass,'public.user_feedback'::regclass,'public.usage_events'::regclass));
```

Alle Zeilen `ok = true`. (Spaltennamen von 024 nach dem Merge in der Datei gegenprüfen; der Plan nennt `last_synced_at`.)

**Auth → URL Configuration** (Authentication → URL Configuration)
- [ ] **Redirect URLs** enthält `myrace://auth/confirm` (oder breiter `myrace://**`). Ohne Eintrag schickt Supabase den Bestätigungs-Link auf die Site URL statt in die App.
- [ ] **Site URL** = `https://marathon-app-alpha.vercel.app`

**Auth → E-Mail**
- [ ] **E-Mail-Versand klären – Blocker.** Ohne eigenen SMTP-Server liefert Supabase Auth-Mails nur an Adressen aus deinem Supabase-Team und nur wenige pro Stunde. Zwei Wege:
  - **A (sauber):** Authentication → Emails → **SMTP Settings** → eigenen Anbieter eintragen (z. B. Brevo oder Resend, kostenlose Stufe; braucht eine eigene Absender-Domain bzw. verifizierte Adresse). Danach Authentication → Rate Limits → E-Mails/Stunde prüfen (Start 30).
  - **B (schnell, nur für den Test):** Authentication → Sign In / Providers → Email → **Confirm email** ausschalten. Die App kann das (`AuthScreen.tsx`: bestätigte Konten gehen direkt weiter). Einschränkung: „Passwort zurücksetzen“ verschickt ebenfalls eine Mail und kommt bei Freunden ohne SMTP nicht an. Vergisst jemand sein Passwort, das Konto unter Authentication → Users löschen und neu registrieren lassen.
  - Empfehlung: **A**, wenn du bis Mittwoch eine Absender-Adresse hast; sonst **B** und nach dem Test zurück.
- [ ] Mail-Vorlage „Confirm signup“ (Authentication → Emails → Templates) enthält `{{ .ConfirmationURL }}` (Standard) – dann landet der Link über Supabase bei `myrace://auth/confirm`.
- [ ] Hinweis an die Freunde: Bestätigungs-Link **auf dem iPhone** öffnen, nicht am Rechner (das Schema `myrace://` gibt es nur in der App).

**Testkonto für Apples Beta-Prüfung** (nur bei externen Testern nötig)
- [ ] Authentication → Users → **Add user → Create new user**, E-Mail z. B. eine Zweitadresse von dir, Passwort setzen, **Auto Confirm User** an. Zugangsdaten kommen in App Store Connect (Abschnitt 5, Schritt L).

### 3.3 Strava (strava.com/settings/api, eingeloggt mit dem Konto, dem die App gehört)

Stand der Strava-Doku (geprüft 2026-11-17): Jede neue App startet im **Single Player Mode** mit Kapazität **1 Athlet** (nur du). Im API-Dashboard kannst du selbst, ohne Prüfung, auf **10 Athleten** hochstufen. Darüber braucht es eine Prüfung durch Strava. Seit 2026 brauchen Entwickler im Standard-Zugang ein **bezahltes Strava-Abo** (für bestehende Entwickler seit 30.06.2026).

- [ ] Strava-Abo deines Entwickler-Kontos ist aktiv.
- [ ] `https://www.strava.com/settings/api` öffnen → Abschnitt „My API Application“.
- [ ] **Authorization Callback Domain** = `marathon-app-alpha.vercel.app` (nur die Domain, ohne `https://` und ohne Pfad) → **Update**. Muss zur Domain in `STRAVA_REDIRECT_URI` passen, sonst meldet Strava „redirect_uri invalid“.
- [ ] App-Angaben vollständig: Application Name, Category, Website (z. B. die Vercel-Domain), Beschreibung, **App-Icon hochgeladen** – Strava lässt das Hochstufen erst zu, wenn die App fertig eingerichtet ist („once your app is configured“).
- [ ] Auf derselben Seite steht die **Athleten-Kapazität** („Athlete Capacity“). Dort die Schaltfläche zum Hochstufen aus dem Single Player Mode wählen (Self-Service-Upgrade auf 10). Den genauen Knopftext nennt die Doku nicht; er steht bei der Kapazitätsanzeige.
- [ ] Danach zeigt die Seite **Kapazität 10**. Du + 4 Freunde = 5, passt.
- [ ] Falls kein Knopf erscheint oder die Kapazität bei 1 bleibt: E-Mail an `developers@strava.com` mit Client ID (Strava-Mitarbeiter verweisen in der Community genau dorthin). Rechne mit Tagen – solange bleibt den Freunden Weg A: Uhr → Garmin Connect → Apple Health.
- [ ] Strava-Regeln, die den Test betreffen: Daten aus der Strava-API dürfen nicht in KI-Anwendungen landen (auch nicht als Kontext) – der Freundes-Plan hält Strava-Läufe aus dem Coach heraus (W2 prüft das). Laut einer Zusammenfassung der API-Änderungen 2026 ist auch die Speicherdauer begrenzt (7 Tage Cache); vor einem echten Release im **API Agreement** nachlesen, ob das dauerhafte Speichern in `health_workouts` zulässig ist.

---

## 4. Build-Variablen für die App (`REACT_APP_*`)

Create React App baut die Werte **beim `npm run build`** fest ins Bundle ein. Ermittelt mit `grep -rho "REACT_APP_[A-Z_]*" src | sort -u` (plus die neuen aus W1/W3).

**Wohin:** Datei `.env.production.local` im Projektordner (ist per `.gitignore` ausgeschlossen) oder vor dem Befehl in der Shell. CRA liest beim Production-Build in dieser Rangfolge: Shell > `.env.production.local` > `.env.local` > `.env.production` > `.env`. Heute stehen Supabase-URL/-Key und `REACT_APP_AI_API_BASE` (Vercel-Domain) schon in deiner `.env.local` bzw. `.env.production` – sie wirken also bereits. Nur `REACT_APP_*`-Variablen landen im Bundle; Server-Schlüssel in `.env.local` bleiben draußen. **Nie** einen geheimen Schlüssel mit `REACT_APP_` beginnen lassen.

| Variable | Für den Freundes-Build | Wirkung, Standard | Woher |
|---|---|---|---|
| `REACT_APP_SUPABASE_URL` | **Pflicht** | ohne: App startet mit totem Platzhalter-Host, kein Login (`src/lib/supabase/client.ts`) | Supabase → API → Project URL |
| `REACT_APP_SUPABASE_ANON_KEY` | **Pflicht** | dto. | Supabase → API Keys → anon/publishable |
| `REACT_APP_AI_API_BASE` | **Pflicht** (setzen, nicht auf den Rückfall verlassen) | Server-Adresse für Coach, Plan, Konto, Strava. Ohne: Rückfall auf `https://marathon-app-alpha.vercel.app` (`src/lib/api/apiBaseUrl.ts`) | `https://marathon-app-alpha.vercel.app` |
| `REACT_APP_SUPPORT_EMAIL` | **Pflicht** (neu, W3) | Hilfe & Feedback, Fehler melden, Datenexport; ohne: `support@example.invalid` | deine echte Adresse |
| `REACT_APP_SHIFT_MODE` | nicht setzen | Schicht-Modus, Standard an; `0`/`false` = aus (neu, W1) | – |
| `REACT_APP_SENTRY_DSN` | optional | Absturzberichte nur in Production und nur mit DSN (`src/index.tsx`) | sentry.io → Projekt → Client Keys |
| `REACT_APP_CHECKIN_ENABLED` | nicht setzen | Morgen-Check-in (Readiness); Freundes-Test läuft laut Roadmap ohne Readiness | – |
| `REACT_APP_AI_ANALYSIS` | nicht setzen | lokale Auswertung nach dem Lauf, Standard an; `0` = aus | – |
| `REACT_APP_AI_PROVIDER`, `REACT_APP_AI_ENABLED`, `REACT_APP_AI_MODEL`, `REACT_APP_AI_TIMEOUT_MS`, `REACT_APP_AI_API_BASE_URL`, `REACT_APP_COACH_SYSTEM_PROMPT` | nicht setzen | Altlast des alten Chat-Pfads (`src/lib/ai/config.ts`); der Coach im UI (`AiCoachPanel` → `coachAgent.ts`) ruft `/api/ai` direkt | – |
| `REACT_APP_DEBUG_AI`, `REACT_APP_RECOVERY_DEBUG`, `REACT_APP_RECOVERY_GUARD`, `REACT_APP_ENABLE_DISTANCE_DEBUG`, `REACT_APP_EXTENDED_RECOVERY` | **nicht setzen** | Debug-/Experimentier-Schalter | – |

Kontrolle nach dem Build (zeigt nur Treffer-Anzahlen, keine Werte):
- [ ] `grep -c "marathon-app-alpha.vercel.app" dist/static/js/main.*.js` → mindestens 1
- [ ] `grep -c "supabase.co" dist/static/js/main.*.js` → mindestens 1
- [ ] `grep -c "<deine Support-Adresse>" dist/static/js/main.*.js` → mindestens 1

---

## 5. Schritt für Schritt ab „Developer-Account freigeschaltet“

Vorher (Dienstag): Anmeldung zum Apple Developer Program (99 €/Jahr) als **Einzelperson**, am schnellsten über die App **Apple Developer** auf dem iPhone (Ausweis-Scan). Freischaltung dauert meist 1–2 Tage, manchmal länger – das ist das größte Zeitrisiko. Du bekommst eine Mail „Welcome to the Apple Developer Program“.

### A · Xcode mit dem Account verbinden
- [ ] Xcode → **Settings… → Accounts** → **+** → Apple ID → mit derselben Apple-ID anmelden, mit der du bezahlt hast
- [ ] Unter dem Konto erscheint ein Team **ohne** „(Personal Team)“ (Rolle „Account Holder“/„Admin“)
- [ ] Unter developer.apple.com/account → **Membership details** die **Team ID** notieren (10 Zeichen)

### B · Code vorbereiten (Mittwoch früh)
- [ ] `git fetch origin` und auf den freigegebenen Freundes-Build wechseln (z. B. `git checkout test/friends-build` und `git pull`)
- [ ] `git status --short` ist leer
- [ ] Info.plist-Patch und Privacy Manifest einspielen: `docs/friend-test/ios-patches/README.md`, Abschnitte 1 und 2
- [ ] Variablen prüfen (Abschnitt 4), vor allem `REACT_APP_SUPPORT_EMAIL`

### C · Signing in Xcode
- [ ] `npm run cap:ios` (= `npm run build` → `npx cap sync ios` → Prüfung `verify-web-build` → Xcode öffnet). **Nicht** `npm run deploy:ios` (öffnet eine `.xcworkspace`, die es nicht mehr gibt). Ein nacktes `npm run build` reicht nicht: es synchronisiert `ios/` nicht, die App hätte den alten Stand.
- [ ] Xcode: links blaues **App** → TARGETS **App** → **Signing & Capabilities**
- [ ] **Automatically manage signing** an
- [ ] **Team** = dein bezahltes Team
- [ ] **Bundle Identifier** = `com.anton.myrace`
- [ ] Xcode registriert die App-ID selbst und zeigt keinen roten Fehler mehr. Falls „Failed to register bundle identifier … not available“: siehe Abschnitt 7.
- [ ] Capability **HealthKit** ist aufgeführt (sonst **+ Capability → HealthKit**)
- [ ] Reiter **General**: Supported Destinations nur iPhone, Minimum iOS 15.0, Version `1.0`, Build `1`

### D · App-ID kontrollieren (developer.apple.com)
- [ ] developer.apple.com/account → **Certificates, Identifiers & Profiles → Identifiers** → `com.anton.myrace` ist da
- [ ] reinklicken → Capabilities → **HealthKit** angehakt (Xcode setzt das beim automatischen Signieren). Falls nicht: anhaken → Save, in Xcode Signing einmal aus- und wieder einschalten

### E · App in App Store Connect anlegen
- [ ] appstoreconnect.apple.com → **Apps** → **+** → **Neue App**
- [ ] Plattform: **iOS**
- [ ] Name: `MyRace` (muss im ganzen App Store eindeutig sein, max. 30 Zeichen; falls vergeben z. B. „MyRace – Laufplan“ – der Name auf dem Homescreen bleibt „MyRace“)
- [ ] Primäre Sprache: **Deutsch**
- [ ] Bundle-ID: `com.anton.myrace` aus der Liste wählen (erscheint erst nach Schritt C/D)
- [ ] SKU: frei wählbar, nur intern, z. B. `myrace-ios-001`
- [ ] Benutzerzugriff: **Vollzugriff** → **Erstellen**
- [ ] App → **App-Informationen**: Kategorie **Gesundheit & Fitness**; **Datenschutzrichtlinie-URL** `https://marathon-app-alpha.vercel.app/privacy-policy` (unter „App-Datenschutz“)

### F · Web-Build und Sync (falls seit Schritt C etwas geändert wurde)
- [ ] `npm run cap:ios` erneut (baut `dist/`, synchronisiert nach `ios/App/App/public`)
- [ ] Kontrollen aus Abschnitt 4 (grep)

### G · Version und Build-Nummer
- [ ] Erster Upload: `1.0 (1)`
- [ ] **Jeder** weitere Upload: Build +1 (General → Build). Gleiche Build-Nummer zweimal → Upload wird abgelehnt.

### H · Archivieren
- [ ] Xcode oben: Schema **App**, Ziel **Any iOS Device (arm64)** (nicht dein iPhone, nicht ein Simulator)
- [ ] Menü **Product → Archive** (dauert einige Minuten)
- [ ] Danach öffnet sich der **Organizer** (Window → Organizer → Archives) mit dem neuen Archiv

### I · Hochladen
- [ ] Organizer → Archiv markieren → **Distribute App**
- [ ] **App Store Connect** wählen (nicht „TestFlight Internal Only“ – solche Builds lassen sich keiner externen Gruppe zuordnen) → **Distribute**
- [ ] Xcode signiert, prüft und lädt hoch. Am Ende „Uploaded to Apple“. Fehler → Abschnitt 7.

### J · Exportkonformität
- [ ] Mit `ITSAppUsesNonExemptEncryption = false` (Patch) fragt App Store Connect nichts.
- [ ] Ohne den Schlüssel: App Store Connect → App → **TestFlight** → Build zeigt „Fehlende Compliance / Missing Compliance“ → **Verwalten** → „Keiner der oben genannten Algorithmen“ (App nutzt nur HTTPS über iOS) → Speichern.

### K · Verarbeitung abwarten
- [ ] App Store Connect → TestFlight: Build steht auf „Wird verarbeitet“, meist 5–30 Minuten
- [ ] Mail „The following build has completed processing“
- [ ] Mail-Postfach auf Warnungen von App Store Connect prüfen (ITMS-…), siehe Abschnitt 7

### L · Testinformationen ausfüllen (TestFlight → Testinformationen)
- [ ] **Beta-App-Beschreibung** (Pflicht): „MyRace erstellt dir einen Laufplan bis zu deinem Rennen und passt ihn an deinen Dienstplan und Kalender an.“
- [ ] **Feedback-E-Mail**: deine Adresse (dieselbe wie `REACT_APP_SUPPORT_EMAIL`)
- [ ] **Kontaktinformationen für die Beta-Prüfung**: Vorname, Nachname, Telefon, E-Mail
- [ ] **Anmeldung erforderlich**: an → Benutzername/Passwort des Testkontos aus Abschnitt 3.2
- [ ] **Hinweise für die Prüfung**: „Anmeldung mit dem Testkonto. Apple Health, Kalender und Strava sind optional; die App funktioniert ohne Uhr und ohne Freigaben. Der KI-Coach fragt vorher um Einwilligung.“
- [ ] **Was testen?** beim Build: Text aus Abschnitt 6

### M · Tester einladen

| | Interne Tester | Externe Tester |
|---|---|---|
| Wer | bis 100 Mitglieder deines App-Store-Connect-Teams | bis 10 000 beliebige Personen |
| Voraussetzung | jeder Freund braucht einen **Benutzer in App Store Connect** mit Rolle (z. B. „Marketing“ oder „Developer“) und muss die Team-Einladung annehmen | nur E-Mail-Adresse oder öffentlicher Link |
| Apple-Prüfung | keine – Build sofort nach der Verarbeitung verfügbar | **Beta-Prüfung** für den ersten Build einer Version (meist unter 1–2 Tagen); weitere Builds derselben Version oft ohne volle Prüfung |
| Nachteil | Freunde sehen dein App-Store-Connect-Konto (je nach Rolle Verkaufs-/App-Daten) | Wartezeit bei der ersten Prüfung |

**Empfehlung für 3–4 Freunde: externe Gruppe.** Freunde gehören nicht in dein Entwickler-Team, und die kurze Beta-Prüfung ist für einen Test ab Donnerstag zu schaffen, wenn der Build Mittwoch eingereicht wird.
- [ ] TestFlight → **Interne Tests** → Gruppe anlegen (z. B. „Ich“) und dich selbst hinzufügen – Apple verlangt eine interne Gruppe, bevor es externe gibt, und du kannst so den Build sofort auf dem iPhone 13 prüfen
- [ ] TestFlight → **Externe Tests** → **+** → Gruppe „Freunde“
- [ ] Build hinzufügen → **Zur Prüfung einreichen**
- [ ] Tester: per E-Mail hinzufügen (sicherer) **oder** **Öffentlichen Link aktivieren**, Limit auf z. B. 5 setzen (jeder mit dem Link kann sonst beitreten)
- [ ] Nach „Genehmigt“ bekommen die Freunde Mail bzw. Link
- **Plan B**, falls die Prüfung Donnerstag früh noch läuft: Freunde unter **Benutzer und Zugriff** mit Rolle **Marketing** und Zugriff nur auf diese App einladen → interne Gruppe → Build sofort verfügbar. Nach dem Test wieder entfernen.

### N · Was die Freunde tun
- [ ] iPhone mit iOS 15 oder neuer
- [ ] App **TestFlight** aus dem App Store laden
- [ ] Einladungs-Mail bzw. Link auf dem iPhone öffnen → **Annehmen** → **Installieren**
- [ ] Builds laufen 90 Tage; neue Builds kommen über TestFlight als Update

### Danach: neuer Build
- [ ] Code ändern → `npm run cap:ios` → Build-Nummer +1 → Archive → Distribute → „Was testen?“ ausfüllen → bei externer Gruppe Build hinzufügen

---

## 6. Text „Was testen?“

Zum Einfügen in TestFlight (Feld „Was testen?“ beim Build):

> Danke, dass du MyRace ausprobierst! Drei Dinge interessieren mich am meisten:
>
> 1. Dienstplan eintragen: Trag deine Dienste der nächsten Wochen ein (Einstellungen → Training → Dienstplan) und schau dir an, was MyRace für deine Trainingswoche vorschlägt. Passt der Vorschlag zu deinem Alltag?
> 2. Lauf aufzeichnen: Lauf wie gewohnt mit deiner Uhr und schau, ob der Lauf in MyRace ankommt und abgehakt wird. Apple Watch: geht automatisch über Apple Health. Garmin: in Garmin Connect unter Einstellungen → Verbundene Apps → Apple Health einschalten oder in MyRace Strava verbinden.
> 3. Feedback: Alles, was hakt oder fehlt, gern über Einstellungen → Konto & Hilfe → „Feedback geben“. Screenshots über TestFlight gehen auch.
>
> Wichtig: Den Bestätigungs-Link nach der Registrierung bitte auf dem iPhone öffnen.

(Menüpfade nach der Integration W6 auf dem Gerät gegenprüfen; falls der Dienstplan an anderer Stelle liegt, Pfad anpassen.)

---

## 7. Typische Fehler und Lösungen

| Meldung / Symptom | Ursache | Lösung |
|---|---|---|
| „Missing Compliance“ beim Build | `ITSAppUsesNonExemptEncryption` fehlt | Schritt J; dauerhaft per Patch |
| Mail „ITMS-90683: Missing purpose string in Info.plist“ | ein Plugin verweist auf eine geschützte API ohne Text (Kandidat: Erinnerungen im Kalender-Plugin) | genannten Schlüssel ergänzen (Block 8 in `Info.plist.additions.xml`), Build +1, neu hochladen |
| Mail „ITMS-91053: Missing API declaration“ | Privacy Manifest fehlt oder ist nicht im Target | `PrivacyInfo.xcprivacy` laut Patch-README einfügen, Copy Bundle Resources prüfen |
| Mail „ITMS-90078: Missing Push Notification Entitlement“ | Push-Plugin eingebunden, nicht benutzt | ignorieren (nur Warnung) |
| Prüfung abgelehnt wegen 5.1.1 „purpose string“ | Text zu vage | Texte aus dem Patch verwenden: Daten **und** Nutzen nennen |
| „Missing required icon file … 1024x1024 … alpha channel“ | Icon mit Transparenz | heutiges Icon ist ohne Alpha; falls ausgetauscht: `sips -g hasAlpha <datei>` muss `no` zeigen, sonst ohne Transparenz exportieren |
| „No account for team …“ / „No signing certificate ‚iOS Distribution‘“ | Xcode kennt das bezahlte Team noch nicht | Schritt A; Xcode → Settings → Accounts → Team → **Manage Certificates** → **+ Apple Distribution** |
| „Failed to register bundle identifier … not available“ | ID ist noch an das kostenlose Personal Team gebunden oder vergeben | App vom iPhone löschen, in Xcode kurz das Personal Team abmelden, erneut versuchen; wenn es dabei bleibt: neue ID wie `com.antonalbers.myrace` in Xcode **und** `capacitor.config.ts` `appId` (dann `npx cap sync ios`) |
| „Provisioning profile doesn't include the HealthKit capability“ | App-ID ohne HealthKit | Schritt D |
| „The bundle version must be higher than the previously uploaded version“ | Build-Nummer doppelt | Build +1 |
| Upload-Option fehlt / Archive grau | Ziel ist ein Simulator | oben „Any iOS Device (arm64)“ wählen |
| Externe Gruppe lässt Build nicht zu | mit „TestFlight Internal Only“ hochgeladen | neu hochladen mit „App Store Connect“ |
| App zeigt alten Stand | `npm run build` ohne `cap sync` | `npm run cap:ios`, dann neu archivieren |
| Login geht nicht, Konsole: „REACT_APP_SUPABASE_URL… missing“ | Supabase-Variablen fehlten beim Build | Abschnitt 4, neu bauen |
| Freund bekommt keine Bestätigungs-Mail | Supabase-Standard-Mailversand nur an Team | Abschnitt 3.2 „E-Mail-Versand“ |
| Bestätigungs-Link öffnet Website statt App | `myrace://auth/confirm` fehlt in Redirect URLs, oder Link am Rechner geöffnet | Abschnitt 3.2; Link auf dem iPhone öffnen |
| Strava: „redirect_uri invalid“ | Callback Domain passt nicht zu `STRAVA_REDIRECT_URI` | Abschnitt 3.3 |
| Strava: Freund kann nicht verbinden („limit of connected athletes“) | Single Player Mode | Abschnitt 3.3, Kapazität 10 |

---

## 8. Risiken und offene Punkte

| Risiko | Bewertung | Was tun |
|---|---|---|
| **Account-Freischaltung** dauert länger als bis Mittwoch | hoch für den Zeitplan | Dienstag früh beantragen, über die Apple-Developer-App; Mails prüfen, ob Apple Unterlagen nachfordert |
| **Supabase-Mailversand** nur an Team-Mitglieder | Blocker für Freunde | Abschnitt 3.2 (SMTP oder „Confirm email“ aus) |
| **Server-Code nicht auf Production** | Blocker für Strava-Import | Abschnitt 3.1 (Merge nach Freigabe oder `vercel deploy --prod`) |
| **Strava** Kapazität 1 / Abo abgelaufen | Strava-Weg fällt aus, Apple-Health-Weg bleibt | Abschnitt 3.3 |
| **Strava-Datenregeln** (keine KI, begrenzte Speicherdauer) | für den Freundes-Test vertretbar, vor Release klären | API Agreement lesen; Strava-Läufe bleiben aus dem Coach |
| **Sign in with Apple** (Regel 4.8) | für TestFlight kein Thema; Regel greift nur, wenn die App einen Login über Dritte (Google, Facebook …) anbietet. MyRace hat nur E-Mail + Passwort, Strava ist kein Login | erst wieder relevant, wenn ein Dritt-Login dazukommt |
| **Datenschutz-URL** | vorhanden (`/privacy-policy`, `PRIVACY_POLICY_URL` in `appInfo.ts`); laut Roadmap fehlt die rechtliche Prüfung durch dich; Schicht-, Strava-, Feedback- und Nutzungsdaten (W1–W3) sind dort noch nicht beschrieben | vor externen Testern Abschnitte „Dienstplan“, „Strava“, „Feedback/Nutzungsdaten“ ergänzen |
| **Konto löschen in der App** (Regel 5.1.1(v)) | erfüllt: Einstellungen → Konto & Hilfe → „Konto löschen“ (`AppMain.tsx`, `AccountDeleteDialog.tsx`, `api/account.js`, `api/_lib/deleteAccount.js`). W1/W3 nehmen `shift_entries`, `user_feedback`, `usage_events` in die Löschung auf – nach Migration 023–025 einmal mit einem Wegwerf-Konto testen | Test auf dem iPhone 13 |
| **Support-Adresse** Platzhalter | Blocker für Feedback/Datenexport per Mail | `REACT_APP_SUPPORT_EMAIL` setzen (Abschnitt 4) |
| **Push-Plugin** ohne Nutzung | nur Warn-Mail | nach dem Test entfernen |
| **iPad** in der Gerätefamilie | spätere Prüfung auch auf dem iPad | nur iPhone (Patch-README Abschnitt 3) |
| **App-Datenschutz-Angaben** in App Store Connect | für TestFlight nicht Pflicht, für den App Store schon; müssen zum Privacy Manifest passen | vor dem Release ausfüllen |
| **iPhone-13-Test** KI-Einwilligung und Trainings-Erinnerung (offen laut `CLAUDE.md`) | offen | mit dem ersten TestFlight-Build auf dem eigenen iPhone erledigen |
| **Sentry** ohne DSN | keine Absturzberichte | optional `REACT_APP_SENTRY_DSN`, sonst Feedback über TestFlight-Screenshots |

---

## 9. Quellen

- Strava: [Getting Started](https://developers.strava.com/docs/getting-started/) (Single Player Mode, Self-Service-Upgrade auf 10, Abo-Pflicht, Callback Domain), [Rate Limits](https://developers.strava.com/docs/rate-limits/) („All newly created apps will have an athlete capacity of 1“, Prüfung ab mehr als 10), [Community: Kapazität](https://communityhub.strava.com/developers-api-7/do-not-see-button-for-increase-of-api-connection-13369), Zusammenfassung [Strava API changes 2026](https://tryterra.co/blog/strava-api-changes-2026) (Drittquelle: Abo-Daten, KI-Verbot, 7-Tage-Cache)
- Apple: [Interne Tester hinzufügen](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers) (bis 100, Rollen), [Externe Tester einladen](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers) (bis 10 000, Beta-Prüfung, öffentlicher Link, interne Gruppe zuerst, „TestFlight Internal Only“), [Testinformationen](https://developer.apple.com/help/app-store-connect/test-a-beta-version/provide-test-information)
- Supabase: [Auth SMTP](https://supabase.com/docs/guides/auth/auth-smtp) (Standard-Versand nur an Team-Adressen, niedrige Rate)
- Code: `capacitor.config.ts`, `ios/App/**`, `src/lib/api/apiBaseUrl.ts`, `src/lib/supabase/{client,auth}.ts`, `src/index.tsx`, `api/_lib/{stravaService,requireUser,coachHandlers,apiQuota}.js`, `vercel.json`, `package.json`, Plugin-Quellen in `node_modules/@capacitor*`, `@capgo/capacitor-health`, `@ebarooni/capacitor-calendar`
