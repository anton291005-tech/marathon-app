# Umbauplan: Readiness-System („Tagesform“)

> Grundlage: `docs/readiness-spec.md` v0.2 (nach unabhängiger Prüfung) und `docs/readiness-research.md` (12.11.2026). Stand des Codes: `main` @ `8f565ed`.
> Art: reiner Plan. Kein App-Code geändert. Dateipfade sind am Repo geprüft; mit „neu“ markierte Pfade existieren noch nicht.
> Vorbild: `docs/plan-core-plan.md`. Ein Schritt = ein Branch von `main` = ein Auftrag. Merge nur mit Freigabe.

## Leitplanken

- **Ein reines TS-Modul** `src/readinessCore/**` (neu): keine Imports aus React, Node, Supabase oder anderen `src/`-Ordnern außer `src/planCore` (Typen, `isHardSession`, `dates`). Keine Uhr (`todayYmd` ist Eingabe), kein Netz, kein Sprachmodell. Geprüft mit `target: es5` wie der Plan-Kern (keine Iteration über Set/Map).
- **Alle Zahlen in `src/readinessCore/config.ts`**, je Eintrag `{ value, source: "L"|"P"|"E", spec: "§4.3" }` und `CONFIG_VERSION`. Das Spoho-Review ändert nur diese Datei und die Snapshots.
- **Invarianten R1–R26** als Prüffunktionen und Tests, **Referenzszenarien S1–S13 (inkl. S11b)** als Fixtures mit Snapshot- und Bereichsprüfung, dazu Property-Tests mit Seed (`src/planCore/random.ts` wiederverwenden).
- **Production wird nie schlechter.** Bis Schritt 13 läuft der Kern hinter `REACT_APP_READINESS_MODE=off|shadow|on` (Standard `off`). `shadow` rechnet und speichert, zeigt aber weiter die heutige Recovery-Kachel. Die alte Pipeline bleibt bis Schritt 16 unverändert im Code.
- **Neue Fragen und Tabellen sind additiv.** Jede Migration ist idempotent, hat RLS `user_own_data`, wird von Anton im Supabase-SQL-Editor angewendet und per Prüf-Abfrage bestätigt, **bevor** der zugehörige Branch gemergt wird. Der Client fällt bei fehlender Spalte/Tabelle (`42703`/`42P01`) still zurück (Muster `loadAllTrainingPlans`).
- **Kein Kalendertitel und kein Check-in-Wert an ein Sprachmodell ohne KI-Einwilligung** (R18). Der Kern selbst ruft nie KI auf.
- **Jeder Schritt:** Diagnose zuerst, dann `CI=true npm test` grün, `CI=false npm run build` grün, `plan-reviewer` gegen diesen Plan, `git add <Pfade>`, push. `ios/` und `Package.swift` nie committen.
- **Zeit:** nur `src/core/time/timeSystem.ts` (`getAppTodayYmd`) und `sessionYmd` aus `src/core/time/sessionDate.ts`.

## Architekturentscheidung

```
Apple Health ─► src/recovery/aggregateRecoverySamples.ts ─► recovery_daily (+ Nachtwerte)
Check-in ─────► daily_checkins                                   │
Session-Log ──► session_logs (+ rpe, duration_min)               │
Kalender ─────► weekly_schedule_blocks + event_load_labels       │
Plan ─────────► TrainingPlanV2                                   ▼
                                    src/readiness/buildReadinessInputs.ts (neu, App-Seite)
                                                                 ▼
                                    src/readinessCore  computeReadiness(inputs) → ReadinessResult
                                    src/readinessCore  proposeActions(result, plan, days) → Proposal[]
                                                                 ▼
             src/app/runtime/useReadinessRuntime.ts (neu) ─► UI (Home-Karte, Detail), readiness_daily
                                                                 ▼
                         bestehende Mutations-Engine (src/ai/mutations/**) + Validatoren führen bestätigte Vorschläge aus
```

- Der Kern liefert **Daten, keine Texte**: Stufe, Beiträge, Grund-Codes, Regel-Codes, Vorschläge. Texte entstehen in `src/readiness/readinessText.ts` (neu) aus festen Bausteinen (Spec §10.7).
- Vorschläge sind **Beschreibungen** (`{ kind: "move"|"reduce"|"soften"|"rest", sessionId, targetYmd?, factor? }`). Ausgeführt werden sie nach Bestätigung über die vorhandenen Wege: Tag tauschen über `src/ai/mutations/swapWorkoutDates.ts` bzw. `assignSessionToBestCapacityDay.ts`, Inhalt ändern über Patches (`src/lib/supabase/services/planPatchesService.ts`), jeweils nach `validateMicroStructure`/`checkPlan`.
- Rechnen auf dem Gerät. Für den Coach-Kontext (Schritt 15) importiert der Server dasselbe Modul wie beim Plan-Kern (`api/tsconfig.json`, Variante A).

## Schritte

**MVP** = vor dem Freundes-Test. **später** = danach. Aufwand in Agent-Arbeitstagen (S ≤ 1, M 2–3, L 4–5).

### 0 · Gerätepunkte klären — **MVP**, S (½ Tag, Anton + Diagnose-Chat)

Keine Code-Änderung. Auf dem iPhone 13 mit Antons Uhr prüfen und in diesem Dokument nachtragen:

1. Wie viele SDNN-Werte liegen pro Nacht in Apple Health (drei typische Nächte)?
2. Was liefert `@capgo/capacitor-health` 8.4.2: Herzfrequenz-Samples mit Zeitstempel (für das Schlaffenster), Schlag-zu-Schlag-Serien, Handgelenkstemperatur im Schlaf, `workoutEffortScore`? Quelle: Typdefinitionen des Plugins nach `npm ci` und ein Lesetest.
3. Liefert eine Series 12 Nacht-HRV als rMSSD über HealthKit? (nur falls ein Gerät verfügbar ist)

- **Abnahme:** Ergebnis als Abschnitt „Gerätebefund“ hier eingetragen. Liefert das Plugin keine Herzfrequenz im Schlaffenster, nutzt Schritt 4 den Tages-Ruhepuls (`r_B = 1,5`, Spec §4.3); die Spec bleibt gültig.

#### Gerätebefund (Code-Teil, 2026-11-12; Punkte 1 und 3 offen für Anton)

Geprüft an den Typen und am Swift-Code von `@capgo/capacitor-health` 8.4.2 (`dist/esm/definitions.d.ts`, `ios/Sources/HealthPlugin/Health.swift`):

- **Herzfrequenz-Samples mit Zeitstempel:** ja, über `readSamples({ dataType: "heartRate", startDate, endDate, limit })`. Standard-`limit` ist 100 → für das Schlaffenster ausdrücklich höher setzen (z. B. 2000). Damit ist die Schlaf-Herzfrequenz (§4.3, `r_B = 1`) machbar, sofern die Uhr nachts misst (Punkt 1).
- **HRV:** nur `heartRateVariabilitySDNN` als Einzelwerte mit Zeitstempel. **Keine Schlag-zu-Schlag-Serien** (`HKHeartbeatSeriesType` nicht unterstützt) → rMSSD ist mit diesem Plugin nicht möglich; Schritt 18 „rMSSD“ bräuchte ein eigenes natives Plugin.
- **Handgelenkstemperatur im Schlaf** (`appleSleepingWristTemperature`): **nicht** unterstützt; nur `bodyTemperature`/`basalBodyTemperature` (meist manuell eingetragen). §9.1 läuft damit vorerst ohne Temperatur (Regel A über Atemfrequenz, Regel B nicht erfüllbar).
- **`workoutEffortScore`:** nicht gemappt; `Workout` liefert nur Typ, Dauer, Energie, Strecke, Quelle und `metadata` als Zeichenketten. Die Vorbelegung aus §6.2 entfällt vorerst.
- **Schlafphasen:** ja (`sleepState`: inBed/asleep/awake/rem/deep/light), damit lässt sich das Schlaffenster bestimmen.
- **Offen (Anton, iPhone 13 + Uhr):** Punkt 1 (Anzahl SDNN-Werte pro Nacht in drei Nächten) und Punkt 3 (Series 12).

### 1 · `feat/readiness-core-skeleton` — **MVP**, S (1 Tag)

Gerüst ohne Logik, nicht verdrahtet.

- **Dateien (neu):**
  - `src/readinessCore/index.ts`: öffentliche API (zunächst nur Typen und `READINESS_CORE_PING`)
  - `src/readinessCore/config.ts`: alle Zahlen aus Spec §3–§9, §11 mit Herkunft und Abschnitt; `CONFIG_VERSION = "0.1.0"`
  - `src/readinessCore/types.ts`: `ReadinessInputs`, `DayMarkers`, `CheckIn`, `SessionLoad`, `CalendarBlock`, `EventLabel`, `ReadinessResult`, `Contribution`, `Level`, `DataBasis`, `SafetyFlag`, `Proposal`, `ReasonCode`, `RuleCode`
  - `src/readinessCore/__tests__/config.test.ts`: jeder Eintrag hat `source` und `spec`; Snapshot
  - `src/__tests__/readinessCorePurity.test.js`: Vorlage `src/__tests__/planCorePurity.test.js`
  - `package.json`: ESLint-Override für `src/readinessCore/**` wie für `src/planCore/**` (nur relative Imports und `../planCore`)
- **Abnahme:** Tests und Build grün; Production unverändert.
- **Abhängigkeiten:** keine.

### 2 · `feat/session-rpe` — **MVP**, M (1,5 Tage)

Neue Frage „Wie anstrengend war die Einheit?“ 0–10 (Spec §6.2). Erste sichtbare Änderung; sammelt ab sofort Lastdaten.

- **Migration `016_session_logs_rpe.sql`:** `ALTER TABLE public.session_logs ADD COLUMN IF NOT EXISTS rpe smallint CHECK (rpe BETWEEN 0 AND 10), ADD COLUMN IF NOT EXISTS duration_min integer CHECK (duration_min BETWEEN 5 AND 600);`
- **Dateien:**
  - `src/features/session/SessionEntrySheet.tsx`: neue Skala 0–10 mit Ankern über dem bestehenden Gefühl-Feld; Gefühl-Legende wird „Und wie hat sie sich angefühlt?“
  - `src/lib/supabase/services/sessionLogsService.ts`: `DbSessionLog` + Mapping für `rpe`, `duration_min`; Rückfall ohne Spalten
  - `src/marathonPrediction.ts` (Typ `SessionLog`): Felder `rpe?`, `durationMin?`
  - `src/sessionLogs/hydrateMarathonLogs.ts`: Felder durchreichen
  - `src/trainingIntelligence/applyAppleHealthSync.ts`: Dauer des zugeordneten Laufs in `durationMin` übernehmen
  - `src/hooks/usePostWorkoutSummary.ts`, `src/components/PostWorkoutSummaryCard.tsx`: RPE in der Rückschau anzeigen (nur Anzeige)
- **Tests:** Sheet (RTL): Auswahl, Abwahl, Speichern ohne RPE bleibt möglich bei Altversion des Servers; Service-Mapping; Migration idempotent.
- **Abnahme:** Auf dem Preview speichert eine erledigte Einheit `rpe` in Supabase; ohne angewendete Migration funktioniert das Abhaken weiter.
- **Rückweg:** Feld im Sheet ausblenden; Spalten bleiben ungenutzt.
- **Festgelegt (Spec §6.2, A4):** Standardfrage, mit einem Tipp („Später“) überspringbar, damit Auto-Sync-Einheiten nicht blockieren; die Karte fragt beim nächsten Öffnen einmal nach. Fehlende RPE → Fallback-Last.

### 3 · `feat/daily-checkin` — **MVP**, M–L (3 Tage)

Morgen-Check-in (Spec §6.1) mit Gesundheits-Chips, ohne Wirkung auf den Plan.

- **Migration `017_daily_checkins.sql`:** Tabelle laut Spec §15; RLS; Trigger `update_updated_at`; eindeutig `(user_id, calendar_day)`. Dazu `profiles.health_consent_at`/`health_consent_version` (CHECK: beide gesetzt oder beide NULL, Muster Migration 015).
- **Dateien (neu):**
  - `src/features/checkin/CheckInSheet.tsx`, `CheckInSheet.test.tsx`: vier Fragen, optional Schlafdauer-Stepper (nur ohne Schlafdaten), Chips mit Folgefragen
  - `src/features/checkin/checkInState.ts`: Gültigkeit (bis erste Einheit oder 14:00), lokaler Cache über `src/persistence/**`
  - `src/features/checkin/healthConsent.ts`: einmalige Zustimmung zur Speicherung von Gesundheitsangaben (Spec §15), gespeichert in `profiles` über `src/lib/supabase/services/profilesService.ts`, nicht nur lokal
  - `src/lib/supabase/services/dailyCheckinsService.ts` + Test
- **Dateien (geändert):**
  - `src/features/today/TodayCards.tsx`: Einstieg „Check-in“ auf Home (Karte, solange heute offen)
  - `src/services/notificationService.ts`: eine tägliche Erinnerung (eigene id, abschaltbar, Standard 07:30, neutraler Text ohne Gesundheitsinhalt); Schalter und Uhrzeit dort, wo die Trainings-Erinnerung heute eingestellt wird (Diagnose zuerst: `src/context/NotificationContext.tsx` bzw. die Einstellungsseite, die ihn nutzt)
  - `src/features/settings/dataUsage.ts`: neue Datenart „Check-in und Befinden“
  - `api/_lib/deleteAccount.js`: `daily_checkins` in `USER_DATA_TABLES`
- **Tests:** Sheet in < 5 Interaktionen abschließbar; Chip-Folgefragen; „Zwickt es noch?“ am Folgetag; Speichern offline und Nachreichen; Konto-Löschung enthält die Tabelle.
- **Abnahme:** Check-in auf dem Preview speicherbar, erscheint am selben Tag nicht erneut, Erinnerung nur wenn eingeschaltet (iPhone-Test durch Anton). Keine Stufe, kein Vorschlag.
- **Rückweg:** Karte ausblenden (Flag `CHECKIN_ENABLED` in `src/features/settings/settingsFlags.ts`).
- **Production:** `CHECKIN_ENABLED` bleibt in Production bis Schritt 14 **aus** (Preview und Antons Gerät an). Grund: Ein Check-in ohne sichtbare Wirkung ist der am besten belegte Weg, Nutzer zu verlieren (Spec §6.4). Voraussetzung für Production außerdem: Zustimmungstext und Datenschutzerklärung (Entscheidung 8 unten).

### 4 · `feat/readiness-night-signals` — **MVP**, M (2–3 Tage), nach 0

Uhr-Daten richtig aggregieren (Spec §4.3, §4.4, §2 Punkt 1).

- **Migration `019_recovery_daily_night.sql`:** `sleep_hr`, `hrv_night_ms`, `hrv_samples` (Nummer 019, weil 018 parallel in Schritt 8 entsteht; Reihenfolge der Anwendung egal).
- **Dateien:**
  - `src/recovery/aggregateRecoverySamples.ts`: je Nacht Median der SDNN-Werte **im Schlaffenster** und deren Anzahl; mittlere Herzfrequenz im Schlaffenster. Das bisherige Tagesmittel `hrvMs` bleibt unverändert für die alte Pipeline.
  - `src/recovery/recoveryTypes.ts` (`RecoveryDailyRow`): `hrvNightMs?`, `hrvSamples?`, `sleepHr?`
  - `src/appleHealth/appleHealthService.ts`, `src/health/healthDataService.ts`: Herzfrequenz-Samples für das Schlaffenster laden, falls laut Schritt 0 verfügbar
  - `src/lib/supabase/services/recoveryDailyService.ts`: neue Spalten mit Rückfall
- **Tests:** Fixture einer Nacht mit 5 SDNN-Werten (2 außerhalb des Schlaffensters) → Median aus 3; < 3 Werte → kein Nachtwert; alte Felder unverändert (`src/recovery/recoveryPipeline.integration.test.ts` bleibt grün).
- **Abnahme:** Auf Antons Gerät stehen für drei Nächte Nachtwerte in `recovery_daily`; die heutige Recovery-Zahl ändert sich nicht.

### 5 · `feat/readiness-core-markers` — **MVP**, M (2–3 Tage), nach 1

Baselines, z-Werte, Blöcke (Spec §4.2–§4.5).

- **Dateien (neu):** `src/readinessCore/stats.ts` (Median, MAD, begrenzen), `baseline.ts`, `blockBody.ts` (B), `blockSleep.ts` (C), `blockFeeling.ts` (A), Tests je Datei.
- **Tests:** Baseline schließt den Tag und Kranktage aus (R12); < 14 Werte → kein z; Totbänder; HRV über dem Band = 0 (R14); Schlafüberschuss = 0; Untergrenzen 6 h; Check-in-z ab Tag 1; Monotonie je Marker (R9, Property); Eingabetyp enthält keine Schlafphasen (R13, Typ-Test).
- **Abnahme:** Blockwerte der Szenarien S3, S5, S6, S11 entstehen aus Rohwert-Fixtures innerhalb ±0,1 der Spec-Werte.

### 6 · `feat/readiness-core-load` — **MVP**, M (2 Tage), nach 1, parallel zu 5

Trainingslast (Spec §5).

- **Dateien (neu):** `src/readinessCore/load.ts` (Last je Einheit in drei Stufen, Tageslast, ATL/CTL, Vorbelegung, Lastdruck, persönliche RPE-Mediane), Tests.
- **Berührt nicht:** `src/recovery/trainingDailyLoad.ts`, `planTrainingLoad.ts` (alte Pipeline).
- **Tests:** sRPE vor Fallback; Fallback-Gewichte je `kind` (Altpläne ohne `kind` über `sessionType`); geplante Einheiten zählen nicht; Lastdruck nie negativ; Vorbelegung aus `meta.core.inputs.currentWeeklyKm`; 10 Einheiten einer Art ersetzen das Gewicht, begrenzt auf 0,5–2×.
- **Abnahme:** P5-Plan aus `src/planCore/__fixtures__` vollständig „erledigt“ simuliert: Lastdruck in Aufbauwochen 0–0,8, in Entlastungs- und Taper-Wochen 0.

### 7 · `feat/readiness-core-life` — **MVP**, M (2–3 Tage), nach 1, parallel zu 5

Kalendermerkmale, Cluster, Lebensdruck, Tageseignung (Spec §7).

- **Dateien (neu):** `src/readinessCore/titleCluster.ts` (Schlüssel, Trigramm-Jaccard), `calendarFeatures.ts` (Schlafgelegenheit, Ruhezeit, gebundene Stunden, Trainingsfenster), `lifePressure.ts`, `daySuitability.ts`, `labelSuggestions.ts` (Stichwörter → Vorschlag; portiert die Liste und die Ausschlussliste aus `src/scheduling/eventLoad.ts` des Branches `feat/event-load-semantics`), Tests.
- **Tests:** „Sprint Prüfung“ / „Sprint-Prüfung“ / „Sprintprüfung“ → ein Cluster; „Schachturnier“ ≠ Sport-Vorschlag; Schlafgelegenheit S2 = 5:45 h; unbekannt statt „gut“ ohne Abendtermin; über Mitternacht geteilte Blöcke (`eventToScheduleBlocks.ts` teilt bei 23:59) werden wieder zusammengesetzt; unetikettierte Termine wirken nur über Zeiten (R19); Schlafpunkte entfallen mit Schlafdaten (R15).
- **Abnahme:** S1 und S2 liefern die Tageseignung aus der Spec.

### 8 · `feat/event-load-labels` — **MVP**, M (2–3 Tage), nach 7

Etiketten und Rückfrage (Spec §7.3, §10.5).

- **Migration `018_event_load_labels.sql`:** Tabelle laut Spec §15. **Vorher Prüf-Abfrage in Supabase:** Existiert schon eine Tabelle `event_load_labels` (aus dem alten Branch, dort als Migration 013 geplant)? Wenn ja, würde `CREATE TABLE IF NOT EXISTS` das neue Schema still überspringen; dann zuerst Schema vergleichen und per `ALTER` angleichen.
- **Dateien (neu):** `src/lib/supabase/services/eventLoadLabelsService.ts` + Test; `src/features/calendarLabels/EventQuestionCard.tsx` (eine Frage, drei Chips, Art-Auswahl) + Test; `src/features/calendarLabels/MyEventsPage.tsx` (Liste der Cluster, Etikett ändern, „Zählt nicht“); `src/features/calendarLabels/questionQueue.ts` (höchstens 1/Tag, 3/Woche, Rangfolge).
- **Dateien (geändert):** `src/calendar/eventToScheduleBlocks.ts`: Ganztagstermine nicht mehr verwerfen, als eigene Zeilenart ohne Zeiten (nur für Etiketten); `src/features/settings/settingsNavigation.ts` + `SettingsSectionList.tsx`: Eintrag „Meine Termine“ unter Training; `api/_lib/deleteAccount.js`: Tabelle aufnehmen.
- **Tests:** Rangfolge; Obergrenzen; Etikett gilt für den Cluster; „Nicht mehr fragen“; Ganztag „Klausur“ wird etikettierbar und erzeugt keine Zeitmerkmale.
- **Abnahme:** Auf dem Preview erscheint nach einem vergangenen Termin höchstens eine Frage; die Antwort steht in Supabase und in „Meine Termine“. Noch keine Wirkung auf Pläne.
- **Achtung:** Ganztagstermine ändern das Importergebnis. Vor dem Merge prüfen, dass `computeDayCapacityScore` (alte Engine) Zeilen ohne Zeiten ignoriert; sonst bleibt die Import-Änderung hinter dem Flag aus Schritt 12.

### 9 · `feat/readiness-core-state` — **MVP**, L (3–4 Tage), nach 5, 6, 7

Zustand, Stufe, Datenbasis, Beiträge, Sicherheitsflags (Spec §4.6, §4.7, §9, §12).

- **Dateien (neu):** `src/readinessCore/state.ts` (Erwartung, Update, Beiträge, Lücke), `level.ts` (Stufen, Hysterese, „eher“), `dataBasis.ts`, `safety.ts` (Signalregel A/B, Krankheit, Schmerz, anhaltend; Rückkehr-Zustand), `computeReadiness.ts` (setzt alles zusammen), `invariants.ts` (R1, R6, R8, R9, R12–R15, R21–R23, R26 als Prüffunktionen), `__fixtures__/scenarios.ts` (S1–S13 inkl. S11b mit Rohwerten), Tests.
- **Tests:**
  - `scenarios.test.ts`: S3, S5, S6, S8–S11, S11b, S13 und das Wireframe-Beispiel treffen R auf ±0,05 und die Stufe exakt; Snapshot des ganzen Ergebnisses. Kennenlernphase, HRV-Deckel, Grenzen [−3, +3] und „ohne Messung nie `low`“ je mit eigenem Test
  - `state.property.test.ts`: 2 000 Nutzer-Tage je Datenstufe a–d, alle Invarianten; Summe der Beiträge = R
  - eingeschwungenes P: 0,26 (drei Blöcke), 0,40 (ohne Uhr), ≈ 2 (keine Eingaben)
  - Sicherheitsregeln: S4, S12; Temperatur allein löst nie aus; Flag überstimmt Stufe (R6)
- **Zusätzlich:** `docs/readiness-sensitivity.md` (neu) aus einem Testlauf: Spec §13 Punkt 2.
- **Abnahme:** alle genannten Tests grün; Sensitivitätsbericht liegt vor; kein Vorschlag in den Szenarien kippt bei ±50 % eines einzelnen [E]-Parameters, oder der Parameter steht als Review-Punkt in der Spec.

### 10 · `feat/readiness-core-actions` — **MVP**, L (5–6 Tage), nach 9

Entscheidungslogik als reine Funktion (Spec §8).

- **Dateien (neu):** `src/readinessCore/actions.ts` (Tabelle §8.3, Handlungsstufen), `moveCandidates.ts` (zulässige Zieltage §8.5), `weekActions.ts` („Diese Woche ruhiger“, Prüfungsphase, Wochenvorschau als Liste ungeeigneter Paare), `phaseRules.ts` (Taper, Rennwoche), `guards.ts` (R3, R4, R7, R10, R11, R16, R25), `planGuards.ts` (siehe unten), Tests. R5 wird hier geprüft (Kern gibt nur Vorschläge zurück, Typ-Test: keine Schreibfunktion im Export), R24 in Schritt 1 (Reinheitstest).
- **Prüfung der Vorschläge (Spec §8.1 Nr. 2):** `checkPlan` aus `src/planCore/invariants.ts` ist dafür nicht nutzbar: Es erwartet das Zwischenformat `SessionPlan`, einen Weg vom gespeicherten `TrainingPlanV2` (mit Patches) dorthin gibt es nicht, und seine Regeln `I16/run-days` und `I3/two-week` (beide `error`) würden Pausen und Kürzungen blockieren. Deshalb **`src/readinessCore/planGuards.ts` (neu):** prüft I6 (inkl. Wochengrenze und MLR), I7, I8, I15 und I16 (nur verfügbare Tage) direkt auf Einheiten mit `dateIso`/`kind` plus `raceDate`, `availableDays`, `runDaysPerWeek` aus `meta.core.inputs`, und zwar nur für die betroffenen Tage und ihre Nachbarn. **Paritätstest:** Auf unveränderten Plänen P1–P6 meldet `planGuards` für diese Regeln dasselbe wie `checkPlan`. Altpläne ohne `meta.core.inputs`: zusätzlich `validateMicroStructure` (`src/ai/validation/validateMicroStructure.ts`) als Parameter, und kein Tausch auf einen bisherigen Ruhetag. Aufwand dafür in diesem Schritt eingerechnet (+1–2 Tage).
- **Aus `fix/microstructure-delta` portieren (Idee, nicht Code):** Bewertung der **Änderung** (vorher/nachher, nur betroffene Tage plus Nachbarn) statt des ganzen Plans, damit ein alter Befund in einer anderen Woche keinen Vorschlag blockiert.
- **Tests:** S1, S2, S7, S10 liefern genau den Vorschlag aus der Spec; Property: 2 000 zufällige (Plan aus P1–P6, Tag, Stufe, Eignung) → R3, R4, R10, R16 halten; kein Vorschlag aus der Stufe bei Datenbasis „niedrig“ (R11); Rennen nie Quelle/Ziel; Krankheits-/Schmerz-Pause wird nie von der Plan-Prüfung unterdrückt; nachrückender Vorschlag hat nie mehr Belastung; Long Run verlässt seine Woche nicht; Taper ohne H2.
- **Abnahme:** wie Tests. Noch nicht verdrahtet.

### 11 · `feat/readiness-shadow` — **MVP**, M (2 Tage), nach 2, 3, 4, 8, 9

Kern mit echten Daten füttern, Ergebnis speichern, nichts anzeigen.

- **Migration `020_readiness_daily.sql`:** Tabelle laut Spec §15.
- **Dateien (neu):** `src/readiness/buildReadinessInputs.ts` (liest `recovery_daily`-Zeilen, Check-ins, Logs, Plan, Blöcke, Etiketten), `src/app/runtime/useReadinessRuntime.ts`, `src/lib/supabase/services/readinessDailyService.ts`, `src/readiness/readinessMode.ts` (`REACT_APP_READINESS_MODE`, Standard `off`; zusätzlich lokaler Entwickler-Schalter über `src/migrationFlags.ts`), Tests.
- **Dateien (geändert):** `src/AppMain.tsx`: Hook einhängen (nur bei `shadow`/`on`); `api/_lib/deleteAccount.js`: Tabelle aufnehmen.
- **Tests:** Inputs-Builder mit Fixture-Konto; `off` → Hook rechnet nicht; `shadow` → speichert eine Zeile je Tag, UI unverändert (Snapshot der Home-Karte gleich); gespeicherte `contributions`/`proposal` enthalten keinen Termintitel; `toRemoteCoachPayload` (`src/lib/ai/getAiContext.ts`) enthält weder Check-in-Werte noch Flags, Stufe, Titel oder Cluster-Schlüssel (R18 fürs MVP).
- **Abnahme:** Preview mit `shadow`: Für Antons Konto entstehen Zeilen in `readiness_daily`; Vergleichstabelle „alte Recovery-Zahl vs. neue Stufe“ über ≥ 7 Tage als Anhang hier. Production bleibt `off`.

### 12 · `feat/readiness-calendar-engine` — **MVP**, M (3 Tage), nach 7, 8, 10

Tageseignung ersetzt die Zeitanteil-Regel; Wochenvorschau (Spec §7.5, §8.4).

- **Dateien (geändert):**
  - `src/scheduling/capacityScore.ts`: hinter `readinessMode === "on"` (nicht bei `shadow`: dort bleibt jedes sichtbare Verhalten unverändert) liefert `computeSessionDayFitScore` den Fit aus der Tageseignung (frei 1,0 · eingeschränkt 0,5 · ungeeignet 0,2 → unter `MIN_FIT_SCORE_THRESHOLD` 0,35); bei `off` unverändert
  - `src/ai/mutations/scanWeekForCalendarConflicts.ts`, `proposeWeekCalendarReassignments.ts`, `buildCalendarReassignmentAction.ts`: Zieltage bis +3 Tage, über die Wochengrenze nur nach Spec §8.5 Nr. 1 (Zielwoche bekommt nicht mehr km und nicht mehr Qualitäts-km; Long Run bleibt in seiner Woche; heute nur dieselbe Woche, `buildCalendarReassignmentAction.ts:36`); im Taper nur auf einen früheren Tag; Grundtext nennt Termin und Merkmal („nur 5:45 h Zeit zum Schlafen“)
  - `src/ai/mutations/validateWeekReassignmentBatch.ts`: unverändert nutzen
  - `src/components/ai/AiActionCard.tsx`: strukturierte Zeilen Alt → Neu mit Grund (Roadmap-Schritt 8 teilweise)
  - `src/calendar/eventClassifier.ts`: Stichwörter liefern nur noch den Etikett-**Vorschlag** für die Rückfrage (Spec §7.3, A8), keine stille Wirkung
- **Tests:** S1 und S2 Ende-zu-Ende über die Mutations-Engine; bestehende Suites (`capacityScore.test.ts`, `scanWeekForCalendarConflicts.test.ts`, `proposeWeekCalendarReassignments.test.ts`) bleiben bei `off` unverändert grün; neue Fälle bei `on`.
- **Abnahme:** Preview mit `on`: Antons Testfall „Sprint Prüfung“ (mit Leerzeichen, als Prüfung etikettiert) am Intervalltag erzeugt einen Vorschlag ohne zwei harte Tage hintereinander; ohne Etikett und mit kurzer Dauer entsteht kein Konflikt (gewollt, R19) und die Rückfrage erscheint nach dem Termin.

### 13 · `feat/readiness-ui` — **MVP**, L (3–4 Tage), nach 10, 11

Tageskarte und Detailansicht (Spec §10), Vorschläge bestätigen.

- **Dateien (neu):** `src/features/readiness/ReadinessCard.tsx` (Variante A), `ReadinessDetail.tsx` (Marker mit Normalband, Beiträge, Regel im Klartext, 28-Tage-Verlauf), `src/readiness/readinessText.ts` (Bausteine §10.7), `src/readiness/applyProposal.ts` (führt bestätigte Vorschläge über Tausch bzw. Patch aus), `src/features/readiness/FitFeedback.tsx` (zweimal pro Woche „Hat die Einschätzung heute gepasst?“ → `readiness_daily.fit_feedback`), Tests inkl. Sperrlisten-Test der Texte (R17).
- **Dateien (geändert):** `src/features/today/TodayCards.tsx`: bei `on` ersetzt die Karte die Recovery-Kachel (`recoveryScore`, `onOpenRecovery`); `src/components/RecoveryVerlaufCard.tsx`: bei `on` durch den Verlauf der Detailansicht ersetzt; `src/app/runtime/recoveryRuntimePresentation.ts`: liefert bei `on` das neue Modell; `src/app/runtime/useRecoveryDomainRuntime.ts`, `src/recovery/recoveryPresentation.ts`, `src/recovery/recoveryDisplayState.ts`: bei `on` nicht mehr für die Anzeige gelesen (Diagnose zuerst, welche Stellen sie noch brauchen).
- **Tests:** Karte für jede Stufe und Datenstufe a–d (Snapshots der Texte); „Wie geplant“ speichert `decision: "declined"` und ändert nichts; Übernehmen ändert den Plan genau wie im Vorschlag und besteht die Integritätsprüfung; 390 px ohne Überlauf; kein Rot außerhalb der Sicherheitsstufen.
- **Abnahme:** Chrome-Preview mit `on` gegen Antons Konto: Karte am Morgen nach Check-in, Detailansicht, ein angenommener und ein abgelehnter Vorschlag; iPhone-13-Sichtprüfung durch Anton.

### 14 · `chore/readiness-cutover` — **MVP**, S (½ Tag), nach 12, 13

- Production `REACT_APP_READINESS_MODE=on` (neuer App-Build nötig, weil die Variable zur Build-Zeit gelesen wird), davor mindestens 7 Tage `shadow` auf Antons Gerät und Durchsicht der Vergleichstabelle aus Schritt 11.
- `docs/roadmap.md` und `CLAUDE.md` (Abschnitt „Recovery domain“) nachziehen: Roadmap-Schritte 5, 7 und 8 der Phase 2 sind durch diesen Umbau abgedeckt bzw. ersetzt.
- **Rückweg:** Build mit `off`; keine Datenmigration, neue Tabellen bleiben stehen.

### 15 · `feat/readiness-coach-context` — später, M (2 Tage), nach 14

Coach bekommt Stufe, Grund-Codes, Vorschlag (nur mit KI-Einwilligung).

- `src/lib/ai/getAiContext.ts` (`toRemoteCoachPayload`), `src/lib/ai/recoverySummary.ts` (ersetzen), `api/_lib/coachHandlers.js` (Kontextblock, Guidance „widersprich der Tagesform nicht“ → konkrete Regel), `src/features/aiConsent/aiConsentState.ts` + `api/_lib/aiConsent.js` (Text und `AI_CONSENT_VERSION` **zwingend** erhöhen und neu fragen: Stufe, Gründe und Flags sind Gesundheitsdaten, die die bestehende Einwilligung nicht abdeckt; Kalendertitel nur mit eigenem Satz im Text; zugleich den Zustimmungstext des Check-ins prüfen), `src/__tests__/apiLogsNoUserContent.test.js` erweitern (R18).
- Vom Server eingesetzte Aktion `adjust_plan_for_illness` bei Recovery < 40 (`coachHandlers.js`) wird an das Sicherheitsflag gebunden statt an die alte Zahl.

### 16 · `chore/remove-legacy-recovery` — später, M (2 Tage), frühestens 3 Wochen nach 14

Löschen: `src/recovery/recoveryScoringEngine.ts`, `latentRecoveryState.ts`, `homeRecoveryScore.ts`, `loadOnlyHomeRecoveryScore.ts`, `recoveryFallback7d.ts`, `recoverySemanticLayer.ts`, `recoveryInterpretationLayer.ts`, `aiInsightGenerator.ts`, `trainingDailyLoad.ts`, `planTrainingLoad.ts`, `getRecoveryInfluence.ts`, `recoveryScoreDebug.ts` samt Tests (auch `recoveryConfidenceLayer.test.ts`, das die Scoring-Engine testet; eine eigene Konfidenz-Datei gibt es nicht); Recovery-Achse in `src/ai/validation/validateSwap.ts` und `fatiguePressure` in `validatePhaseSwap.ts` durch Stufe/Flag ersetzen; `src/marathonPrediction.ts`/`marathonForecast.ts` auf das neue Modell umstellen oder entkoppeln (Diagnose zuerst: beide lesen heute `homeRecoveryScore`). Schalter `off` entfällt.

### 17 · `feat/readiness-insights` — später, L (4 Tage), sobald ≥ 6 Wochen Daten aus dem Freundes-Test vorliegen

Einsichten nach Spec §11: `src/readinessCore/insights.ts` (Block-Bootstrap mit festem Seed, Benjamini-Hochberg, Schrumpfung, Störgrößen), `src/features/readiness/InsightsList.tsx`, Texte mit Pflichtbausteinen (R20). Abnahme an synthetischen Reihen mit bekanntem und ohne Effekt (Fehlalarmquote ≤ 10 %).

### 18 · Weitere „später“-Punkte (eigene kleine Branches)

- **rMSSD:** Nacht-HRV aus Schlag-zu-Schlag-Serien oder Series-12-Werten (abhängig von Schritt 0); Totband dann 0,5.
- **KI-Vorschlag für Etiketten** mit Einwilligung (`/api/ai`-Unterroute, Vorschlag wirkt erst nach Bestätigung).
- **Individuelle Sensitivitäten** ab 90 Tagen (Spec §11).
- **Trockenlauf auf PMData/LifeSnaps** als Skript außerhalb der App (`scripts/`), Bericht in `docs/`.
- **Strava-Import** als weitere Quelle für Dauer/Distanz.
- **Kalender-Export** (ICS-Feed, `docs/calendar-system-analysis.md` §5) – unabhängig von Readiness.
- **Alte Branches schließen:** `fix/load-class-ssot`, `fix/microstructure-delta`, `feat/event-load-semantics` auf GitHub löschen, sobald Schritte 7 und 10 gemergt sind (Freigabe Anton).

## Übersicht

| # | Branch | MVP | Aufwand | hängt ab von | Migration | ändert Production? |
|---|---|---|---|---|---|---|
| 0 | Gerätepunkte | ja | S (½ T) | – | – | nein |
| 1 | `feat/readiness-core-skeleton` | ja | S (1 T) | – | – | nein |
| 2 | `feat/session-rpe` | ja | M (1,5 T) | – | 016 | ja, neue Frage |
| 3 | `feat/daily-checkin` | ja | M–L (3 T) | – | 017 | nein (Flag in Production aus bis Schritt 14) |
| 4 | `feat/readiness-night-signals` | ja | M (2–3 T) | 0 | 019 | nein (neue Felder) |
| 5 | `feat/readiness-core-markers` | ja | M (2–3 T) | 1 | – | nein |
| 6 | `feat/readiness-core-load` | ja | M (2 T) | 1 | – | nein |
| 7 | `feat/readiness-core-life` | ja | M (2–3 T) | 1 | – | nein |
| 8 | `feat/event-load-labels` | ja | M (2–3 T) | 7 | 018 | ja, Rückfrage (ohne Planwirkung) |
| 9 | `feat/readiness-core-state` | ja | L (3–4 T) | 5, 6, 7 | – | nein |
| 10 | `feat/readiness-core-actions` | ja | L (5–6 T) | 9 | – | nein |
| 11 | `feat/readiness-shadow` | ja | M (2 T) | 2, 3, 4, 8, 9 | 020 | nein (Schalter `off`) |
| 12 | `feat/readiness-calendar-engine` | ja | M (3 T) | 7, 8, 10 | – | nein (Schalter) |
| 13 | `feat/readiness-ui` | ja | L (3–4 T) | 10, 11 | – | nein (Schalter) |
| 14 | `chore/readiness-cutover` | ja | S (½ T) | 12, 13 | – | ja, Umschalten |
| 15 | `feat/readiness-coach-context` | später | M | 14 | – | ja |
| 16 | `chore/remove-legacy-recovery` | später | M | 14 + 3 Wochen | – | nein |
| 17 | `feat/readiness-insights` | später | L | 14 + Daten | – | ja |
| 18 | diverse | später | S–L | – | – | – |

**Aufwand bis Cutover:** Summe 33–40 Arbeitstage. **Kritischer Pfad:** 1 → 5 → 9 → 10 → 13 → 14 ≈ 15–19 Tage, plus 7 Tage `shadow` (laufen parallel zu 12 und 13). Mit drei parallelen Worktrees (Kern · Eingaben/UI · Kalender) realistisch rund drei Wochen Kalenderzeit.

```
0 ─ 4 ───────────────────────┐
2 ───────────────────────────┤
3 ───────────────────────────┤
1 ─┬─ 5 ─┐                   │
   ├─ 6 ─┼─ 9 ─┬─ 10 ─┬──────┴─ 11 ─ 13 ─┐
   └─ 7 ─┴─────┘      └─ 12 ─────────────┴─ 14 ─ 15, 16, 17
       └─ 8
```

Empfohlene Verteilung auf Worktrees: **A (Kern)** 1 → 5 → 6 → 9 → 10 · **B (Eingaben)** 2 → 3 → 4 → 11 → 13 · **C (Kalender)** 7 → 8 → 12 (7 startet nach 1).

## Was MVP für den Freundes-Test ist

Enthalten: Check-in, Session-RPE, Tageskarte mit Gründen und Vorschlag, Verschieben/Leichter/Locker nach Bestätigung, Etiketten mit Rückfrage, Wochenvorschau aus dem Kalender, Sicherheitsstufen, Betrieb ohne Uhr, Verlauf in `readiness_daily`.

Bewusst später: Einsichten (brauchen die Daten des Tests), Coach-Kontext, rMSSD, KI-Etiketten, individuelle Sensitivitäten, Löschen der alten Pipeline.

Für den Test zusätzlich nötig (kein eigener Schritt, in 13 enthalten): zweimal pro Woche die Frage „Hat die Einschätzung heute gepasst?“ (Ja/Nein, Spalte `readiness_daily.fit_feedback`), als Grundlage der Auswertung nach Spec §13 Punkt 5.

## Tests und Qualitätstor

1. Spec → Config-Snapshot → Invarianten R1–R26 → Szenarien S1–S13 → Property-Tests.
2. Sensitivitätsbericht (Schritt 9).
3. 7 Tage `shadow` auf Antons Gerät mit Vergleichstabelle (Schritt 11).
4. Chrome-Preview mit `on` (Schritte 12, 13), iPhone-13-Sichtprüfung.
5. Spoho-Review der Spec §19 anhand der Szenarien; Änderungen nur in `src/readinessCore/config.ts`, danach Snapshots bewusst aktualisieren.
6. Auswertung des Freundes-Tests (Spec §13 Punkt 5) vor jeder Aussage „validiert“.

## Entscheidungen, die vor dem Start Antons Freigabe brauchen

**Freigegeben von Anton am 2026-11-12 (Punkte 1–7 vollständig, Punkt 8 als Aufgabe vor Schritt 3 in Production).** Zusätzlich entschieden: Der Freundes-Test wird vorgezogen und läuft auf dem Stand ohne Readiness; Schritte 2 und 3 sammeln dabei schon Daten.

Aus Spec §18, in der Reihenfolge, in der sie Schritte blockieren:

1. **A4** Neue Frage nach der Einheit, überspringbar (Schritt 2).
2. **A5, A6** Vier Morgenfragen, kein Streak (Schritt 3).
3. **A9, A10** Alte Recovery-Pipeline ersetzen; alte Kalender-Branches nicht mergen (Schritte 5–12, 16).
4. **A7, A8** Kalender über Schlaf/Zeitfenster und bestätigte Etiketten statt stiller Stichwörter (Schritte 7, 8, 12).
5. **A1** Keine Zahl auf der Hauptkarte (Schritt 13).
6. **A2, A3, A22–A25** Vorschlag statt Automatik, nie erhöhen; Kennenlernphase, kein Streichen nur aus dem Check-in, HRV-Deckel, Prüfung an der Änderung (Schritte 9, 10).
7. **A18** Name „Tagesform“ (Schritt 13).
8. Rechtliches: Zustimmungstext für Gesundheitsangaben und Ergänzung der Datenschutzerklärung vor Schritt 3 in Production.

## Erster Schritt

Parallel starten: **Schritt 0** (Gerätepunkte, Anton, eine halbe Stunde mit Uhr und iPhone), **Schritt 1** (`feat/readiness-core-skeleton`) und **Schritt 2** (`feat/session-rpe`). Schritt 2 ist der wertvollste frühe Schritt: Jede Woche ohne RPE ist eine Woche ohne Lastdaten, und die Frage ist unabhängig vom Rest sofort nützlich.
