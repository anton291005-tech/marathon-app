# Planerzeugung – Bestandsaufnahme für einen deterministischen Plan-Kern

Stand: 2026-11-03, Code-Basis `fix/plan-volume-guards` @ `4d725ed` (noch nicht in `main`).
Reine Bestandsaufnahme, keine Code-Änderung. Zeilenangaben beziehen sich auf diesen Stand.

Abkürzungen in den Tabellen: `pf` = `api/_lib/phasedFullPlanGenerator.js`, `det` = `api/_lib/deterministicPlanGenerator.js`,
`inv` = `api/_lib/planInvariants.js`, `pst` = `api/_lib/planSessionText.js`, `wvp` = `api/_lib/weeklyVolumeProgression.js`,
`pwu` = `api/_lib/planWorkoutUtils.js`, `cpg` = `api/_lib/claudePlanGenerator.js`.

## Kurzfazit

- **Der Code entscheidet heute schon fast alles Zahlenmäßige**: Wochenraster, Taper-Länge, Spitze, Wochen-km, Entlastungswochen, Long-Run-km, alle Einzel-km, Bausteine harter Einheiten, Rennwoche, Texte, Zonen, Wochenlabels.
- **Claude entscheidet die Wochenform**: an welchem Tag welcher Einheitentyp liegt, wie viele Läufe und harte Einheiten eine Woche hat, ob Wunsch-Ruhetage eingehalten werden, dazu Phasenanteile, Fokus-Text und einige Titel. Genau diese Wochenform muss ein deterministischer Kern selbst bauen. Alles danach (`enforcePlanInvariants` ab Schritt 5) rechnet ohnehin nur noch mit Typ und Datum.
- **`enforcePlanInvariants` hat rund 15 Korrekturschritte**, die meisten nur, um Claudes Wochenform zu reparieren (Schritte 1–4b, 5a, Teile von 6/7). Mit einer korrekt gebauten Wochenform ließe sich ein Großteil davon auf Prüfungen zurückführen.
- **Wiederverwendbar ohne Umbau**: `raceVolumeReference.js`, `weeklyVolumeProgression.js`, `buildVolumeContext` (inkl. `runDaysFromRules`, `weekCapacityKm`), `planSessionText.js` (Bausteine, Text, Zonen), `planLongRuns`, `distribute`, `checkPlanInvariants` als Prüfer, `rebuildPlanFromWorkouts`. Eine Trainings-Pace-Berechnung gibt es nicht.
- **Client-Kopie** (`src/lib/ai/coachPlanMutations.ts`, `generateMarathonPlanV2ToRace`) läuft live nur im Onboarding-„vereinfachten Plan“. Sie hat keine Invarianten: im Ad-hoc-Lauf 49 Verstöße gegenüber 0 im Server-Pfad (gleiches Profil, siehe 5.).
- **Vertrag zur App ist schmal**: `TrainingPlanV2` mit `workouts[]` + `weeks[].meta` (`types.ts`), dazu Konventionen, die nirgends getypt sind (Entlastung wird am `focus`-Text erkannt, Tempo-Bausteine stehen nur im `desc`, Format des `desc` für harte Einheiten). Abschnitt 6 listet sie.
- **Nebenbefunde** (nicht behoben): Schwimm-Einheiten werden beim Normalisieren zu `easy`. Bei Planstart mitten in der Woche verliert Woche 1 beim Normalisieren `focus` und `dates`. Die Chat-Aktion „Marathon-Plan erzeugen“ rechnet einen Entwurf, übernimmt ihn aber nie.

---

## 1. Datenfluss Onboarding → gespeicherter Plan

### 1a. Standardpfad „Option A“ (Claude, phasiert)

| # | Schritt | Datei:Zeile |
|---|---|---|
| 1 | Wizard „Fertig“ → `handleFinish`, baut `PlanGenerationProfile` (Distanz, Ziel, Zielzeit, Umfangsangabe, Renn-/Startdatum `TT.MM.JJJJ`, Dauer, freie Wünsche) | `src/components/Onboarding.tsx:432-471` |
| 2 | `fetchFullPlanFromClaude` → `POST {base}/api/onboarding/generate-plan-full` mit Bearer-Token, Client-Timeout 280 s. `base` fällt ohne `REACT_APP_AI_API_BASE` auf Vercel Production zurück | `src/lib/ai/claudePlanService.ts:156-225`, `:86-95` |
| 3 | Vercel-Handler: `guardRequest` (Token → `validatePlanBody` mit max. 52 Wochen → Quota-Bucket `plan_full`), Anthropic-Client | `api/onboarding/generate-plan-full.js:24-37`, `api/_lib/inputLimits.js:105-146` |
| 4 | Datum parsen, **Struktur-Aufruf** (Sonnet 4.6, `temperature: 0`, 30 s, ein Retry) → `{analysis, phases, sessionNames, rules}`; ohne Antwort `defaultStructureForWeeks` | `pf:295-311`, `cpg:172-276` |
| 5 | `computeWeekStartDates` (Woche 1 beginnt am Starttag, nicht am Montag → `weekKeyOverrides`) | `pf:306`, `det:637-671` |
| 6 | **`buildVolumeContext`**: Volumenreferenz → Taper-Wochen → Phasenplan → Spitze → Long-Run-Obergrenze je Woche → Kapazität der Lauftage → `computeVolumePlan` (Ziel-km, Entlastung, Hinweis `volumeNote`) | `pf:314-336`, `det:677-773` |
| 7 | Je Phase (base/build/peak/taper) und je Chunk von max. 6 Wochen: **Phasen-Aufruf** (Haiku 4.5, 90 s). Prompt enthält Ziel-km je Woche, Long-Run-Grenze, Regeln-JSON, freie Wünsche | `pf:369-510`, `pf:76-196`, `pf:266-288` |
| 8 | Antwort → `parseClaudeJson` → `normalizeWorkouts` (Datum aus `startIso`+`day`, sonst Label „28. Jun“ mit Jahresanker) | `pf:446-447`, `pwu:139-162` |
| 9 | Fehlschlag eines Chunks → Wochen aus dem deterministischen Plan (`generateMarathonPlanV2ToRace` serverseitig, läuft selbst schon durch `enforcePlanInvariants`), auf die Vorwoche skaliert | `pf:458-507`, `pwu:265-287` |
| 10 | `checkLongRunGuardrail` / `checkWeeklyVolumeGuardrail`: **nur Log** | `pf:198-238`, `pf:456-457` |
| 11 | **`enforcePlanInvariants`** über den ganzen Plan (Abschnitt 3), endet mit dem Text-Rendering je Einheit (`finalizeSession` → `renderSession`) | `pf:549-562`, `inv:480-836`, `inv:863-892`, `pst:135-187` |
| 12 | `checkPlanInvariants`: **nur Log** (Anzahl + Codes), der Plan geht auch mit Verstößen raus | `pf:563-577` |
| 13 | Wochen-Meta (`wn`, Phase, Label `Woche N · Phase`, Fokus bzw. Entlastungstext, `isRecoveryWeek`) → `rebuildPlanFromWorkouts` → `withPlanMeta` (`meta.volumeNote`) | `pf:579-593`, `pwu:164-218`, `det:936-938` |
| 14 | Antwort `{plan, diagnostics, totalDurationMs}`; der Client nutzt nur `plan` | `generate-plan-full.js:45` |
| 15 | Client: `normalizeTrainingPlan(data.plan)`, leer → Fehler | `claudePlanService.ts:206-213` |
| 16 | Onboarding: `validateTrainingPlanV2Integrity`. Fehler → Fehlermeldung, ggf. Angebot „vereinfachter Plan“ (1b). Erfolg → `onComplete(prefs, plan, [], planName)` | `Onboarding.tsx:474-492`, `:565` |
| 17 | `handleOnboardingComplete` → `runOnboardingCompletion`: erst remote (`saveTrainingPlan` → `insertNewTrainingPlan`), dann lokal | `src/AppMain.tsx:3574-3680`, `src/prepRecap/newPrepFlow.ts:90` |
| 18 | Remote: `training_plans` Insert mit `data = sanitizeTrainingPlanRemoteData(plan)` (= `normalizeTrainingPlan`), `schema_version`, `plan_slot`, `plan_name`, `is_active` | `src/lib/supabase/services/trainingPlanService.ts:8-10`, `:145-167` |
| 19 | Lokal: `localStorage[TRAINING_PLAN_V2_STORAGE_KEY]` = normalisierter Plan, `setTrainingPlanV2`, Patches/Logs zurückgesetzt | `AppMain.tsx:3613-3658` |
| 20 | Anzeige: `deriveDisplayPlan` → `normalizeTrainingPlan` → `toPlanWeeks` → `toAiPlanWeeks` → `applyPlanPatches` | `src/displayPlan/deriveDisplayPlan.ts:15-21`, `src/planV2/toPlanWeeks.ts:54-69` |

`normalizeTrainingPlan` läuft damit mindestens viermal auf demselben Plan (Schritte 15, 17, 18, 20) und beim App-Start (`repairPersistedStateOnBoot`).

### 1b. „Vereinfachter Plan“ (nur auf Klick nach einem Fehler von Option A)

`Onboarding.tsx:495-537`: `fetchClaudePlanStructure` → `POST /api/onboarding/generate-plan` (nur der Struktur-Aufruf, `api/onboarding/generate-plan.js:32`) → **Client-Kopie** `generateMarathonPlanV2ToRace` aus `coachPlanMutations.ts` mit `rules` und `phases`. Kein `buildVolumeContext`, kein `enforcePlanInvariants`, keine Bausteine. Danach weiter wie 1a ab Schritt 16.

### 1c. Nebenbefunde zum Ablauf

- **Lokal nicht testbar**: `server/index.js` hat keine Route `/api/onboarding/generate-plan*` (Roadmap-Folgepunkt (e)).
- **Doppelte Durchsetzung im Fallback**: Fallback-Wochen laufen zweimal durch `enforcePlanInvariants` (einmal im ganzen deterministischen Plan, einmal im Gesamtplan), dazwischen skaliert `scalePhaseWorkoutsForContinuity` um Faktor 0,55–1,45.
- **Ungenutzt**: `api/_lib/onboardingAiPlanRefinement.js` (kein Aufrufer), `generatePlanRulesWithClaude` (nur re-exportiert), `applyLongRunCapPerWeek`/`clampPostRaceSessionsToRest` (`pwu:363-414`, Roadmap (c)), `fetchClaudePlanRules`/`fetchClaudePlan` (deprecated).
- **Laufzeit**: 1 Sonnet-Aufruf + mindestens 4 Haiku-Aufrufe nacheinander; Vercel `maxDuration` 240 s.

---

## 2. Wer entscheidet was

| Aspekt | Claude | Code | Datei:Zeile |
|---|---|---|---|
| Wochenraster, Datum jeder Woche | – | ja | `det:637-671` |
| Taper-Länge, Peak-Woche | Phasenanteile werden überschrieben | ja: 1–3 Wochen nach Distanz/Planlänge, +1 bei kurzer Rennwoche; letzte Nicht-Taper-Woche = Peak | `wvp:30-44`, `wvp:60-82`, `det:691-697` |
| Anteile base/build/peak | ja (`phases[].weeks`, proportional auf die Planlänge gestreckt) | Mapping | `cpg:177-182`, `det:229-266` |
| Phasenname/Label | Label verworfen | `Woche N · Grundlage/Aufbau/Spitze/Taper` | `det:22-34`, `det:232` |
| Wochen-Fokus-Text | ja (`phases[].focus`) | Entlastungswochen: fester Text | `det:234`, `pf:588` |
| Entlastungswochen | – (`recoveryWeekEvery` ungenutzt) | jede 4. Woche, nicht in Peak/Peak−1/Taper/Woche des längsten Laufs, Faktor 0,72 | `wvp:5-6`, `wvp:164-167` |
| Spitzenumfang | – | Referenz der Zielzeit, gedeckelt auf Umfangs-Obergrenze × 1,2, mind. Start × 1,1 | `wvp:50-54`, `det:698-705` |
| Wochen-km | Prompt nennt die Ziele; `weeks[].totalKm` von Claude wird ignoriert | `computeVolumePlan`, danach Schritt 5a/7 | `wvp:121-207`, `pf:148-150`, `pwu:164-218` |
| Wochentags-Regeln (Ruhetage, Long-Run-/Intervall-/Tempo-Tag, Rad/Schwimmen/Kraft, max. Trainingstage) | ja (Struktur-Aufruf, aus Freitext-Wünschen) | nutzt sie für Kapazität (`runDaysFromRules`), `longRunDow` und als Sperre in Schritt 4b. **Erzwingt sie nicht** gegenüber Claudes Tagesplan | `cpg:192-203`, `det:121-136`, `pf:560-561`, `inv:964` |
| **Konkreter Tagesplan** (welcher Tag welcher Typ, Zahl der Läufe und harten Einheiten je Woche) | **ja** (Phasen-Aufruf) | korrigiert nachträglich: Rennende, Anfahrt, Rennwoche, genau ein Long Run, Vortag, keine zwei harten Tage, lockere Läufe → Ruhetag bei zu wenig Volumen | `pf:76-118`, `inv:485-629` |
| Einzel-km | Einfluss nur indirekt: welcher lockere Lauf zum Long Run wird (`_srcKm`), welcher von mehreren Long Runs bleibt, ob Claudes Titel bleibt (> 30 % Änderung) | alle km neu verteilt | `inv:384-392`, `inv:554`, `inv:865-867`, `inv:580-629` |
| Long-Run-km | – | `planLongRuns`: 65 % → Spitze (≥ 14/21 Tage vor dem Rennen), Entlastung × 0,8, danach 70 %/50 % | `inv:995-1093` |
| Bausteine harter Einheiten | Claudes `structured` nur, wenn gültig; Schritt 6 formt aber jede harte Einheit neu | `buildStructure` / `shapeHardSession` | `pst:75-108`, `inv:619-621`, `inv:875-877` |
| Titel | Tempo/Long/Easy: Claudes Titel, wenn `cleanTitle` ihn durchlässt; Rad/Kraft/Schwimmen, wenn ohne verbotene Begriffe | Intervall `N × X km Intervalle`, Rennen, Ruhetag, Entlastungs-Easy „Regenerationslauf“, Easy bei > 30 % km-Änderung | `pst:122-129`, `pst:139-187`, `inv:848-899`, `pf:37-42` |
| Beschreibung | nur Ruhetag und Rad/Kraft/Schwimmen (wenn sauber) | alle Läufe aus Typ, km, Bausteinen und Zone | `pst:135-187`, `inv:868-873` |
| Pace | nur ein Wert im Format `5:30–5:50` bleibt; der Prompt fragt nicht danach, praktisch `null` | keine Berechnung | `pst:203-206` |
| Zonen | – | fest je Typ, Entlastungs-Easy Zone 1 | `pst:21-34` |
| Renntag, Renntitel, Renn-km | – | letzter Tag, `raceKm` | `inv:502-505`, `pf:37-42` |
| Ungenutzt aus Claudes Antworten | `sessionNames`, `analysis`, `recoveryWeekEvery`, `weeklyKmMultiplier` (nur im Fallback-Rohplan, danach überschrieben), `phase` je Workout, `weeks[].label/totalKm` | | `det:540`, `pwu:191-196` |

Folge für den Umbau: Der Anteil, der Claude übrig bleibt und den ein deterministischer Kern ersetzen muss, ist **(a) die Wochenform** (Tage × Typen) und **(b) das Auslesen der Freitext-Wünsche in Tagesregeln**. (b) ließe sich als kleiner, prüfbarer Claude-Aufruf oder als Parser behalten (`parsePreferencesToRules`, `cpg:48-111`, existiert schon als Vorstufe).

---

## 3. Korrekturschritte in `enforcePlanInvariants` (`inv:480-836`)

Reihenfolge wie im Code. „Repariert Claude“ = Schritt wäre bei korrekt gebauter Wochenform eine reine Prüfung.

| Schritt | Zeilen | Zweck | Bekannte Nebenwirkungen | Repariert Claude? |
|---|---|---|---|---|
| 1 Lückenloser Tagesplan | 485-505 | Je Tag genau eine Einheit von Start bis Renntag (Priorität Rennen > Long > hart > easy > sonst > Ruhe), fehlende Tage = Ruhetag, letzter Tag = Rennen, frühere Rennen → easy | Zwei Einheiten an einem Tag (z. B. Kraft + Lauf) → nur eine bleibt; alles außerhalb des Fensters fällt weg | ja |
| 2 Anfahrt | 507-515 | Renntag −2/−1 nur locker oder frei (hart/long → easy, Rad/Kraft → Ruhe) | Ein Long Run an −1/−2 wird easy mit seinen km, Schritt 6 begrenzt dann über `approachCaps` | ja |
| 2b Rennwoche hart | 516-537 | In den 7 Tagen bis zum Rennen (nur Taper-Wochen) höchstens eine harte Einheit, frühestens Renntag −4/−3/−2 | Offen laut Roadmap: Rennen Do–Sa mit nur einer Taper-Woche, die Spitzenwoche reicht in die 7 Tage | ja |
| 3 Genau ein Long Run | 539-562 | Je Woche mit ≥ 5 Tagen außerhalb der Rennwoche genau einer; überzählige → easy (behält den längsten nach Claudes km); fehlender → längster lockerer, sonst harter Lauf, nah am `longRunDay` | Ein umgelabelter harter Lauf kostet die Qualitätseinheit; Long Run kann auf einen anderen Tag als den Wunschtag fallen | ja |
| 4 Vortag | 567-568, 910-940 | Keine harte Einheit am Vortag von Long Run/Rennen: Tausch mit lockerem Tag derselben Woche (−1, −2, −3, +2, +3), sonst → easy | Herabstufen kostet Qualität; Tausch verschiebt das Datum, die ID (`w5-sa`) passt dann nicht mehr zum Wochentag | ja |
| 4b Keine zwei harten Tage (I8) | 570-571, 948-981 | Zweite harte Einheit (oder die vor dem Rennen) wandert auf einen lockeren/freien Tag derselben Woche, nie auf Wunsch-Ruhetage (`restDows`), sonst → easy | Schützt nur Ruhetage, die Claude in `rules.restDays` übersetzt hat; ein freier Tag kann so zum Lauftag werden | ja |
| 5a Effektive Wochenziele | 573-575, 165-207 | Ziel ≤ was die tatsächlichen Läufe der Woche tragen; Aufbaukette nicht fallend, ggf. Rampe ab 93 %, +10 %-Grenze | Plan kann unter der angegebenen Umfangsangabe starten (Vorrangregel, Roadmap); Woche bleibt unter Ziel bei wenigen Läufen | teilweise (koppelt an Claudes Zahl der Läufe) |
| 5 Long-Run-Ziele | 577-578, 995-1093 | Verlauf (I2), Anteil 20 % bis `longRunCap` (I10), lang genug für das Wochenziel ohne Easy > 60 % (I9) | Komplexe Kopplung; I2 geht vor der 20-%-Untergrenze (freigegeben) | nein, Kernlogik |
| 6 Wochen-km verteilen | 580-629 | Long fix, Rest per `distribute` auf harte (Gewicht 1,15, 6–14/16 bzw. 20/24 km, Rennwoche ≤ 8) und lockere Läufe (4/5 km bis 0,45 × Ziel, ≤ 60 % Long, Anfahrt eigene Grenzen); harte Einheiten in Bausteine geformt, lockere gleichen Rundung aus | Bei zu wenig Volumen werden lockere Läufe zu Ruhetagen (ändert Claudes Wochenform); alle Claude-km überschrieben | nein, Kernlogik |
| 7 Abgleich nach Rundung | 631-668 | Bis 30 Runden: Long-Anteil 20 % … Obergrenze, danach Easy ≤ 60 % Long | Kürzt lockere Läufe → Woche unter Ziel | teilweise |
| 7b/7d/7e Verlauf halten | 670-756 | Bis 10 Durchgänge, nur kürzen: Long-Run-Verlauf (I2), Aufbauwoche nicht unter der Woche davor (I1, frühere Woche wird gekürzt), Anstieg ≤ 10 % | Kaskade: eine schwache Woche kürzt alle davor; Plan kann flacher enden als die Ziele | teilweise |
| 7c Entlastung/Taper | 758-787 | Entlastung ≤ 90 % der Vorwoche, volle Taper-Woche ≤ 90 % der Spitze, jede Taper-Woche unter der davor; danach erneut I2 | Kann Long Runs im Taper kürzen | teilweise |
| 7g Rennwoche ≤ 40 % | 789-823 | Lockere Läufe auf Minimum, harte Einheit bis 6 km, dann lockere Läufe streichen | Rennwoche kann fast nur aus Ruhetagen bestehen | nein |
| 7f I9 zum Schluss | 825-832 | Kein lockerer Lauf über 60 % des Long Runs | Kann Wochensumme senken, ohne dass 7d noch einmal läuft | nein |
| 8 Bausteine und Text | 834-835, 863-892 | km = Summe der Bausteine, Titel/Beschreibung/Zone aus Typ und Bausteinen, `intensity` gesetzt, Claudes Freitext verworfen | Tempo bekommt bewusst `structured: null` (Client würde Blöcke doppelt zählen, `pst:158-161`) | nein |

Allgemein: Die Schritte reparieren sich teils gegenseitig (7 → 7b/7d → 7c → 7b → 7g → 7f). Die Matrix-Tests (`src/__tests__/planInvariants.matrix.test.js`, 5 km–Marathon × 6–20 Wochen × Ziel × Renntag Mo–So × 7 Quellen inkl. Chaos-Claude) sind das Sicherheitsnetz dafür. `checkPlanInvariants` (`inv:1101-1354`, I1–I6, I8–I13) ist die maschinenlesbare Fassung der Regeln.

---

## 4. Wiederverwendbar für einen deterministischen Kern

| Baustein | Datei:Zeile | Was er liefert | Einschätzung |
|---|---|---|---|
| Volumenreferenz | `api/_lib/raceVolumeReference.js:4-105` | Tabelle je Distanz × Zielzeit: Spitze/Basis-km, längster Lauf, Einheiten/Woche, Qualitätsanteil; Zeit-Parser | direkt übernehmen. `sessionsPerWeek`/`qualityPercent` werden heute nur im Prompt genannt, nie im Code genutzt: Ausgangspunkt für die Wochenform |
| Volumenverlauf | `wvp:24-207` | Taper-Wochen, Spitze, Ziel-km je Woche, Entlastung, Rennwoche, `peakReached`/`peakLimit` | direkt übernehmen, getestet (`weeklyVolumeProgression.test.js`) |
| `buildVolumeContext` | `det:677-773` | Phasenplan mit festem Taper, Spitze, Long-Run-Obergrenze je Woche, Kapazität der Lauftage, `volumeNote` | übernehmen. Braucht `structurePhases` nur noch für Anteile/Fokus; ohne sie greift `defaultStructureForWeeks` (`det:956-981`) |
| `runDaysFromRules`, `weekCapacityKm`, `weekCarryKm` | `det:121-136`, `inv:113-157` | Lauftage und harte Tage aus Regeln; was eine Woche tragen kann | übernehmen. Gute Basis für die Wochenform: dieselben Regeln, die heute nur die Kapazität begrenzen, könnten die Tage direkt setzen |
| Phasenplan | `det:229-266`, `wvp:60-82`, `det:36-54` | Wochen → Phase, `weekInPhase`, Taper-Korrektur, Phasen-Normalisierung | übernehmen |
| Bausteine und Text | `pst:52-223` | `buildStructure`, `shapeHardSession`, `renderSession`, `zoneForSession`, `kmFromDesc`, `fmtKm`, `BANNED_TEXT`, `cleanPace` | direkt übernehmen. Textformat ist auf den Client-Parser abgestimmt (`src/sessionDistance.ts:153`) |
| Long-Run-Planung | `inv:995-1093` | Long-Run-Ziele mit I2/I10/I9 | übernehmen; braucht nur Indizes der Long Runs und Wochenziele |
| km-Verteilung | `inv:428-467` (`distribute`), `inv:340-377` | Wasserfüllung mit Min/Max, Grenzen je Einheitentyp | übernehmen |
| Kennzahlen je Distanz | `inv:306-334` | Anfahrt-Grenzen, Easy-Minimum, Grenzen harter Einheiten, Abstand Long Run/Rennen, Rennwochen-Abstand | übernehmen |
| Prüfer | `inv:1101-1354` | `checkPlanInvariants` | als Abnahme-Gate behalten, idealerweise blockierend statt nur Log |
| Plan-Aufbau | `pwu:164-218`, `det:936-938` | `rebuildPlanFromWorkouts`, `withPlanMeta` | übernehmen |
| Datum/Raster | `det:620-671`, `det:776-799`, `inv:210-221` | Onboarding-Datum, Wochenstarts, Tage je Woche, UTC-sichere Helfer | übernehmen; zwei Datumswelten (lokale `Date` in `det`, UTC-YMD in `inv`) bei der Gelegenheit vereinheitlichen |
| Wochenform heute | `det:321-354` (`phaseAwareSessionType`), `det:523-618` | Tag → Typ aus Regeln (`longRunDay`, `intervalDay`, `tempoDay`, Ruhe/Rad/Kraft/Schwimmen) | **Ausgangspunkt, nicht übernehmen wie er ist**: kennt keine harte Einheit je Phase, keine Rennwoche, kein `maxTrainingDaysPerWeek`; Titel/km/Texte darin sind Altlast (`Long Run W3`, Emojis) |
| Pace-Berechnung | – | – | **existiert nicht.** Pace kommt nur als Freitext von Claude (praktisch leer). Der Client parst `pace` als Bereich (`src/trainingIntelligence/sessionPlanTargets.ts:115-135`) und zeigt ihn an. Für Trainings-Paces müsste ein Kern sie neu berechnen (Ansatz: Riegel-Prognose in `src/marathonPrediction.ts`/`marathonForecast.ts`) |
| Puls-Zonen (Client) | `src/trainingIntelligence/hrZones.ts` | %HFmax-Bänder je Zone, Zone je Typ | bleibt im Client; Spiegel zu `pst:21-29` |
| Tests/Fixtures | `src/__tests__/planInvariants.*`, `planVolumeRegression`, `planAuditRegression10k`, `planSessionText`, `planLabelParity`; `src/testSupport/planMatrix.js`, `planSources.js`, `fixtures/livePlan*.json` | Matrix, Chaos-Quellen, Live-Pläne | als Regressionsnetz weiterverwenden; neue Quelle „deterministischer Kern“ in `SOURCES` eintragen |

---

## 5. Client-Kopie `src/lib/ai/coachPlanMutations.ts`

**Umfang**: Zeilen 381–1129 (~750 von 1129 Zeilen) sind eine TS-Kopie des älteren Server-Generators: `getRaceConfig`, `buildWeekPhaseSchedule`, `getPhaseVolumeMultiplier`, `getWeekVolumeWave`, `phaseAwareSessionType`, `buildSessionMeta`, `workoutForTrainingDay`, `generateMarathonPlanV2ToRace` (`:999-1129`). Die Zeilen 1–380 sind davon unabhängige Patch-Builder für den Coach (Verletzung, Rad entfernen, Volumen, Taper, verpasste Einheit) und `AiPlanRules`/`PlanPhaseSpec`-Typen (`:489-513`), die auch `claudePlanService.ts` und `applyOnboardingPreferencesPatches.ts` importieren.

**Was fehlt gegenüber dem Server**: `buildVolumeContext` (Taper, Spitze, Ziele, Entlastung), `enforcePlanInvariants`, Bausteine, Textregeln. Wochenlabel mit Claudes Freitext und `W{n} ⬇️` (`:1091-1099`), Titel wie `Long Run W3`, `Easy Run`.

**Ad-hoc-Vergleich** (Marathon, Zielzeit 3:45, 40–60 km, Start Mi 04.11.2026, Rennen So 07.03.2027, Standardregeln und -phasen; Skript außerhalb des Repos):

| | Server (`det`, gleicher Kern wie Fallback) | Client-Kopie |
|---|---|---|
| Verstöße `checkPlanInvariants` | 0 | 49 (I1, I2, I5, I10, I11, I13) |
| Wochen-km | 36 50 51 37 54 56 58 43 62 64 66 49 70 71 71 72 53 71 | 17 51 61 52 84 96 50 27 71 81 87 72 108 67 120 31 9 42 |

**Wo genutzt**:

| Aufrufer | Datei:Zeile | Wirkung |
|---|---|---|
| Onboarding „vereinfachter Plan“ | `src/components/Onboarding.tsx:24`, `:528-537` | **einziger Live-Pfad, der einen Plan speichert**. Nur nach Fehler von Option A und Klick des Nutzers |
| Coach-Chat „Marathon-Plan erstellen“ (deterministische Antwort) | `src/lib/ai/coachDeterministicResponses.ts:695-716` | rechnet einen Entwurf nur für Integritätscheck und Vorschau-Zahlen. Die Aktion `replace_training_plan_generated` hat keinen Patch-Builder (`src/lib/ai/actions.ts:241-264`), „Übernehmen“ endet in „Ich habe keine sichere Änderung gefunden“ (`actions.ts:359-365`). Der Plan wird nie ersetzt |
| `coachDataService.ts` | `src/lib/ai/coachDataService.ts:12` | nur Import, kein Aufruf |
| Tests | `coachPlanMutations.generate.test.ts`, `coachDeterministicResponses.test.ts:107` | |

Roadmap-Folgepunkt (d) plant einen TS-Spiegel mit Paritätstest. Mit einem deterministischen Kern auf dem Server wäre die einfachere Option: den vereinfachten Plan ebenfalls serverseitig aus dem Kern erzeugen (kein Claude nötig) und die Generator-Hälfte der Client-Datei löschen.

---

## 6. Vertrag: was die App vom Plan braucht (`training_plans.data`)

Tabelle `training_plans` (Migrationen 001, 003, 005, 012): `user_id`, `data jsonb NOT NULL`, `schema_version`, `plan_slot` (1–5, `null` = archiviert), `plan_name`, `is_active`, `archived_at`. `data` ist `TrainingPlanV2` nach `normalizeTrainingPlan` (`src/planV2/types.ts:47-53`).

### Pflicht (sonst leert `normalizeTrainingPlan` den Plan oder das Onboarding bricht ab)

| Feld | Regel | Prüfstelle |
|---|---|---|
| `version` | `2` | `validateTrainingPlanV2Integrity.ts:15` |
| `workouts[]` | nicht leer | `claudePlanService.ts:207`, `AppMain.tsx:3591` |
| `workouts[].id` | nicht leer, **im Plan eindeutig** (sonst `-dup-i` angehängt) | `validate…:36-47`, `normalizeTrainingPlan.ts:413-426` |
| `workouts[].dateIso` | parsebar; Konvention lokale Mittagszeit `YYYY-MM-DDT12:00:00.000Z`. Genau eine Einheit pro Tag von Start bis Renntag (heute so erzeugt, von der UI nicht erzwungen) | `validate…:49`, `normalizeTrainingPlan.ts:173-177` |
| `workouts[].sessionType` | einer von `rest, easy, interval, tempo, long, strength, bike, race`; alles andere wird `easy` | `src/lib/ai/mapSessionType.ts:3-30` |
| `workouts[].title` | String (leer → Standardtitel) | `validate…:61`, `normalizeTrainingPlan.ts:142-152` |
| `weeks[]` | wird beim Normalisieren aus `workouts` **neu gebaut** (Montag-Gruppierung, `totalKm` = Summe ohne `sport: "rest"`). Ein Kern muss `weeks` liefern, damit die Meta ankommt, die Zuordnung der Einheiten bestimmt aber der Client | `normalizeTrainingPlan.ts:565-566`, `src/core/deriveWeeksFromWorkouts.ts:37-81` |

### Gelesen und für unveränderte UI nötig

| Feld | Wofür | Datei |
|---|---|---|
| `workouts[].km` | Anzeige, Summen, Prognose, Adhärenz | `toPlanWeeks.ts:33`, `marathonPrediction.ts` |
| `workouts[].sport` | `rest` zählt nicht zu km; Rad/Lauf-Trennung, Validierungen | `deriveWeeksFromWorkouts.ts:63`, `src/ai/validation/*` |
| `workouts[].desc` | **trägt die Bausteine harter Einheiten**: Format `2 km WU · 6 × 1 km (90 s Pause) · 1.5 km CD. Zone 4–5.` bzw. `… · 8 km Tempo · …`, Dezimalpunkt statt Komma (Client trennt an Kommas) | `pst:139-163`, `src/sessionDistance.ts:153-280` |
| `workouts[].structured` | Intervall: `StructuredWorkoutSpec`; **Tempo: `null`** (sonst zählt der Client den Tempoblock doppelt) | `pst:158-161`, `sessionDistance.ts:140-151` |
| `workouts[].pace` | optional, nur als Bereich `m:ss–m:ss` auswertbar | `sessionPlanTargets.ts:115-135` |
| `workouts[].intensity` | optional, sonst aus Typ abgeleitet; genutzt in Analyse/Validierung | `normalizeTrainingPlan.ts:33-42` |
| `weeks[].startIso` | `YYYY-MM-DD`, Schlüssel für die Meta-Zuordnung (siehe Fallen) | `validate…:84`, `normalizeTrainingPlan.ts:444-448` |
| `weeks[].meta.wn`, `.phase`, `.label`, `.dates` | Wochenliste, Phasenfarbe, Rückblick-Slides | `toPlanWeeks.ts:40-67`, `src/planV2/trainingPhase.ts` |
| `weeks[].meta.focus` | Anzeige **und Entlastungserkennung**: die UI erkennt eine Entlastungswoche am Text „entlastung“/„recovery“ im `focus` (für Zone 1 bei lockeren Läufen), nicht am Flag | `src/trainingIntelligence/sessionPlanTargets.ts:137-141` |
| `weeks[].meta.isRecoveryWeek` | wird gespeichert, aber von `toPlanWeeks` nicht weitergereicht; die UI liest es nicht | `normalizeTrainingPlan.ts:217-225`, `toPlanWeeks.ts:40-67` |
| `meta.volumeNote` | optional (`code`, `reason`, `targetPeakKm`, `reachedPeakKm`); geprüft durchgereicht, noch keine Anzeige | `types.ts:35-45`, `normalizeTrainingPlan.ts:525-549` |
| letzte Einheit `sessionType: "race"` | Zielrennen für Plan-Ende, Rückblick, Coach-Kontext | Roadmap „Prep-Rückblick“, `getPrepCompletionState` |
| Typen `long`, `interval`, `tempo`, `race`, `easy` | Statistiken im Rückblick (Long Runs, Qualität), Kalender-Capacity (`tempo/interval/race/long` = hohe Intensität), Zonen | `src/scheduling/capacityScore.ts`, `src/components/prepRecap/buildRecapSlides.ts` |

### Fallen für einen neuen Kern

1. **Planstart mitten in der Woche**: Der Server setzt `weeks[0].startIso` auf den Starttag (`det:648-652`), der Client gruppiert beim Normalisieren nach Montag. Dadurch findet die Meta-Zuordnung Woche 1 nicht: `focus` und `dates` fehlen, `phase` fällt auf `base` zurück (im Ad-hoc-Lauf bestätigt). Ein Kern sollte `startIso` = Montag liefern oder der Normalisierer `weekKeyOverrides` kennen.
2. **Schwimmen**: `swim` fehlt in `mapSessionType` und wird `easy` (im Ad-hoc-Lauf bestätigt). Bis das behoben ist, kein `swim` als `sessionType` ausgeben.
3. **IDs**: Claude vergibt `w5-mo`; nach einem Tausch in Schritt 4/4b passt der Wochentag nicht mehr zur ID. IDs kollidieren zwischen Plänen, die Roadmap nennt das als Ursache der Log-Zuordnungs-Heuristik. Ein Kern sollte plan-eindeutige IDs erzeugen (z. B. Datum + Typ + Plan-Kennung). Sitzungs-Logs und Patches hängen an `id`.
4. **`sport` bei Kraft/Schwimmen** ist uneinheitlich (`det`: `rest`, Claude-Pfad: `strength`/`swim`). `rest` hält sie aus den km heraus, beides wird akzeptiert.
5. **Zusätzliche Felder** (z. B. `phase` je Workout, `_srcKm`) verwirft `normalizeWorkout` (`normalizeTrainingPlan.ts:185-196`). Neue Felder brauchen eine Erweiterung von `types.ts` und Normalisierer.
6. **`totalKm`-Toleranz** im Integritätscheck ist 0,0001. Unkritisch, weil der Client `weeks` neu berechnet, aber ein Kern sollte keine eigenen gerundeten Summen gegen den Check stellen.

Damit kann ein neuer Kern ohne UI-Änderung eingesetzt werden, wenn er `{ version: 2, workouts, weeks, meta? }` mit den Pflichtfeldern liefert, das `desc`-Format der Bausteine aus `planSessionText.js` verwendet, Entlastungswochen mit dem bestehenden `RECOVERY_WEEK_FOCUS`-Text markiert und mit genau einem `race` am letzten Tag endet.

---

## 7. Offene Fragen für den Umbau

1. **Wunsch-Freitext**: Behält Claude die Übersetzung der Wünsche in `rules` (ein kleiner Aufruf, Ergebnis prüfbar), oder wird ein Parser daraus (`parsePreferencesToRules` als Vorstufe)?
2. **Wochenform-Regeln**: Wie viele harte Einheiten je Phase und Distanz (heute faktisch Claude)? `qualityPercent`/`sessionsPerWeek` aus der Referenztabelle als Quelle?
3. **Titelvielfalt**: Heute bringt nur Claude abwechslungsreiche Titel (`cleanTitle`). Fester Katalog je Typ und Phase, oder bewusst schlichte Titel?
4. **Pace**: Trainings-Paces neu einführen (Zielzeit → Zonen-Paces) oder weiter nur Puls-Zonen?
5. **Rolle von `checkPlanInvariants`**: Blockierend machen, sobald der Kern deterministisch ist (Plan mit Verstoß = Fehler statt Log)?
6. **Ort des Kerns**: nur Server (Client-Kopie löschen, vereinfachter Plan per Server) oder geteiltes Modul mit Paritätstest wie `legacyYearAnchor`?
