# Freundes-Test – Arbeitsplan (Nacht 16./17.11.2026)

> Vertrag zwischen Leiter und Subagenten. Basis aller Branches: `origin/main` @ `78109aa`. Ziel: TestFlight-Build für 3–4 Freunde ab Do 19.11., Ideathlon-Demo Schicht-Modus bis 04.12.
> Pivot (16.11.): **„MyRace – der Laufplan, der deinen Dienstplan kennt.“**
> Pflichtlektüre für jedes Paket: `CLAUDE.md`, `docs/roadmap.md` (Harte Regel: Plan-Regeln gehen immer vor Kalender), `docs/readiness-spec.md` §7.2/§7.5/§8.4–§8.7, `docs/readiness-plan.md` (Leitplanken, Schritte 7/8/12), `docs/readiness-data-sources.md`, `docs/calendar-system-analysis.md`.

## 0. Befunde am Code (Phase A, geprüft auf `origin/main` 78109aa)

| Auftrag sagt | Code sagt | Status |
|---|---|---|
| Tagesfenster werktags 06–22, Wochenende 07–23 | `src/scheduling/capacityScore.ts` `WEEKDAY_WINDOW`/`WEEKEND_WINDOW` | bestätigt |
| Termine werden um Mitternacht geteilt | `src/calendar/eventToScheduleBlocks.ts:35,103` (Tag 1 endet `23:59`) | bestätigt; Nacht 22–6 belegt werktags 0 min im Fenster |
| Konflikt erst ab > 65 % Belegung | harte Einheit: Fit = `capacityScore`, Konflikt bei < `MIN_FIT_SCORE_THRESHOLD` 0,35 (`assignSessionToBestCapacityDay.ts`) | bestätigt |
| `weekly_schedule_blocks` ohne Mitternacht/Rotation, Preset Mo–Fr 6–14 | Migration 009 `end_time > start_time`, `src/calendar/presets.ts` „Schichtarbeit“ | bestätigt |
| Strava nur OAuth | `api/strava/auth.js`, `callback.js`, `api/_lib/stravaService.js`, `strava_connections` (008). Keine Aktivitäten. Tabelle hat **keine** Spalte für „letzte Synchronisierung“ | bestätigt → Migration 024 |
| Vercel 6 Funktionen | `vercel.json`: ai, account, generate-plan, generate-plan-full, strava/auth, strava/callback | bestätigt |
| `health_workouts` reicht für Strava | Spalten `source_id, workout_type, start_time, duration_seconds, distance_meters, avg_heart_rate, calories, splits, laps, …`, UNIQUE (`user_id`,`source_id`) | reicht; **aber** `saveHealthWorkout` schreibt `calories: null` (Client) |
| Apple-Health-Fix `fix/apple-health-read-types` 1 Commit vor main | `b6f1493`, 4 Dateien, +61/−5 | bestätigt, siehe W4 |
| `SUPPORT_EMAIL` Platzhalter | `src/features/settings/appInfo.ts:9` | bestätigt |
| Migration 022 „in Production“ | `022_health_consent_v2.sql` liegt **nur** auf `feat/health-native-signals` (17 Commits vor main, nicht Teil des Freundes-Builds). `main` hat 001–017 (ohne 013). 018–020 sind im Readiness-Plan vorgemerkt (018 `event_load_labels`, 019 `recovery_daily_night`), 021 reserviert | **Neue Nummern: 023, 024, 025** |
| `src/readinessCore` vorhanden | nur `config.ts`, `types.ts`, `index.ts`, Snapshot-Test `__tests__/config.test.ts`. Kalender-Parameter §7.2 stehen schon in `CONFIG.calendar` (`quickReturnHours` 11, `windowStart` 06:00, `windowEnd` 22:00, `windowExtraMin` 45). Grund-Code `late_shift` in `types.ts` | Schicht-Kern baut darauf auf |
| Leitplanke Readiness-Kern | `src/readinessCore/**` importiert nur aus `src/planCore` (Typen, `isHardSession`), keine Uhr, `target: es5` (keine Iteration über Set/Map) | gilt für `shiftDays.ts` |

## 1. Regeln für alle Pakete (aus dem Auftrag §5/§6, verbindlich)

- Eigener Branch ab `origin/main`, nie nach `main` mergen. Keine Migration anwenden, keine Production-Variablen, keine Production-Daten.
- `git add <Pfade>`, nie `-A`/`.`. Nie `ios/` oder `ios/App/CapApp-SPM/Package.swift` committen. Keine Secrets.
- Commits klein, Stil `feat(shift): …`, `fix(strava): …`, Commit-Ende `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Zeit nur über `src/core/time/timeSystem.ts` (`getAppNow`, `getAppTodayYmd`), Kalendertage über `dateIso`/`sessionYmd` (`src/core/time/sessionDate.ts`). ESLint erzwingt das.
- Bestehende Tests nie abschwächen/löschen. `src/planCore` nicht ändern. Keine alten Kalender-Branches.
- Fehlende Tabelle/Spalte (Postgres `42P01`/`42703`, PostgREST `PGRST205`/`PGRST204`) darf nie abstürzen: ruhiger Rückfall.
- Texte: Deutsch, Du-Form, ruhig, konkret, keine medizinischen Aussagen, keine Emojis, Lucide-Icons, Design-Tokens aus `docs/design-system/` (`tokens.css`, `components.md`) statt Hex. 390 px ohne Überlauf, Safe Areas.
- Vorschlag statt Automatik. Belastung wird durch Schichten nie erhöht.
- Schichtdaten, Strava-Daten, Feedback, Nutzungsdaten gehen an kein Sprachmodell.
- Tests während der Arbeit gezielt (`npx react-scripts test --watchAll=false <Muster>` bzw. `--findRelatedTests`), am Ende einmal `CI=true npm test` und `CI=false npm run build`. Rot unter Parallel-Last erst einzeln wiederholen.
- `src/AppMain.tsx` (5 700 Zeilen) wird von W1, W2 und W3 berührt: Logik in eigene Module/Hooks/Komponenten, in `AppMain.tsx` nur schmale Verdrahtung (wenige, zusammenhängende Stellen). Das hält die Integration (W6) konfliktarm.
- Entscheidungen, die Anton treffen müsste: sinnvollste Variante wählen, im Code mit `// ENTSCHEIDUNG (Anton absegnen): …` markieren, im Abschlussbericht des Pakets auflisten.

## 2. Pakete

Priorität bei Zeitnot: W1 > W4 > W2 > W3 > W6 > W5.

### W1 · `feat/shift-mode` – Schicht-Modus (USP)

**Ziel:** Dienstplan eintragen (< 1 min für 4 Wochen); App erkennt Tage nach Nacht-/Spätdiensten als ungeeignet für harte Einheiten und schlägt Verschiebungen vor, mit Grund, nur nach Bestätigung.

**Daten – `supabase/migrations/023_shift_mode.sql`** (idempotent: `IF NOT EXISTS`, Policy per `DO`-Block oder `DROP POLICY IF EXISTS`):
- `shift_entries`: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users on delete cascade`, `shift_date date not null` (Tag des Dienstbeginns), `kind text not null check (kind in ('early','late','night','off','custom'))`, `start_time time`, `end_time time` (`end_time <= start_time` = endet am Folgetag), CHECK: `kind='off'` ⇔ beide Zeiten null, sonst beide gesetzt; `label text`, `created_at`, `updated_at` + Trigger `update_updated_at`, UNIQUE (`user_id`,`shift_date`), Index auf `user_id`, RLS + Policy `user_own_data` (Muster 009).
- `profiles.works_shifts boolean` (null = nicht gefragt), `profiles.shift_defaults jsonb`.
- `api/_lib/deleteAccount.js`: `shift_entries` aufnehmen (Test anpassen/ergänzen).
- `src/lib/supabase/services/shiftEntriesService.ts` (+ Test, Muster `weeklyScheduleBlocksService`): laden für Datumsbereich, Bulk-Upsert über (`user_id`,`shift_date`), Löschen je Tag; Rückgabe unterscheidet „Tabelle fehlt“ (`{ status: "unavailable" }`) von Fehler. `works_shifts`/`shift_defaults` über `profilesService` mit Spalten-Rückfall.

**Kern – `src/readinessCore/shiftDays.ts`** (rein, ES5-tauglich, nur `planCore`-Importe):
- Eingabe: `ShiftEntry[]` (eigener Kern-Typ: `dateYmd`, `kind`, `start`/`end` `HH:MM` oder null), `fromYmd`, `toYmd`, optional geplante Dauer je Tag (für das Trainingsfenster).
- Ausgabe je Kalendertag mit Schichtbezug: `{ dateYmd, hard, long, easy, reasonCode, reasonText, shift? }` mit Eignung `free | limited | unsuitable | no_window` (UI: frei · eingeschränkt · ungeeignet · passt zeitlich nicht). Tage ohne Bezug: **kein Eintrag** (keine Aussage, nicht „frei“). „Schichtbezug“ = der Tag hat einen Eintrag oder liegt innerhalb der Nachwirkung einer Regel (Folgetag Nacht/Spät, 2. freier Tag nach Nachtblock).
- Regeln (Werte in `CONFIG.shift`, jeder als `p(value, "E"|"L", "§7.6")`; `CONFIG_VERSION` erhöhen, Snapshot bewusst aktualisieren):
  1. Tag, an dem ein Nachtdienst morgens endet → hart + Long Run `unsuitable`; locker `limited` („kurz, und erst nach dem Schlafen“). Code `after_night`.
  2. Tag, an dem der erste Nachtdienst eines Blocks abends beginnt → hart `limited`, Long Run `unsuitable`. Code `before_night`.
  3. Tage zwischen zwei Nachtdiensten → hart + Long Run `unsuitable`. Code `between_nights`. (Vorrang vor 1.)
  4. Erster freier Tag nach einem Nachtblock → hart `limited`, Long Run `unsuitable` (`recovery_after_nights`); zweiter freier Tag → `free`.
  5. Ruhezeit < 11 h zwischen Ende eines Dienstes und Beginn des nächsten (`CONFIG.calendar.quickReturnHours`, [L] Vedaa 2015) → Tag des Folgedienstes hart `limited`. Code `quick_return`.
  6. Spätdienst, der nach Mitternacht endet (z. B. Gastro 17:00–00:30) → Folgetag hart `limited`. Code `late_shift`.
  7. Trainingsfenster = größte freie Lücke 06–22 Uhr aus echten Dienstzeiten (inkl. des Morgen-Teils eines über Mitternacht laufenden Dienstes); ausreichend ab geplanter Dauer + 45 min. Kein ausreichendes Fenster → hart `unsuitable`, locker `no_window`. Code `no_window`. Ohne bekannte Dauer: Standarddauer aus Config [E].
  8. Dienst ≥ 8 h → Tag hart `limited`, außer das ausreichende Fenster liegt vor Dienstbeginn. Code `long_shift`.
  9. Eine Schicht zählt nie als Training. Bei mehreren Regeln gilt die strengste Eignung; der Grund ist der der strengsten Regel.
- Alles über Kalendertage (`YYYY-MM-DD`-Arithmetik, kein `Date` mit Ortszeit), deshalb sommerzeitfest; Tests mit `TZ=Europe/Berlin`, `UTC`, `America/Los_Angeles` und dem Umstellungswochenende 25.10./28.03.
- Spec-Erweiterung: neuer Abschnitt `docs/readiness-spec.md` §7.6 „Dienstplan (Schicht-Modus)“ und neue Review-Punkte in §19 (je `[E]`-Wert eine Zeile).

**App-Seite – `src/shift/**` (neu):** Adapter Service-Zeilen → Kern-Eingabe, `useShiftRuntime` (laden, Speichern, Status „nicht verfügbar“), Flag `isShiftModeEnabled()` (`REACT_APP_SHIFT_MODE`, Standard an, `"0"`/`"false"` = aus; Muster `src/features/settings/settingsFlags.ts`), Texte (`shiftText.ts`).

**Wirkung auf den Plan (nur bei Flag an UND `works_shifts === true` UND Einträgen):**
- `DayCapacityScore` bekommt ein optionales Feld `shift?: ShiftDaySuitability`. `computeDayCapacityScore(dateIso, blocks, shiftContext?)` hängt es an, wenn der Kontext für den Tag eine Aussage hat. `computeSessionDayFitScore`: liegt `shift` vor, gilt der Fit aus der Eignung (harte Typen `tempo/interval/race` → `hard`, `long` → `long`, sonst `easy`; `free` 1,0 · `limited` 0,5 · `unsuitable`/`no_window` 0,2), kombiniert mit der bestehenden Rechnung per `Math.min` (Kalender-Termine bleiben wirksam). Ohne `shift`: **bit-gleich** wie heute.
- Den Kontext optional (letzter Parameter) durch `buildCalendarReassignmentCandidates`, `computeSourceDayCapacity`, `scanWeekForCalendarConflicts`, `proposeWeekCalendarReassignments`, `proposeSingleSessionCalendarReassignment` reichen. Alle bestehenden Tests unverändert grün.
- Schicht-Pfad zusätzlich (eigene Funktion, z. B. `src/shift/proposeShiftWeek.ts`, über die bestehende Engine):
  - `limited` für eine harte Einheit/Long Run ist ein **weicher Konflikt**: nur verschieben, wenn ein Zieltag mit `free` (bzw. ohne Aussage und ohne Kalenderkonflikt) existiert (Spec §8.4); sonst kein Vorschlag, nur der Hinweis auf „Heute“.
  - Harte Schutzregeln (hart ablehnen, nicht nur warnen): keine zwei harten Tage hintereinander (auch über die Wochengrenze, harte Typen + Long Run wie `HIGH_INTENSITY`), Long Run bleibt in seiner Kalenderwoche, Rennen nie Quelle oder Ziel, in Taper-/Rennwoche nur auf frühere Tage, gesperrte Sessions (`buildLockedSessionIds`) nie Quelle/Ziel. Batch-Prüfung über `validateWeekReassignmentBatch`.
  - Kein sicherer Tag: bestehender Fallback mit Warnung; „heute locker statt hart“ nur, wenn es dafür schon einen Patch-Weg gibt (prüfen: `planPatchesService`, Patch-Typen in `src/ai/mutations/**`); sonst nur Hinweis. Ergebnis im Bericht.
  - Vorschlagstext nennt Dienst und Merkmal: „Nach dem Nachtdienst (22–6 Uhr) ist heute kein guter Tag für Intervalle. Vorschlag: Donnerstag – da hast du frei.“
- Scan-Auslöser: nach dem Speichern des Dienstplans (für die aktuelle und die nächste Woche) und über den bestehenden Knopf im Woche-Tab (heute nur bei `scheduleBlocks.length > 0` sichtbar → auch bei Schichteinträgen).

**Oberfläche:**
- Wizard (`src/components/onboarding/**` bzw. wo der Wizard liegt; Schritt mit den Lauftagen): Frage „Arbeitest du in Schichten oder mit wechselnden Zeiten?“ Ja/Nein; Ja → ein Satz Nutzen + „Dienstplan jetzt eintragen“ / „Später“. Antwort landet in `profiles.works_shifts` (Rückfall lokal, wenn Spalte fehlt).
- Bestandsnutzer mit `works_shifts == null`: einmalige, wegklickbare Karte auf „Heute“ (Wegklicken lokal merken).
- Einstellungen → Training: Schalter/Zeile „Ich arbeite in Schichten“ und Zeile „Dienstplan“ (`settingsNavigation.ts`, `SettingsSectionList.tsx`).
- Dienstplan-Seite `src/features/shift/ShiftPlanPage.tsx`: 28 Tage ab heute, Tag antippen → Chips Früh · Spät · Nacht · Frei · Eigene Zeit (Zeitwahl). Standardzeiten (Früh 6–14, Spät 14–22, Nacht 22–6) einmal änderbar. Schnelleingabe „Woche kopieren“ und Rotationsmuster (z. B. `F F S S N N – – –`) ab Datum für N Wochen. Speichern in einem Bulk-Upsert. Tabelle fehlt → ruhiger Hinweis statt Formular-Fehler.
- Woche-Tab: dezentes Kürzel F/S/N/frei am Tag (`src/features/week/WeekRows.tsx`), Knopf „Dienste eintragen“ (nur bei `works_shifts`).
- Heute: an Tagen mit Schichtbezug genau ein Satz (`src/features/today/TodayCards.tsx`), z. B. „Nach dem Nachtdienst: heute nur locker – die Intervalle liegen am Donnerstag.“
- Läuft im Web (Safari) ohne Apple Health und ohne Kalenderfreigabe.

**Tests (Fixtures `src/shift/__fixtures__` bzw. `src/readinessCore/__tests__`):** S1 Pflege N-N-frei-frei, Intervall am Tag nach der 2. Nacht, Long Run am 1. freien Tag → beide ungeeignet, Vorschlag auf freie Tage ohne zwei harte Tage in Folge; S2 Spät → Früh (Quick Return) mit Tempo am Frühdienst-Tag → `limited`, Vorschlag nur wenn freier Tag existiert; S3 Gastro 17:00–00:30 vor Intervalltag → `limited`; S4 nur Frühdienste mit Nachmittagsfenster → kein Konflikt; S5 Rennwoche mit Nachtdienst 2 Tage vor dem Rennen → Rennen unangetastet, nichts rückt näher ans Rennen; S6 `works_shifts=false` → altes Verhalten; S7 Flag aus → altes Verhalten. Regression: Nacht 22–6 macht den Folgetag nie `free`. Property-Test (Seed, `src/planCore/random.ts`): zufällige Dienstpläne × Pläne P1–P6 (`src/planCore/__fixtures__`) → kein angenommener Vorschlag erzeugt zwei harte Tage in Folge oder verschiebt einen Long Run aus seiner Woche. UI-Tests (RTL) für Seite, Rotationsmuster, Wizard-Frage, fehlende Tabelle.

**Akzeptanz:** alle Tests grün; Build grün; auf der Preview kann ein Testkonto mit `works_shifts = true` (nach 023) vier Wochen Dienste in < 1 min eintragen und bekommt für S1 den erwarteten Vorschlag mit Begründung.

**Risiken:** Konflikte in `AppMain.tsx`; Snapshot der Readiness-Config; Gleichzeitigkeit mit Kalender-Blöcken (beide wirken, `Math.min`).

### W2 · `feat/strava-activity-import` – Läufe von Garmin & Co.

**Weg A (Apple Health, kein Server-Code):** am Code prüfen, dass Workouts aus fremden Quellen (Garmin Connect) nicht gefiltert werden (`src/appleHealth/appleHealthService.ts`, `src/healthRuns.ts`, `workoutTypeClassifier.ts`, `src/app/runtime/useAppleHealthAutoSync.ts`) und dass derselbe Lauf nicht doppelt zählt (Dedup heute über `platformId`/`healthRunStableId`). Befund in den Bericht. Hilfe in Einstellungen bei Apple Health: „Garmin-Uhr? So kommen deine Läufe rein“ (3 Schritte: Garmin Connect → Mehr/Einstellungen → Verbundene Apps → Apple Health → Trainings/Schlaf/Herzfrequenz einschalten; genauen Wortlaut der aktuellen Garmin-Connect-App prüfen). Schlaf aus fremden Quellen: heute werden Segmente aller Quellen summiert (siehe `docs/readiness-plan.md` G1 auf `feat/health-native-signals`) – nur dokumentieren, nicht ändern.

**Weg B (Strava-Import):**
- `api/strava/sync.js` (+ Eintrag in `vercel.json`, dann 7 Funktionen). `guardRequest` mit Pflicht-Token, ohne `aiConsent`, eigener Quota-Bucket `strava_sync` in `api/_lib/apiQuota.js` (z. B. 30/h, 200/Tag). Holt über `getValidStravaAccessToken` `GET /athlete/activities?after=<epoch>&per_page=100` seit `last_synced_at` (erstmals 28 Tage), nur `Run`, `TrailRun`, `VirtualRun` (`sport_type`, Rückfall `type`). Upsert in `health_workouts` mit `source_id = 'strava:<id>'`: `start_time` (`start_date`), `duration_seconds` (`moving_time`, ggf. `elapsed_time`), `distance_meters`, `avg_heart_rate` (`average_heartrate`), `calories` (`kilojoules`→kcal nur wenn eindeutig, sonst null), `workout_type = 'running'`, `splits` nur wenn ohne Zusatzaufruf (Liste liefert keine Splits → null).
- `supabase/migrations/024_strava_sync_state.sql`: `strava_connections.last_synced_at timestamptz`, `last_sync_status text`, `disconnected_at timestamptz` (oder gleichwertig; idempotent).
- Fehler: Refresh 400/401 bzw. Aktivitäten 401 → Verbindung als getrennt markieren, Antwort `{ status: "reconnect_required" }`, UI „Strava neu verbinden“. 429 → `{ status: "rate_limited", retryAfter }`, Client versucht später. Keine Verbindung → `{ status: "not_connected" }`, nichts passiert.
- Client: `src/strava/stravaSync.ts` (Auslöser App-Start und Rückkehr in den Vordergrund, gedrosselt höchstens alle 15 min, lokal gemerkt; Knopf „Jetzt synchronisieren“ bei der Strava-Verbindung in den Einstellungen ohne Drossel). Danach `loadHealthWorkouts` und dieselbe Zuordnung wie Apple-Health-Workouts (`applyAppleHealthTrainingSync` bzw. was `useAppleHealthAutoSync` aufruft) → erledigt, Ist-Distanz, Anstrengungsfrage (Session-RPE) wie bei Health-Läufen.
- Dedup: gleicher Lauf aus Apple Health und Strava (Start ±5 min, Distanz ±5 %) zählt einmal, Apple Health hat Vorrang. Reine Funktion mit Tests, an der Stelle, an der die Läufe zusammengeführt werden.
- Strava-Regeln: aktuelle Brand Guidelines und API Agreement prüfen (developers.strava.com); offizieller „Connect with Strava“-Knopf/Wortlaut, „Powered by Strava“ dort, wo Strava-Daten erscheinen. **Strava-Läufe aus dem Coach-Kontext heraushalten** (Client-Kontextaufbau und `api/_lib/coachHealthRunFields.js` prüfen; `strava:`-Quellen filtern). Befund in den Bericht.
- Bericht: Schritte zur Athleten-Kapazität (Single Player Mode → 10 im API-Dashboard), Datenschutz-Absatz „Strava“ als Vorschlag.
- Tests: Mapping mit Fixture-JSON, Laufarten-Filter, Dedup, Drossel, Token-Fehler (401/429), Ende-zu-Ende mit gemocktem Fetch: geplante Einheit wird erledigt und bekommt die Ist-Distanz; doppelte Quelle zählt einmal. Kein echter Strava-Aufruf.

**Akzeptanz:** wie Auftrag W2.

### W3 · `fix/friend-test-hardening` – frisches Konto ohne Stolpersteine

1. Durchlauf frisches Konto am Code nachverfolgen (Registrierung → Bestätigung per Deep Link → KI-Einwilligung → Wizard → Plan → Heute/Woche → erste Einheit erledigen → Anstrengungsfrage → Coach). Befundliste `docs/friend-test/fresh-account-trace.md`, dann beheben.
2. Backlog: Zielzeit am Plan statt im Profil (mit Rückfall für Altpläne; `planOwnedPreferences.ts`, `profilesService.ts`, `settingsGoalLine.ts`); Coach-Text mit falschem Tagbezug („morgen … warst du schon gefordert“) finden und beheben; Jahr bei Chat-Datumseingaben („am 3. Januar“) aus heute ableiten (nächstes Vorkommen ab heute).
3. `SUPPORT_EMAIL` aus `REACT_APP_SUPPORT_EMAIL`, Platzhalter nur als Rückfall.
4. Feedback: Einstellungen → Konto & Hilfe → „Feedback geben“; dezenter Eintrag auf „Heute“ in den ersten 14 Tagen nach Registrierung (`user.created_at`). Textfeld, optional Kategorie (Fehler · Idee · Lob), angehängt: App-Version, Bildschirm, Gerät/OS, Datum. Tabelle fehlt → `mailto:`.
5. Nutzungsdaten `src/telemetry/usageEvents.ts`: `trackUsageEvent(name, props?)` mit genau `app_open`, `onboarding_done`, `shift_entries_saved` (count), `shift_proposal_shown`, `shift_proposal_accepted`, `shift_proposal_declined`, `session_completed` (source: manual|apple_health|strava), `feedback_sent`. Gedrosselt (`app_open` höchstens 1×/h), fehlertolerant (nie werfen), abschaltbar in Einstellungen → Datenschutz & Daten. W3 verdrahtet die Ereignisse, die es auf `main` gibt (`app_open`, `onboarding_done`, `session_completed` manuell/Apple Health, `feedback_sent`); Schicht- und Strava-Ereignisse verdrahtet der Leiter in W6.
6. Migration `025_feedback_usage.sql`: `user_feedback` (id, user_id, category, message, app_version, screen, device, created_at) und `usage_events` (id, user_id, name CHECK in Liste, props jsonb, created_at); RLS: Nutzer darf nur eigene Zeilen anlegen und lesen (keine Update/Delete-Policy). `api/_lib/deleteAccount.js` ergänzen. `docs/friend-test/queries.sql` (aktive Nutzer je Tag, Schicht-Vorschläge angenommen/abgelehnt, erledigte Einheiten je Quelle).
7. Nur wenn Zeit: Scroll-Position beim Tab-Wechsel, Renndatum-Fehler erst nach Eingabe, Wizard-Navy → Tokens.
8. Web-Fallback: App startet im Browser ohne native Plugins und schafft den Grundablauf.

**Akzeptanz:** Befundliste abgearbeitet oder begründet offen; Tests je Fix; Build grün.

### W4 · Apple-Health-Fix (Leiter)

`origin/fix/apple-health-read-types` (`b6f1493`): Diff gelesen – `activeEnergyBurned` raus aus `APPLE_HEALTH_READ_TYPES`, Recovery-Abruf liest `calories` und reicht als `activeEnergyBurned` weiter, Label angepasst, Schutztest gegen die Plugin-Typliste. Tests und Build im Worktree `~/marathon-app-hotfix` laufen lassen. Nicht nach `main`, aber als erstes in W6. Befund zu Weg A an W2.

### W5 · `docs/testflight-readiness` – Checkliste

Nur Doku, nichts unter `ios/` committen. `docs/friend-test/testflight.md` + `docs/friend-test/ios-patches/` (Snippets/Patch-Dateien): Info.plist (Bundle-ID, Version/Build, Usage-Descriptions, `ITSAppUsesNonExemptEncryption`), Privacy Manifest, App-Icon, Entitlements (HealthKit, URL-Schemes `myrace://`), Schritt-für-Schritt ab Developer-Account, „Was testen?“-Text, Einstellungen in Vercel/Supabase/Strava.

### W6 · `test/friends-build` – Integration (Leiter)

Ab `origin/main`: merge `fix/apple-health-read-types` → `feat/shift-mode` → `feat/strava-activity-import` → `fix/friend-test-hardening` → `docs/testflight-readiness` (nur PASS). Danach Nutzungsereignisse für Schicht/Strava verdrahten, `CI=false npm run build`, `CI=true npm test`, `npx tsc --noEmit -p .`, push. `docs/friend-test/REPORT.md`, `docs/friend-test/morgen.md`.

## 3. Prüfung (Phase C)

Je Paket ein frischer Prüf-Subagent (nicht der Autor): Diff gegen das Akzeptanzkriterium hier, gegen `docs/roadmap.md` (Harte Regel) und §1; Build und betroffene Tests selbst ausführen. Zusätzlich `plan-reviewer`. FAIL → nachbessern, erst nach PASS pushen.

## 4. Migrationen (Reihenfolge der Anwendung durch Anton)

| Nr. | Datei | Paket | Inhalt |
|---|---|---|---|
| 023 | `023_shift_mode.sql` | W1 | `shift_entries`, `profiles.works_shifts`, `profiles.shift_defaults` |
| 024 | `024_strava_sync_state.sql` | W2 | Sync-Status an `strava_connections` |
| 025 | `025_feedback_usage.sql` | W3 | `user_feedback`, `usage_events` |
