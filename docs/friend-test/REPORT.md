# Bericht Nachtschicht – Freundes-Test (W1–W6)

Stand: 2026-11-17, Integrations-Branch `test/friends-build` (ab `origin/main` 78109aa).
Für: Anton. Grundlage: `docs/friend-test/plan.md` (Vertrag), Abhakliste für morgen: `docs/friend-test/morgen.md`.

**Was gilt weiterhin:** Nichts ist in `main`. Keine Migration ist angewendet. In Production wurden weder Variablen geändert noch Daten geschrieben. `ios/` ist in keinem Commit.

## Kurzüberblick

| Paket | Branch (Stand) | Ergebnis | Prüfung (unabhängig + plan-reviewer) |
|---|---|---|---|
| W1 Schicht-Modus | `feat/shift-mode` (741e152) | Code fertig, Preview-Abnahme S1 erst nach Migration 023 | 3 Runden, am Ende **PASS / PASS** |
| W2 Strava-Import + Garmin über Apple Health | `feat/strava-activity-import` (7fa1bcf) | fertig, Strava-Zuordnung nur auf iOS | 4 Runden, am Ende **PASS / PASS** |
| W3 Frisches Konto, Feedback, Nutzungsdaten | `fix/friend-test-hardening` (45a8670) | fertig, Web-Ablauf nur am Code geprüft | 2 Runden, am Ende **PASS / PASS** |
| W4 Apple-Health-Fix `activeEnergyBurned` | `fix/apple-health-read-types` (b6f1493) | fertig | Leiter, Tests grün; gegen Plugin-Quelltext geprüft |
| W5 TestFlight-Checkliste | `docs/testflight-readiness` (20318f6) | fertig | **PASS** |
| W6 Integration | `test/friends-build` | gemergt + Ereignisse verdrahtet | siehe Abschnitt W6 |

Ablauf: Jedes Paket lief in eigenem Worktree und eigenem Branch ab `main`. Jede Prüfung bestand aus einem unabhängigen Prüfer, der Build und Tests selbst lief und Fälle nachstellte, plus dem `plan-reviewer` gegen den Plan.

**Abweichung vom Ablauf:** Die Autoren haben nach jeder Nachbesserung gepusht, bevor die nächste Prüfung PASS gab. In die Integration kam aber nur, was zweimal PASS hatte.

Außerdem brach die Sitzung einmal ab. Alle Agenten wurden fortgesetzt, verloren ging nichts.

---

## W1 · Schicht-Modus (`feat/shift-mode`)

**Commits** (13): 079850c Migration/Service · f00a7f2 Kern `shiftDays.ts` · 7107cb2 Engine-Kontext · 3737916 Wochenvorschlag · 1993722 Oberfläche · 59d91ee Verdrahtung · ee8ff11 Texte/Zeitzonen-Tests · bdb1c47 Roadmap · 21e1c08 Marker · af629fc, ff4de35, 7bf3934, 741e152 Nachbesserungen.

### Gebaut

- **Daten:** `023_shift_mode.sql` (`shift_entries`, `profiles.works_shifts`, `profiles.shift_defaults`, RLS `user_own_data`, idempotent). `shiftEntriesService` mit Bulk-Upsert und Rückfall „unavailable“ bei fehlender Tabelle oder Spalte. `deleteAccount.js` löscht die Einträge.
- **Kern:** `src/readinessCore/shiftDays.ts` (rein, ES5, keine Uhr). Regeln 1–9 und 1a liefern je Tag die Eignung für hart, Long Run und locker, mit Grund. `CONFIG.shift`, `CONFIG_VERSION` 0.2.1. Spec §7.6 und §19 Nr. 21–25.
- **Engine:** optionaler Kontext `shift` in der Capacity-Engine (`Math.min` aus Kalender und Dienstplan). Ohne Kontext rechnet sie bit-gleich, das ist getestet.
- **Wochenvorschlag** `src/shift/proposeShiftWeek.ts` und **Einzelvorschlag** `proposeShiftSingle.ts`. Beide prüfen dieselben harten Regeln (`checkCandidate`):
  - keine zwei harten Tage in Folge, auch über die Wochengrenze, der Long Run zählt als hart
  - der Long Run bleibt in seiner Woche, mit mindestens 6 Tagen Abstand
  - Rennen und gesperrte Einheiten sind nie Quelle oder Ziel
  - in Taper und Rennwoche nur auf frühere Tage
  - „eingeschränkt“ wird nur auf einen freien Tag verschoben
  - „Locker statt hart“ kürzt die km höchstens, nie mehr. Das prüft ein Property-Test.
  - Die manuelle Tageswahl wird beim Antippen erneut geprüft.
- **Oberfläche:**
  - Wizard-Frage
  - einmalige Karte auf „Heute“ und ein Satz an Tagen mit Schichtbezug
  - Einstellungen → Training: Schalter und Dienstplan-Seite (28 Tage, Chips, Rotationsmuster, Woche kopieren, Standardzeiten)
  - Kürzel im Woche-Tab
  - Vorschläge nur über die bestehende `AiActionCard` mit „Übernehmen“
  - Flag `REACT_APP_SHIFT_MODE`, Standard an
- **Lokaler Cache** je Nutzer (`marathonShiftEntries:<userId>`), wird beim Abmelden, beim Löschen des Kontos und beim Kontowechsel gelöscht.

### Nicht gebaut / offen

- Preview-Abnahme „4 Wochen in < 1 min, Vorschlag S1“: erst nach Migration 023 möglich.
- Sichttest bei 390 px im Browser.
- Gerätetest.
- Der Tausch über den Coach (`handleSwapWorkoutsV2`) prüft die Schicht-Schutzregeln nicht, nur die bestehenden. Bekannte Grenze.

### Tests

Die volle Suite lief auf bdb1c47 grün (248 Suiten). Nach den Nachbesserungen liefen die betroffenen Suiten grün, beim letzten Prüfer 22 Suiten mit 252 Tests.

Eine Regressionsprüfung verglich die Regeln alt gegen neu auf 4 000 Zufalls-Dienstplänen: Ohne Dienste, die vor 04:00 beginnen, gibt es 0 Unterschiede, und kein Tag ist lockerer geworden.

### Wichtigste Prüfbefunde (alle behoben)

- Der Einzel-Pfad umging die Schutzregeln. Im Taper schlug er Intervalle auf einen späteren Tag vor, näher am Rennen.
- „Locker statt hart“ konnte die km erhöhen (8,5 → 9, ohne km → 9).
- Abgelaufene Dienstpläne hielten den Modus aktiv.
- Ein Nachtdienst, der um 0 Uhr beginnt, machte den Tag „frei“.
- Interne Codes waren in der Oberfläche sichtbar.
- Dienstdetails standen im Plan-`desc`.
- Ausstehende Tage konnten beim Kontowechsel verloren gehen.
- Nach der Umstellung auf Schlüssel je Nutzer blieb der Dienstplan nach dem Abmelden auf dem Gerät. Die Ursache war meine eigene Vorgabe, die Löschliste nicht anzufassen. Ich habe sie korrigiert.

---

## W2 · Läufe von Garmin & Co. (`feat/strava-activity-import`)

**Commits** (11): 4c66906 Endpunkt und Migration 024 · 60232fd Dedup · 4d737dc Garmin-Fix · 1e81a32 Coach-Filter · 33ae50b Auto-Import und UI · e9f760d Attribution · 8d61bd2, 9e199d9, 976f7d6, ece55a0, 7fa1bcf Nachbesserungen.

### Gebaut

**Weg A, Garmin über Apple Health:**
- Am Code belegt: Es gibt keinen Filter auf Quelle, Gerät oder Bundle.
- Gefunden und behoben: Garmin-Läufe bekamen nicht die volle Auswertung (`isHealthKitWorkoutSource` in `usePostWorkoutSummary.ts`).
- Hilfe in den Einstellungen: „Garmin-Uhr? So kommen deine Läufe rein“.

**Weg B, Strava:**
- `POST /api/strava/sync` (`api/strava/sync.js`, 7. Vercel-Funktion):
  - Pflicht-Token, Quota-Bucket `strava_sync` (30/h, 200/Tag)
  - nur Run, TrailRun und VirtualRun
  - Upsert `strava:<id>`, 72 h Überlappung, Erstimport 10 Tage, Server löscht nach 7 Tagen
- Fehlerfälle:
  - 401 und Refresh-Fehler: Verbindung „getrennt“, ruhige Meldung „Strava neu verbinden“
  - 429: `rate_limited`, später erneut
- Migration 024 ergänzt `last_synced_at`, `last_sync_status` und `disconnected_at`. Der Endpunkt läuft auch ohne sie.
- Client:
  - Auslöser beim Start und bei Rückkehr in den Vordergrund, Drossel 15 min, Knopf „Jetzt synchronisieren“
  - dieselbe automatische Zuordnung wie bei Apple Health: erledigt und Ist-Distanz
- Dedup: Start ±5 min und Distanz ±5 % ergeben einen Lauf, Apple Health hat Vorrang. Ob ein Lauf von Strava kommt, wird nur am ID-Präfix `strava:` erkannt. So bleiben HealthKit-Läufe der Strava-App Apple-Health-Läufe.
- Marke: offizieller Knopf „Connect with Strava“ und „Powered by Strava“ an allen Stellen mit Strava-Daten, auch bei Zielzeit, Rückblick, Hero- und Ergebniskarte. „View on Strava“ ist laut den Guidelines keine Pflicht.

**Strava-Daten gehen an kein Sprachmodell**, auch nicht abgeleitet. Gefiltert wird an drei Stellen:
- Läufe im Coach-Kontext (Client und Server)
- unbestätigte Zielzeiten: Whitelist, nur `apple_health`. Eine Strava-Zeit wird nie in `prep_recaps` gespeichert, erst wenn der Athlet sie bestätigt, und dann als eigene Angabe.
- Tageslast und Session-Logs: Bei Strava-Zuordnung zählen die geplanten km. `actualKm` und `durationMin` fallen aus dem Coach-Payload.

**Trennen:** Erst werden die Läufe gelöscht, dann die Verbindung. Scheitert das, kommt eine ehrliche Meldung, und die Verbindung bleibt. Ein Offline-Start löscht nichts, der Status wird bei Rückkehr in den Vordergrund neu geprüft.

### Nicht gebaut / offen

- Die Strava-Zuordnung (erledigt, Ist-Distanz) läuft **nur auf iOS**. Im Web wird der Status nicht geprüft und nichts importiert.
- Kein Strava-Webhook, kein `oauth/revoke` beim Trennen.
- Garmin-Attribution (§4.4 der Strava-Regeln) fehlt.
- Schlaf aus mehreren Quellen wird doppelt summiert, das ist nur dokumentiert.
- Der Gerätetest auf dem iPhone 13 ist offen (siehe CLAUDE.md).

### Tests

Die volle Suite lief auf 33ae50b grün (249 Suiten, 62 812 Tests). Danach liefen die betroffenen Suiten bei jeder Nachbesserung grün, beim letzten Prüfer 50 Suiten mit 333 Tests.

### Wichtigste Prüfbefunde (alle behoben)

- Strava-Herkunft wurde am Quellnamen erkannt. Dadurch gingen Läufe verloren oder wurden doppelt gezählt.
- Lücken zum Coach über `prepStatus`, über den gespeicherten Rückblick und über die Tageslast.
- Das Logo fehlte.
- Trennen meldete „gelöscht“, auch wenn nichts gelöscht war.
- Ein Offline-Start löschte lokale Strava-Läufe.

---

## W3 · Frisches Konto ohne Stolpersteine (`fix/friend-test-hardening`)

**Commits** (27, siehe `git log origin/main..origin/fix/friend-test-hardening`). Die Befundliste mit 28 Einträgen steht in `docs/friend-test/fresh-account-trace.md`.

### Gebaut

- **Kontowechsel:** Das Gerät merkt sich, wem die lokalen Daten gehören (`storageOwner.ts`). Konto B sah vorher Plan, Logs und Zielzeit von Konto A.
  - Beim Abmelden werden auch die Sync-Anker gelöscht.
  - `<AppMain key={user.id}>`
  - Eine Abdeckung verhindert, dass ein frisches Konto kurz den Demo-Plan sieht. Sie verschwindet spätestens nach 10 s.
- **Anmeldung:** Fehlermeldungen auf Deutsch. Der Bestätigungslink im Browser führt auf die Web-Adresse.
- **Backlog:**
  - Zielzeit am Plan (`meta.goal`): wird beim Altplan nachgetragen, frisch gelesen und nur geschrieben, solange `updated_at` unverändert ist.
  - Tagesbezug im Coach (`todayYmd`, `relativeDay`) behebt „morgen … warst du schon gefordert“.
  - Ein Chat-Datum ohne Jahr gilt als nächstes Vorkommen ab heute.
- **Feste Sub-3-Ziele:**
  - Die Marken erscheinen nur noch, wenn deine Zielzeit höchstens 15 min darüber liegt.
  - Der Prognosetext bezieht sich nur bei Marathon auf die eigene Zielzeit.
- **Weitere Fixes:**
  - `SUPPORT_EMAIL` kommt aus `REACT_APP_SUPPORT_EMAIL`.
  - Im Browser steht ein Hinweis statt des toten Erinnerungs-Schalters.
  - Ein Tab-Wechsel beginnt oben.
  - Die Wizard-Farben nutzen Tokens.
- **Feedback:** Einstellungen → Konto & Hilfe → „Feedback geben“, außerdem ein dezenter Eintrag auf „Heute“ in den ersten 14 Tagen. Angehängt werden App-Version, Bildschirm, OS und Datum. Fehlt die Tabelle, geht eine vorausgefüllte Mail raus.
- **Nutzungsdaten:** `trackUsageEvent` mit genau 8 Ereignissen. Es wirft nie, `app_open` kommt höchstens 1×/h.
  - Abschaltbar: „Nutzung zählen“. Die Wahl gilt je Person und übersteht das Abmelden.
  - Migration 025 (`user_feedback`, `usage_events`, RLS nur INSERT/SELECT auf eigene Zeilen, CHECK auf die Namen).
  - `deleteAccount.js` ergänzt, Auswertung in `docs/friend-test/queries.sql`.
- **Seite „Welche Daten MyRace nutzt“:** enthält Feedback und Nutzungsdaten.

### Offen, begründet

- Den Renndatum-Fehler erst nach der Eingabe zu zeigen, verbietet der bestehende Test `Onboarding.planRequired.test.tsx:35`.
- Die App-Tour gilt fürs ganze Gerät.
- Der Coach-Prompt sagt „Marathontrainer“ auch bei 10-km- und HM-Plänen.
- Die Anmeldeseite hat noch den alten Stil.
- Das PR-Feld fragt nur nach dem Marathon.
- Wer abmeldet und sich wieder anmeldet, muss den Kalender neu verbinden und die Check-in-Erinnerung neu einschalten (Befund 23).
- Der Web-Fallback ist nur am Code geprüft, nicht im Browser durchgeklickt.

### Tests

Die volle Suite lief auf cbb587f: 252 von 255 Suiten grün. Rot waren nur 4 Timeouts unter Last, einzeln wiederholt grün. Die Nachprüfung lief 30 + 28 Suiten mit 270 + 209 Tests, alle grün.

### Wichtigste Prüfbefunde (alle behoben)

- „Nutzungsdaten aus“ ging nach Abmelden und Wiederanmelden verloren.
- Der Ziel-Nachtrag konnte `meta.goal` mit einem veralteten Wert überschreiben.
- Die Boot-Abdeckung hatte keine Höchstdauer.
- Alte Einheiten wurden nach dem Anmelden als neu erledigt gezählt.

---

## W4 · Apple-Health-Fix (`fix/apple-health-read-types`, Leiter)

- **Problem:** Seit Juni scheiterte die ganze Apple-Health-Anfrage an `activeEnergyBurned`, einem Typ, den das Plugin nicht kennt.
- **Fix:** Er steht nicht mehr in `APPLE_HEALTH_READ_TYPES`. Der Recovery-Abruf liest `calories` und mappt das auf `activeEnergyBurned`.
- **Gegen den Plugin-Quelltext geprüft:** `@capgo/capacitor-health` 8.4.2 mappt `calories` auf `.activeEnergyBurned` (Health.swift:611/643).
- **Tests:** `appleHealthPluginTypes.test.ts` und `recoveryActiveEnergy.test.ts`, 21 betroffene Suiten mit 140 Tests grün.

## W5 · TestFlight-Checkliste (`docs/testflight-readiness`)

`docs/friend-test/testflight.md` und `docs/friend-test/ios-patches/`:
- Info.plist-Patch, `git apply --check` ok
- `PrivacyInfo.xcprivacy`
- README

Pflichtbefunde:
- `ITSAppUsesNonExemptEncryption` fehlt.
- Das Privacy Manifest fehlt.
- Die Health-Texte sind zu vage bzw. falsch, weil die App nichts schreibt.
- `DEVELOPMENT_TEAM` ist vermutlich das Personal Team.

Weitere Befunde:
- `deploy:ios` öffnet einen Workspace, den es nicht gibt. Stattdessen `npm run cap:ios` verwenden.
- In `.env.local` endet `STRAVA_REDIRECT_URI` auf `/callbacks`, richtig ist `/callback`.

## W6 · Integration (`test/friends-build`, Leiter)

- **Merge-Reihenfolge:**
  1. `fix/apple-health-read-types`
  2. `docs/testflight-readiness`
  3. `docs/friend-test-plan`
  4. `fix/friend-test-hardening`
  5. `feat/strava-activity-import`
  6. `feat/shift-mode`

  W1 kam zuletzt, weil seine Prüfung als letzte PASS gab.
- **Konflikte:** nur in `src/persistence/clearMarathonLocalStorage.ts` und `marathonLocalStorageKeys.ts` (W1 gegen W2/W3). Beide Seiten sind übernommen: Liste der Strava-Schlüssel, Schicht-Schlüssel, Präfix-Löschen innerhalb des `try` aus W3. Die Wahl „Nutzung zählen“ übersteht weiterhin das Abmelden.
- **Verdrahtet (Leiter):**
  - d72e35d: `session_completed` mit Quelle `strava` oder `apple_health` je Einheit aus `applyAppleHealthTrainingSync(...).completions` (`trackSyncCompletions`, gleiche Grenzen: erst nach `logsRemoteReady`, höchstens 20).
  - 6c46363: Schicht-Ereignisse `shift_entries_saved` (nur Anzahl) und `shift_proposal_shown`/`accepted`/`declined` über `connectShiftUsageToTelemetry` am Hook-Punkt `src/shift/shiftUsage.ts`.
  - 57dbdad: Die Seite „Welche Daten MyRace nutzt“ nennt Dienstplan und Strava. Bei den Nutzungsdaten stehen jetzt auch die Quelle Strava und „Dienstplan gespeichert (Anzahl)“.
- **Prüfläufe auf dem Integrationsstand:** siehe unten „Ergebnis W6“.

---

## Korrekturen am Auftrag

1. Migration 022 liegt nur auf `feat/health-native-signals`, nicht auf `main`. `main` hat 001–017, ohne 013. 018/019 sind im Readiness-Plan vorgemerkt, 021 ist reserviert. Neue Nummern sind deshalb **023/024/025**.
2. Strava API Policy seit 01.06.2026: höchstens 7 Tage Cache, keine KI-Nutzung, auch nicht für abgeleitete Daten. Neue Strava-Apps brauchen ein Abo des Entwicklers. Daraus folgen der Coach-Filter, die Tageslast mit geplanten km, das 7-Tage-Löschen und der Erstimport von 10 statt 28 Tagen.
3. Strava-Import und -Zuordnung gibt es nur auf iOS, nicht im Web.
4. Die App ruft fest `marathon-app-alpha.vercel.app` auf, also Production. Neuer Server-Code wie `api/strava/sync.js` wirkt erst nach einem Merge nach `main` oder einem Prod-Deploy, und beides braucht deine Freigabe. Previews sind geschützt (Deployment Protection) und für die App nicht nutzbar.
5. Supabase verschickt ohne eigenen SMTP-Server Mails nur an dein Team. Ohne SMTP oder ohne „Confirm email“ aus kommen die Freunde nicht ins Konto.
6. Im Code kommt die KI-Einwilligung nach dem Wizard, nicht davor. Das ist kein Fehler, der Plan-Kern braucht sie nicht.
7. `weekly_schedule_blocks` und `strava_connections` stehen nicht in der Löschliste, werden aber per `ON DELETE CASCADE` mitgelöscht.
8. Schwelle „langer Dienst“: Im Plan steht „≥ 8 h“, das hätte S4 gebrochen (Frühdienst 6–14). Umgesetzt ist deshalb „länger als 8 h“.
9. Für die Paketverfolgung gab es kein TaskCreate-Werkzeug. Verfolgt wurden die Pakete über `plan.md` und die Branches.

## Tabelle der `[E]`-Werte (Schicht-Modus, `CONFIG.shift`, Spec §7.6)

| Wert | Stand | Begründung | Review §19 |
|---|---|---|---|
| `longShiftHours` | 8, Vergleich „länger als“ | Frühdienst 6–14 nicht eingeschränkt (S4) | 22 |
| `defaultHardMin` | 75 min | Intervalle/Tempo inkl. Ein- und Auslaufen | 23 |
| `defaultLongRunMin` | 150 min | typischer Long Run 2–2,5 h | 23 |
| `defaultEasyMin` | 50 min | lockerer Lauf | 23 |
| `recoveryDaysAfterNights` | 1 | 1. freier Tag nach Nächten eingeschränkt, 2. frei | 21 |
| `earlyStartNightHours` | 2 | Dienst beginnt mehr als 2 h vor 06:00 → zählt wie Ende einer Nacht (Regel 1a) | 25 |
| `fit` | frei 1,0 · eingeschränkt 0,5 · ungeeignet/passt nicht 0,2 | Plan W1, Readiness-Plan Schritt 12, Schwelle 0,35 | 24 |
| `defaultTimes` | Früh 6–14 · Spät 14–22 · Nacht 22–6 | Vorgabe Plan | 24 |
| `horizonDays` | 28 | gleich dem Import-Fenster des Kalenders | 24 |

Schon vorhanden und wiederverwendet:
- `calendar.quickReturnHours` 11 [L]
- Trainingsfenster 06–22 [E]
- Zuschlag 45 min [E]
- `overnightMinHoursNextDay` 2 [E]
- `minDaysBetweenLongRuns` 6 (§8.6)

Die km-Grenze bei „locker statt hart“ ergibt sich aus 60 min ÷ 6,5 min/km, also 9 km.

## Entscheidungen zum Absegnen

Alle sind im Code mit `ENTSCHEIDUNG` markiert, auffindbar mit `git grep -n ENTSCHEIDUNG origin/test/friends-build -- src api`.

**W1 Schicht-Modus**
1. Ein langer Dienst heißt „länger als 8 h“ statt „ab 8 h“.
2. Die Regeln 5, 6 und 8 schränken auch den Long Run ein, nicht nur harte Einheiten.
3. Ob ein Dienst als Nacht zählt, entscheiden die Zeiten (mehr als 2 h im neuen Tag), nicht die gewählte Art.
4. „Locker statt hart“ gilt im Wochenvorschlag für jeden ungeeigneten Tag der Woche, nicht nur für heute. Nie für den Long Run, nie in der Rennwoche.
5. In der Rennwoche sind Verschiebungen auf frühere Tage erlaubt (so Plan W1). Spec §8.7 sieht dort gar keine Vorschläge vor, du musst also eins von beiden festlegen.
6. Ohne Tabelle wirkt der Dienstplan trotzdem, nur auf diesem Gerät und mit Hinweis.
7. Wer einen Dienstplan speichert, bekommt `works_shifts = true`.
8. Es gibt keine geplante Dauer je Tag, es gelten Standarddauern je Art der Einheit.
9. Regel 1a ist neu und steht nicht im Plan: Ein Dienst, der vor 04:00 beginnt, zählt wie das Ende einer Nacht, mit Erholungstag danach. Das gilt auch für einen Frühdienst ab 3 Uhr (Bäckerei). Der Grundtext sagt dann „nach den Nachtdiensten“.

**W2 Strava**
1. Abgleich mit 72 h Überlappung. Der Server löscht Strava-Zeilen nach 7 Tagen (`created_at`).
2. Lokal verfällt ein Strava-Lauf 7 Tage nach seinem **Start**. Das ist strenger als auf dem Server.
3. Erstimport 10 statt 28 Tage, passend zum Zuordnungsfenster und zur 7-Tage-Regel.
4. Keine Kalorien aus `kilojoules`. Dedup ohne Distanz nur über den Start (±5 min).
5. „Erledigt“ bleibt im Coach-Kontext (nur der Status, keine Werte).
6. Eine bestätigte Strava-Zielzeit wird als `manual` gespeichert, also als deine eigene Angabe.
7. `assignedRun`-Werte aus Strava bleiben dauerhaft im Session-Log: Ist-km, Dauer, Puls, Auswertung. Ebenso Ist-km und längster Lauf in `prep_recaps.stats`. Sie gehen nicht an den Coach. **Vorschlag als Folgeaufgabe:** Puls und `runEvaluation` von Zuordnungen mit `strava:`-ID nach 7 Tagen streichen.
8. Folge der KI-Regel: Bei Strava-Läufen rechnen Tageslast und Recovery-Score mit den **geplanten** km. Wer deutlich mehr läuft als geplant, wird unterschätzt. Auch eine eigene km-Angabe bei einer Strava-Zuordnung zählt dann nicht.

**W3 Frisches Konto, Feedback, Nutzungsdaten**
1. Nutzungsdaten sind standardmäßig **an**: pseudonym, ohne Inhalte, abschaltbar. Für einen öffentlichen Start eher Standard aus.
2. Die Sub-3-Marken erscheinen nur, wenn deine Zielzeit höchstens 15 min darüber liegt. Ohne Zielzeit gibt es keine.
3. `meta.goal` hat Vorrang vor `profiles.target_time_seconds`.
4. Der weggeklickte Feedback-Eintrag gilt bis zum Abmelden. Die Wahl „Nutzung zählen“ gilt je Person und übersteht das Abmelden.
5. Ohne Marker: „Hilfe & Feedback“ heißt jetzt „Hilfe per Mail“.
6. Hängt Supabase länger als 10 s, verschwindet die Boot-Abdeckung, und ein frisches Konto sieht dann kurz den Demo-Plan.

## Datenschutz-Vorschläge (für die Datenschutzerklärung, nicht eingebaut)

- **Dienstplan:** „Wenn du den Schicht-Modus nutzt, speichern wir in deinem Konto, ob du in Schichten arbeitest, deine Standardzeiten und je Tag Art, Beginn und Ende deines Dienstes. Wir nutzen das nur, um dir passende Trainingstage vorzuschlagen. Dein Dienstplan wird an keinen KI-Dienst weitergegeben und mit deinem Konto gelöscht.“
- **Strava:** „Wenn du Strava verbindest, holen wir deine Läufe der letzten 10 Tage (Startzeit, Dauer, Distanz, Durchschnittspuls, ggf. Kalorien), um geplante Einheiten automatisch als erledigt zu markieren. Importierte Läufe speichern wir höchstens 7 Tage. Sie gehen nicht an den KI-Coach. Beim Trennen löschen wir sie. Den Zugriff kannst du jederzeit in Strava widerrufen. Anbieter: Strava, Inc., USA.“ (Hinweis: Status „erledigt“ und Ist-Distanz bleiben am Trainingseintrag, siehe W2-Entscheidung 7.)
- **Feedback:** „Wenn du Feedback sendest, speichern wir deinen Text, die gewählte Kategorie, App-Version, Bildschirm, Betriebssystem-Version und Datum zusammen mit deiner Konto-ID. Wir nutzen es nur, um MyRace zu verbessern. Es wird an niemanden weitergegeben und mit deinem Konto gelöscht.“
- **Nutzungsdaten:** „MyRace zählt einzelne Ereignisse (App geöffnet, Plan erstellt, Einheit erledigt mit Quelle, Dienstplan gespeichert mit Anzahl der Tage, Vorschlag gezeigt/angenommen/abgelehnt, Feedback gesendet) mit deiner Konto-ID. Ohne Inhalte, ohne Gesundheitswerte. Abschaltbar unter Einstellungen → Datenschutz & Daten. Gelöscht mit deinem Konto.“

## Risiken nach Schwere

**Hoch (blockiert den Freundes-Test, wenn nicht erledigt)**
1. **Mailversand:** Supabase verschickt ohne SMTP nur an dein Team. Lösung: SMTP einrichten oder „Confirm email“ aus (`morgen.md` Schritt 2).
2. **Server-Code nicht live:** Die App ruft Production auf. Ohne Merge nach `main` bzw. Prod-Deploy gibt es keinen Strava-Sync und kein neues Server-Verhalten (Coach-Filter, Tagesbezug). Der Client-Code im iOS-Build läuft trotzdem.
3. **Migrationen 023–025 nicht angewendet:** Die App fällt dann ruhig zurück, auf lokalen Dienstplan bzw. Mail statt Feedback, aber nichts wird zentral gespeichert.
4. **Strava-Kapazität 1:** Ohne Hochstufen auf 10 und ohne aktives Abo kann sich nur dein Konto verbinden. Ausweg für die Freunde ist Garmin → Apple Health.
5. **Beta-Review dauert 1–2 Tage.** Plan B: interne Tester.

**Mittel**

6. **`AppMain.tsx`** wurde von drei Paketen schmal verdrahtet. Ein Render-Test der Verdrahtung fehlt, abgesichert sind Build, tsc und die Tests der Helfer. Gerätetest nötig.
7. **Strava-Tokens:** Der Client kann sie über RLS 008 lesen. Kein `oauth/revoke` beim Trennen.
8. **Doppelzählung:** Restrisiko bei Apple Watch plus Garmin am selben Lauf, wenn Start oder Distanz außerhalb der Toleranz liegen.
9. **Preview-Daten von Strava-Builds vor 8d61bd2** können eine Strava-Zeit tragen, die als „apple_health“ an den Coach ginge. Vor dem Test die lokalen Testdaten bzw. diese `prep_recaps` löschen (Production ist nicht betroffen).
10. **Bestandsgeräte ohne gespeicherten Besitzer:** Der erste angemeldete Nutzer wird Besitzer. Liegen dort Daten eines anderen Kontos, werden sie nicht gelöscht.
11. **Coach-Tausch:** `handleSwapWorkoutsV2` prüft die Schicht-Schutzregeln nicht.

**Niedrig**

12. **Prompt-Cache:** Der statische Coach-Prompt hat sich geändert, der Cache baut sich einmal neu auf.
13. **Kontowechsel ohne Abmelden per Deep Link:** Es gibt ein kurzes Fenster, in dem Ereignisse von A unter B landen könnten. Dicht ist das nur durch die Reihenfolge, nicht im Code.
14. **Alter Schlüssel `marathonUsageEventsEnabled`** ohne ID bleibt liegen. Er stammt nur von Testgeräten dieses Branches.
15. **Planwechsel auf frischem Gerät mit zwei Plänen:** Die Zielzeit aus `meta.goal` wird nicht übernommen.
16. **Schlaf aus mehreren Quellen** wird doppelt summiert, nur dokumentiert.
17. **`usePostWorkoutSummary.test.tsx` und Onboarding-Suiten** laufen unter Parallel-Last gelegentlich in den 5-s-Timeout. Einzeln sind sie grün.

## Ergebnis W6 (Prüfläufe auf `test/friends-build`)

Auf dem Stand vor den beiden Doku-Dateien (57dbdad), alles im Worktree des Integrations-Branches:

- `CI=false npm run build`: **grün**, Exit 0, nur die bekannten ESLint-Warnungen.
- `npx tsc --noEmit -p .`: **grün**, Exit 0.
- `CI=true npm test -- --watchAll=false`: **287 von 287 Suiten, 63 059 von 63 059 Tests, 7 von 7 Snapshots grün**, ohne Wiederholung.
- Kein `ios/` im Diff gegen `origin/main`. Keine Migration angewendet, keine Production-Variable geändert, nichts nach `main` gemergt.
