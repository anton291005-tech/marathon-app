# Diagnose: 18 vorbestehende Test-Failures

**Task-Typ:** Diagnose only — kein Produktivcode geändert.
**Befehl:** `CI=true npm test` (react-scripts / Jest, single non-interactive run)
**Ergebnis:** `Test Suites: 8 failed, 72 passed, 80 total` / `Tests: 18 failed, 483 passed, 501 total`

Kategorien:
- **(a) Echter Bug** im Produktivcode
- **(b) Veralteter/falscher Test** (Test passt nicht mehr zur aktuellen API/Architektur)
- **(c) Testumgebungs-Macke** (Flakiness, Mocking-Problem, Timing, o.ä.)

Alle 18 Failures sind deterministisch (Zeit ist überall über `now`/frozen dates fixiert) — es wurde
**keine Kategorie-(c)-Ursache gefunden**. Die Failures clustern auf 6 tatsächliche Ursachen in 8 Dateien.

---

## Cluster 1 — Recovery-Fallback-Pfade nie verdrahtet (5 Tests)

**Datei:** `src/recovery/recoveryPipeline.integration.test.ts`
**Tests:**
- `valid same-day inputs → numeric score shown consistently on Home + Leistung view-models`
- `same-day missing but >=3 valid days in last 7 → fallback7d score is used and shown`
- `fallback7d still works when activeEnergyKcal is missing (load defaults to 0 completed sessions)`
- `precedence: same-day inputs win even when snapshot/input versions are missing (cache/hydration edge)`
- `missing physio inputs today → both cards still show a numeric load-only score`

**Fehlermeldung (Beispiel):**
```
expect(received).toBe(expected)
Expected: "fallback7d"
Received: null
```
bzw. `expect(received).not.toBeNull()` → `Received: null`.

**Root Cause:** `src/recovery/recoveryDomainState.ts` → `getRecoveryDomainState()` hat einen harten Gate
(`computeHasMinData`, Zeile ~231–256: braucht 5+ erledigte Sessions ODER 5+ Health-Tage in 14 Tagen).
Wird das Gate nicht erfüllt, gibt die Funktion sofort `buildInitialRecoveryDomainState()` zurück —
`homeRecoveryScore0_100: null`, `homeRecoveryScoreSource: null`.

Der Typ `homeRecoveryScoreSource: "live" | "fallback7d" | "loadOnly" | null` (Zeile 65) verspricht drei
belegbare Score-Quellen, aber im gesamten File wird der Wert **nur** auf `"live"` (Zeile 567) oder
`null` gesetzt — nie auf `"fallback7d"` oder `"loadOnly"`.

Bestätigung: `src/recovery/recoveryFallback7d.ts` (`computeRecoveryFallback7d`) und
`src/recovery/loadOnlyHomeRecoveryScore.ts` (`computeLoadOnlyHomeRecoveryScore0_100`) sind vollständig
implementiert und exportiert — aber **keine Datei im Produktivcode importiert sie** (`grep -rl` liefert
nur die Export-Zeilen selbst).

**Einschätzung: (a) Echter Bug.** Zwei fertige Scoring-Pfade (7-Tage-Fallback, Load-only-Score) existieren,
sind aber nie an die Domain-State-Pipeline angeschlossen. Nutzer mit lückenhaften Health-Daten (der
Normalfall in den ersten Trainingswochen) sehen `null`/„Wird ermittelt“ statt eines Fallback-Scores —
genau das Szenario, das die Tests und die Typ-Deklaration beschreiben.

---

## Cluster 2 — `source`/`pointConfidence` nie befüllt (3 Tests)

**Datei:** `src/recovery/recoveryConfidenceLayer.test.ts`
**Tests:**
- `physio series has high confidence and source=physio`
- `load-only series has capped confidence and source=load_only`
- `mixed series contains both sources`

**Fehlermeldung (Beispiel):**
```
expect(last7.every((d) => d.source === "physio")).toBe(true)
Expected: true
Received: false
```

**Root Cause:** `DailyRecoveryComputed.source` und `.pointConfidence` (`src/recovery/recoveryTypes.ts:95-96`,
kommentiert als „Optional legacy slice for AI recovery summary weighting“) werden in
`computeDailyRecoverySeries()` (`src/recovery/recoveryScoringEngine.ts`, Objekt-Konstruktion Zeile
497–521) **nie gesetzt** — die Felder bleiben immer `undefined`. Stattdessen wird pro Tag nur
`recoveryConfidence: RecoveryConfidenceModel` (mit `.overallConfidence`) berechnet.

Der einzige Konsument, `src/lib/ai/recoverySummary.ts` (`pointSource`, Zeile 66:
`p.source ?? "physio"`; `pointConfidence`, Zeile 62–65: Fallback auf `recoveryConfidence.overallConfidence
?? 0.5`), fängt das Fehlen der Felder ab — dadurch crasht nichts in Produktion, aber die
Physio-vs-Load-only-Unterscheidung ist **faktisch tot**: `source` ist wegen des Fallbacks immer effektiv
`"physio"`, `dominantSourceByTotalConfidence` kann `"load_only"` nie zurückgeben.

**Einschätzung: (a) Echter Bug (unvollständiges Feature), abgemildert durch defensive Fallbacks.**
Kein Crash-Risiko in Produktion, aber die AI-Gewichtung nach Datenquelle (physiologisch vs.
lastbasiert) funktioniert nicht wie im Typ-Kommentar und in `recoverySummary.ts`s
"Safety rules" dokumentiert. Hängt mit Cluster 1 zusammen (gleiches unfertiges Confidence-Feature).

---

## Cluster 3 — Test ruft veraltete Funktionssignatur (2 Tests)

**Datei:** `src/recovery/homeRecoveryScore.test.ts`
**Tests:**
- `computeHomeRecoveryScore delegates to inputs only`
- `breakdown score matches computeHomeRecoveryScore`

**Fehlermeldung:**
```
TypeError: Cannot read properties of undefined (reading 'map')
at computeHomeRecoveryScoreInternal (src/recovery/homeRecoveryScore.ts:247:38)
  const byDate = new Map(args.series.map((s) => [s.date, s]));
```

**Root Cause:** Der Test ruft
```ts
computeHomeRecoveryScore({ todayYmd: "2026-04-20", inputs: { sleepHours: 7, hrvMs: null, ... } })
```
auf. Die tatsächliche Signatur von `computeHomeRecoveryScore` (und `computeHomeRecoveryScoreBreakdown`)
in `src/recovery/homeRecoveryScore.ts:356-371` ist aber
```ts
{ series: DailyRecoveryComputed[]; plan: PlanWeek[]; logs: Record<string, SessionLog>; now?; ... }
```
— `todayYmd`/`inputs` existieren dort gar nicht. `args.series` ist folglich `undefined`, `.map()` wirft.
Es gibt in dieser Datei nur eine stateless "from inputs only"-Funktion:
`computeHomeRecoveryScoreFromInputs(inputs: HomeRecoveryInputs): number | null` (Zeile 441) — die exakt
das tut, was der Test von `computeHomeRecoveryScore` erwartet, aber unter anderem Namen und ohne
`todayYmd`. Der Doc-Kommentar über `computeHomeRecoveryScore` („Same inputs/outputs as before; delegates
to shared implementation“, Zeile 355) deutet auf einen Refactor hin, bei dem die alte
Input-only-Signatur durch die Serien-basierte Signatur ersetzt wurde — der Test wurde dabei nicht
nachgezogen.

**Einschätzung: (b) Veralteter/falscher Test.** Die Produktivfunktion tut nichts Falsches — sie hat schlicht
eine andere Signatur als der Test annimmt. `computeHomeRecoveryScoreFromInputs` (bereits an anderer
Stelle in derselben Testdatei korrekt getestet, Zeilen 4-29) deckt das eigentlich gewünschte Verhalten
bereits ab.

---

## Cluster 4 — Adherence-Score: zwei Rechenfehler (4 Tests)

**Dateien:**
- `src/coach/adherenceScore.test.ts` → `returns 100 when no sessions are due yet (all plan dates after today)`
- `src/lib/training/progressCalculation.test.ts` → `TEST 4`, `TEST 5`, `TEST 6`

**Root Cause 1 (betrifft `adherenceScore.test.ts` + `TEST 6`):**
`computePlanAdherenceScoreFromHistory()` in `src/coach/adherenceScore.ts:111-146`:
```ts
const plannedSessions = history.filter((s) => s.planned);
if (plannedSessions.length === 0) {
  return { score: 0, confidence: 0 };
}
```
Wenn noch keine Session fällig ist (Tag 1 eines Plans, alle Termine in der Zukunft), liefert das
`score: 0` → `band: "red"`. Beide Tests erwarten `score: 100` / `band: "green"` für diesen Fall — ein
Nutzer, der gerade erst startet, sieht sonst einen roten „0%"-Adherence-Score, obwohl noch gar nichts
verpasst werden konnte.

**Root Cause 2 (betrifft `TEST 4` + `TEST 5`):**
In derselben Funktion, Zeilen 123-138:
```ts
const volumeAdherence = average(plannedSessions.map((s) => {
  if (!s.completed) return 0;
  const pd = s.plannedDistance; const ad = s.actualDistance;
  if (!pd || !ad) return 0.5;   // <-- "unbekannt" wird nur halb gutgeschrieben
  return Math.min(ad / pd, 1);
}));
// intensityAdherence: analog, 0.5 wenn plannedIntensity !== actualIntensity
```
Ist eine Session als `done` markiert, aber ohne explizit geloggte Distanz/Intensität (Normalfall, wenn
ein Nutzer nur "erledigt" antippt), wird `volumeAdherence`/teils `intensityAdherence` künstlich auf `0.5`
statt `1` gesetzt. Ergebnis: 5/5 erledigte Sessions ergeben `score: 85` statt `100`
(`raw = 1*0.5 + 0.5*0.3 + 1*0.2 = 0.85`); 3/5 erledigte ergeben `51` statt `60`
(`raw = 0.6*0.5 + 0.3*0.3 + 0.6*0.2 = 0.51`). Rechnet man testkonform mit vollem Vertrauen bei
`completed && !ad` (Wert `1` statt `0.5`), ergeben sich exakt `100` bzw. `60` — die von den Tests
erwarteten Werte.

**Einschätzung: (a) Echte Bugs**, beide im selben Function-Body, beide zeigen dem Nutzer einen zu
niedrigen Adherence-/Fortschritts-Score an. Root Cause 1 ist ein Edge-Case (Tag 1), Root Cause 2 betrifft
den Normalfall (Session ohne Distanz-Log als "erledigt" markiert) und dürfte in der Praxis fast jeden
Nutzer betreffen, der nicht laufend GPS-Distanzen an jede Session anhängt.

---

## Cluster 5 — Apple-Health-Laps nicht normalisiert (2 Tests)

**Datei:** `src/appleHealth/appleHealthWorkoutSync.test.ts`
**Tests:**
- `workoutToStored maps plugin laps array onto StoredHealthRun.laps`
- `workoutToStored maps workoutEvents type lap onto StoredHealthRun.laps`

**Fehlermeldung (Beispiel):**
```
expect(s.laps![1].durationSeconds).toBe(280)
Expected: 280
Received: undefined
```
und
```
expect(s.laps).toHaveLength(2)
Matcher error: received value must have a length property whose value must be a number
Received has value: undefined
```

**Root Cause:** `workoutToStored()` in `src/healthRuns.ts:215`:
```ts
...(workout.laps != null ? { laps: workout.laps as HealthRunLap[] } : {}),
```
— das Roh-`laps`-Array wird 1:1 durchgereicht, ohne Key-Aliase zu normalisieren. Testfall 1 liefert einen
Lap mit `{ distance: 1000, duration: 280 }` (Kurzform, wie sie das Capacitor-Health-Plugin teils liefert)
statt `{ distanceMeters, durationSeconds }` — das Feld heißt im Ergebnis weiterhin `duration`, nicht
`durationSeconds`, daher `undefined`.

Für `workoutEvents` (Zeile 219-221) wird das Rohfeld nur unverändert unter `workoutEvents` gespeichert —
es gibt **keinerlei Logik**, die `type === "lap"`-Events in `StoredHealthRun.laps` überführt. Testfall 2
erwartet genau diese Ableitung; `s.laps` bleibt komplett `undefined`.

**Einschätzung: (a) Echter Bug / fehlende Normalisierung.** Je nachdem, welches Plugin-Format ein
iOS-Gerät tatsächlich liefert (`laps`-Array mit Kurz-Keys vs. `workoutEvents`), gehen Lap-Daten
(Zwischenzeiten, Pace-Splits) verloren oder werden mit falschen/fehlenden Werten gespeichert.

---

## Cluster 6 — KI-Unsicherheitssprache nie implementiert (1 Test)

**Datei:** `src/lib/ai/aiUncertaintyLanguage.test.ts`
**Test:** `low-confidence recovery triggers cautious wording in fatigue advice`

**Fehlermeldung:**
```
Expected pattern: /confidence|gering|vorsichtig/
Received string:  "du gewinnst heute nichts mit einer harten einheit auf mueden beinen. ..."
```

**Root Cause:** Der Test baut einen `RecoveryDomainState` mit `homeRecoveryScoreSource: "loadOnly"` (also
niedriger Konfidenz) und erwartet, dass `buildMockAiResponse()` daraufhin vorsichtige Formulierungen
("gering"/"vorsichtig"/"confidence") in die Fatigue-Antwort einstreut.

`src/lib/ai/mockBrain.ts` → `detectRiskSignals()`/`buildRiskCoachMessage()` (Zeilen 200-240) erkennen
„müde“ ausschließlich über Keyword-Matching im Nutzertext (`fatigueByWords`) bzw. über
`load.avgFeeling` — `context.recoveryDomain` und `context.recoverySummary` werden in der gesamten Datei
**kein einziges Mal gelesen** (`grep` auf `recoverySummary|recoveryDomain|avgConfidence` liefert keine
Treffer). Die Antworttexte in `buildRiskCoachMessage` sind fest hinterlegte Varianten ohne
Confidence-Anteil.

**Einschätzung: (a) Echter Bug / nicht gebautes Feature.** Wie vom Nutzer als bekannt vorausgesetzt: Die
Verbindung "niedrige Recovery-Konfidenz → vorsichtigere KI-Sprache" existiert im Code schlicht nicht.
Hängt mit Cluster 1+2 zusammen — die Recovery-Confidence-Daten, die hier verwendet werden müssten, sind
ohnehin nur unvollständig durch die Pipeline verdrahtet.

---

## Cluster 7 — `replace_workout`-Action nie an Patch-Builder angeschlossen (1 Test)

**Datei:** `src/ai/intents/replaceWorkoutIntent.test.ts`
**Test:** `resolveReplaceWorkoutProposal builds bike→easy patch payload`

**Fehlermeldung:**
```
expect(exec.planPatches?.length).toBe(1)
Expected: 1
Received: undefined
```

**Root Cause:** `resolveReplaceWorkoutProposal(...)` liefert korrekt eine Proposal (die vorherigen
Assertions im selben Test — `res.status === "ok"`, `previewAfter.type === "easy"`, `previewAfter.km ===
10`, `action.type === "replace_workout"` — schlagen alle **nicht** fehl). Der Bruch passiert erst beim
Ausführen: `executeAiAction()` → `resolveActionPatches()` in `src/lib/ai/actions.ts:215-237` hat eine
explizite `if (action.type === ...)`-Kette für `adjust_plan_for_illness`, `replace_bike_with_run`,
`shift_race_date`, `shift_plan_start_date`, `convert_workout_to_run`, `adapt_plan_injury_no_run`,
`remove_all_bike_sessions`, `boost_next_week_volume`, `taper_before_race`, `integrate_missed_workout` —
**aber keinen Case für `"replace_workout"`**. Die Funktion fällt auf `return []` durch;
`executeAiAction()` (Zeile 332-338) gibt dann `{ mode: "coach", message: "Ich habe keine sichere
Aenderung gefunden..." }` **ohne `planPatches`-Feld** zurück.

**Einschätzung: (a) Echter Bug, potenziell hohe Priorität.** Laut `CLAUDE.md` ist der komplette
AI-Mutation-Flow proposal-only und muss über genau diesen Patch-Pfad bestätigt werden. Ein Nutzer, der
im Chat eine Workout-Ersetzung vorschlägt und bestätigt, bekäme in der App vermutlich die
"keine sichere Änderung gefunden"-Meldung, obwohl die Vorschau (`previewAfter`) korrekt zeigt, was
passieren sollte — die Aktion wird aber nie tatsächlich angewendet.

---

## Zusammenfassung nach Kategorie

| Kategorie | Tests | Cluster |
|---|---|---|
| (a) Echter Bug | 15 | 1 (5), 2 (3), 4 (4), 5 (2), 6 (1) |
| (a) Echter Bug, hohe Nutzer-Sichtbarkeit | +1 | 7 (1) — im Zähler oben enthalten |
| (b) Veralteter/falscher Test | 2 | 3 (2) |
| (c) Testumgebungs-Macke | 0 | — |

18 Tests gesamt (5+3+4+2+1+1+2 = 18 ✓).

---

## Empfehlung: 2–3 Failures zuerst fixen (niedrigstes Risiko)

1. **Cluster 3 — `homeRecoveryScore.test.ts` (2 Tests).**
   Reiner Test-Fix, kein Produktivcode betroffen: Test auf `computeHomeRecoveryScoreFromInputs(inputs)`
   umstellen (die Funktion existiert bereits, tut exakt das Erwartete, und wird in derselben Datei
   schon korrekt getestet). Null Risiko für Produktivverhalten.

2. **Cluster 4, Root Cause 1 — "0 fällige Sessions → Score 0" (`src/coach/adherenceScore.ts`,
   `computePlanAdherenceScoreFromHistory`, 2 Tests auf einen Schlag: `adherenceScore.test.ts` +
   `progressCalculation.test.ts TEST 6`).**
   Ein Early-Return für `plannedSessions.length === 0` von `{score: 0, confidence: 0}` auf
   `{score: 100, confidence: 0}` ändern. Isolierte, lokal begrenzte Änderung in einer reinen Funktion,
   die bereits von einer Test-Suite mit mehreren Fällen abgedeckt ist (Regressionsschutz vorhanden).

3. **Cluster 4, Root Cause 2 — Volume-/Intensity-Default `0.5` → `1` bei fehlender
   Distanz-/Intensitäts-Angabe (gleiche Funktion, fixt `TEST 4` + `TEST 5`).**
   Etwas mehr Ermessensspielraum als #2 (ändert eine Gewichtungs-Formel, nicht nur einen Edge-Case),
   aber gleiche Datei/Funktion, gleiche bestehende Testabdeckung, kein Einfluss auf andere Subsysteme
   (Recovery, AI, Apple Health bleiben unberührt). Sinnvoll direkt im selben Zug wie #2 zu beheben, da
   beide im selben Function-Body liegen.

**Bewusst zurückgestellt:** Cluster 1/2/6 hängen an derselben unfertigen Recovery-Confidence-Funktionalität
und sollten als zusammenhängendes Feature-Stück behandelt werden (nicht einzeln gepatcht); Cluster 5
(Health-Laps) und Cluster 7 (`replace_workout`) sind isoliert, aber jeweils eigenständige
Implementierungsarbeit (neue Normalisierungslogik bzw. neuer Patch-Builder) mit größerem Diff als die
beiden oben genannten Ein-/Zwei-Zeilen-Fixes.
