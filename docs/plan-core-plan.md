# Umbauplan: deterministischer Plan-Kern

Stand: 2026-11-04 (v2), Basis `main` @ `c1f4711`. Grundlage: `docs/plan-spec.md` (v0.3), `docs/plan-architecture-inventory.md`, `docs/plan-spec-gap.md`.
Reiner Plan, keine Code-Änderung. Zeilenangaben beziehen sich auf `main` @ `c1f4711`.

## Änderungen v2 (2026-11-04, nach Review)

1. **Freigegeben:** Server verweigert den Plan bei Regelverstoß (Codes loggen, im UI verständliche Meldung + lokaler vereinfachter Plan als Angebot). Chat-Aktion „Marathon-Plan erzeugen“ wird entfernt. Standard-E-Pace 7:00/km im Einsteiger-Modus (Herkunft `E`, Spoho-Review-Punkt). Eigener Zufallsgenerator statt `fast-check`. Bestandsnutzer werden nur beim nächsten Erstellen gefragt.
2. **Schritt 8 (Claude → `PlanRules`) ist nicht mehr MVP.** Freitext wird wie heute gespeichert und nur vom Coach gelesen. Die Planerzeugung läuft im MVP **ohne Claude**: `buildPlan(inputs, EMPTY_RULES, todayYmd)`.
3. **Shadow-Betrieb 2–3 Tage** statt einer Woche. Schalter `off/shadow/on` bleibt als Rückweg.
4. **Schritt 0 ist nicht mehr MVP** (Begründung dort).
5. **Schritt 1 beginnt mit einem Vercel-Test:** Kann `api/*.ts` direkt gebaut werden und `src/planCore` importieren? Beide Varianten sind unten beschrieben, die Entscheidung fällt im Schritt.
6. **Abbildungstabelle** der Kern-Arten auf die 8 App-Typen mit allen betroffenen Stellen (Datei:Zeile). Daraus zwei neue kleine MVP-Punkte: Zonen nach `kind` (in Schritt 3) und der 28-km-Hinweis im Coach-Feedback (in Schritt 11).

## Leitplanken

- **Ein TS-Modul** `src/planCore/**`: keine Imports von React, Node, Supabase oder aus anderen `src/`-Ordnern; keine Uhr (`todayYmd` ist Eingabe). Server und App nutzen denselben Code.
- **Output** `TrainingPlanV2` (`src/planV2/types.ts:47-53`). `AiPlanWeek` bleibt die abgeleitete Anzeige (`src/displayPlan/deriveDisplayPlan.ts:15-21`).
- **Alle Spec-Zahlen in `src/planCore/config.ts`**, jede mit Herkunft (`L`/`P`/`E`) und Spec-Abschnitt. Das Spoho-Review ändert nur diese Datei (plus die erwarteten Snapshots).
- **Invarianten I1–I22** als Funktion im Kern (`checkCorePlan`) und als Tests. Dazu Property-Tests über zufällige gültige Eingaben und Snapshot-Tests der Referenzprofile P1–P6.
- **Claude** ist im MVP nicht an der Planerzeugung beteiligt. Freitext → `PlanRules` (§10) folgt später (Schritt 8).
- **Production wird nie schlechter:** Bis zum Umschalten ist der Kern nicht verdrahtet. Danach läuft er hinter einem Schalter (`PLAN_CORE_MODE=off|shadow|on`, Standard `off`). Der heutige Pfad bleibt bis zum Cutover unverändert.
- **Jeder Schritt:** `CI=true npm test` grün, `CI=false npm run build` grün, eigener Branch von `main`, Merge nur mit Freigabe.

## Architekturentscheidung: wie der JS-Server das TS-Modul nutzt

Die Vercel-Funktionen sind CommonJS-JS (`api/onboarding/generate-plan-full.js`, `require(...)`). Die `tsconfig.json` ist auf CRA ausgelegt (`module: esnext`, `noEmit`, nur `src`).

**Entscheidung (Schritt 1, 2026-11-04): Variante A, mit eigener `api/tsconfig.json`.** Variante B wird nicht gebaut; ihre Beschreibung bleibt als Rückfall stehen. Ergebnis des Tests siehe unten. Die zwei Varianten:

**Variante A – Vercel baut TS direkt (bevorzugt, falls der Test besteht):** Eine Funktion `api/onboarding/generate-plan-core.ts` (oder `generate-plan-full` wird zu `.ts`) importiert `../../src/planCore` direkt. Vercel bündelt den Import. Dann entfallen Übersetzungsskript, eingecheckter JS-Code, Drift- und Paritätstest. Offene Punkte, die der Test klären muss: verträgt sich der Vercel-Build mit der CRA-`tsconfig` (`noEmit`, `module: esnext`, `isolatedModules`) – ggf. eigene `api/tsconfig.json`; kann `server/index.js` lokal dieselbe Datei laden (z. B. über `tsx`/`ts-node` nur für den lokalen Server, oder der lokale Server bindet die Route gar nicht ein, solange Schritt 0 aufgeschoben ist).

**Variante B – übersetzt und eingecheckt (Rückfall):** Der Kern wird per `typescript.transpileModule` (ist als Abhängigkeit schon da) nach `api/_lib/planCore/*.js` (CommonJS) übersetzt. Das Ergebnis wird **eingecheckt**.
- Skript `scripts/buildPlanCore.js`, Aufruf `npm run build:plan-core`.
- Ein Jest-Drift-Test übersetzt jede Kern-Datei erneut und vergleicht mit dem eingecheckten Stand. Weicht er ab, ist der Test rot.
- Ein Paritätstest lässt P1–P6 und die Property-Fälle durch TS und JS laufen und verlangt identische Pläne.

Warum eingecheckt: Es ist nicht gesichert, ob Vercel Dateien, die erst im Build-Kommando entstehen, in die Funktionen übernimmt. Mit eingecheckten Dateien gibt es diese Unsicherheit nicht, und `server/index.js` kann sie lokal genauso laden. Bewährtes Muster im Repo: `legacyYearAnchor` mit `legacyYearAnchorParity.test.js`, `planLabelParity.test.js`.

Verworfen:
- **Zwei Implementierungen mit Paritätstest:** widerspricht der Vorgabe „ein Modul“.

Variante A wurde in v1 wegen der CRA-`tsconfig` und des lokalen Loaders verworfen. Beides war lösbar und nicht ausgetestet; deshalb der Test in Schritt 1 statt einer Vorabentscheidung.

### Ergebnis des Einbindungstests (Schritt 1, 2026-11-04)

**Aufbau:** Probe-Funktion `api/plan-core-probe.ts` auf einem lokalen Wegwerf-Branch (nie gepusht). Sie importiert die echten Kern-Dateien (`types`, `config`, `dates`, `random`, `index`) und den CommonJS-Helfer `api/_lib/cors.js`. Preview per `vercel deploy` aus einem sauberen Git-Worktree, ohne Push; Deployment Protection blieb an, der Aufruf lief im eingeloggten Browser. Die erwartete Antwort wurde vorher lokal berechnet.

| Lauf | `tsconfig` für `api/` | Ergebnis |
|---|---|---|
| 1 | nur die Root-`tsconfig` (`module: esnext`) | Build grün, Funktion gebaut, **Aufruf 500 `FUNCTION_INVOCATION_FAILED`**: „Cannot use import statement outside a module“ in `/var/task/api/plan-core-probe.js` |
| 2 | `api/tsconfig.json` mit `module: commonjs` | **Aufruf 200, JSON zeichengleich** mit den vorab berechneten Werten (inkl. 3 Werte aus Seed 42, `emptyRulesFrozen`, geladener CJS-Helfer) |

**Befund:** Ohne `api/tsconfig.json` übersetzt Vercel (`@vercel/node`, mit dem lokalen TypeScript 4.9.5) die `.ts`-Funktion mit der Root-`tsconfig`. Deren `module: esnext` lässt die ESM-Syntax (`import`) stehen, die Laufzeit lädt die Datei aber als CommonJS und bricht ab. Die Datei `api/tsconfig.json` mit `module: commonjs` behebt das. Der Fehler fällt nur beim Aufruf auf, nicht im Build.

**Bestehende `.js`-Funktionen bleiben unverändert:**
- Die Größen der vier `.js`-Funktionen sind in Lauf 1 und Lauf 2 identisch (`account` 225,39 KB, `ai` 606,32 KB, `generate-plan` 459,04 KB, `generate-plan-full` 467,16 KB). `generate-plan-full` antwortet weiter mit 405.
- Die eingecheckte `api/tsconfig.json` enthält weder `allowJs` noch `checkJs`. (Lauf 2 hatte `allowJs: true`, nur damit die Probe `./_lib/cors` typisiert importieren konnte; diese eine Option fehlt in der eingecheckten Fassung.) `tsc -p api/tsconfig.json --listFilesOnly` erfasst nur die 5 Kern-Dateien, davon 0 `.js`.
- Die Root-`tsconfig`, `tsc` für `src/` und der CRA-Build ändern sich nicht (dort bleibt `target: es5`, hier `ES2020`).

**Folgen für die weiteren Schritte:**
- Der Kern wird wegen des CRA-Typchecks (`target: es5`, kein `downlevelIteration`) ohne Iteration und Spread über `Set`/`Map` geschrieben.
- **Schritt 10:** Der Handler wird eine `.ts`-Datei (z. B. `generate-plan-full.ts`). JS-Helfer aus `api/_lib` bindet er per `require()` ein; das läuft ohne `allowJs` (lokal geprüft). `allowJs` nur nach einem Größenvergleich auf einer Preview wie hier aktivieren. Der `functions`-Eintrag in `vercel.json` muss auf den neuen Dateinamen angepasst werden.
- Entfallen: Übersetzungsskript, eingecheckter JS-Code, Drift- und Paritätstest. Schritt 0 (lokaler Server) bleibt aufgeschoben; `server/index.js` lädt keine `.ts`-Dateien.
- Die zwei Probe-Previews bleiben im Vercel-Projekt (nicht Production, hinter Deployment Protection) und können mit `vercel remove` gelöscht werden.

**ESLint:** Neue Override-Regel für `src/planCore/**` mit `no-restricted-imports`, die React, Node-Builtins, `@supabase/*` und relative Pfade aus `src/planCore` heraus verbietet.
- Dieselbe Regel für dieselben Dateien ersetzt die bestehende Quarantäne-Regel (`package.json` `eslintConfig.overrides[0]`). Deren `**/auxiliary/**`-Muster muss deshalb in die neue Regel mit hinein.
- Die Uhr-Regel (`overrides[1]`) gilt dort ohnehin.

## Abbildung der Einheiten-Arten auf die App (MVP)

Die App kennt nur 8 `sessionType` (`src/lib/ai/mapSessionType.ts:3-12`), alles andere wird `easy`. `type === "…"` steht an über 200 Stellen. Für das MVP bekommt der Kern deshalb eine eigene interne Art (`kind`) und bildet sie auf die bestehenden Typen ab. Die Art wird als optionales Feld `kind` gespeichert (Schritt 3).

| Kern-`kind` (§7) | `sessionType` | Darstellung |
|---|---|---|
| REC | `easy` | Titel „Regenerationslauf“, Zone 1 |
| E (+ Strides) | `easy` | Strides als Zusatz im `desc` |
| MLR | `easy` | Titel „Mittellanger Lauf“ |
| LR | `long` | |
| LR+M | `long` | M-Block im `desc` |
| M | `tempo` | M-Pace-Block im `desc` |
| T | `tempo` | Dauerlauf oder Cruise-Intervalle |
| I, R | `interval` | |
| RACE | `race` | |

### Was die Abbildung an den Stellen auslöst, die an `type` hängen

Gesucht wurde `type`/`sessionType` `===`/`!==` `"tempo" | "interval" | "easy" | "long"` in `src/` ohne Tests (Stand `c1f4711`). `src/lib/ai/coachPlanMutations.ts` (24 Treffer) fehlt, weil der Generator dort in Schritt 11 gelöscht wird; `src/auxiliary/**` und `src/dailyDecision.ts` sind Quarantäne bzw. ohne Plan-Bezug.

| Bereich | Stelle | Logik heute | Wirkung der Abbildung | MVP-Maßnahme |
|---|---|---|---|---|
| Zonen/HF-Ziele | `src/trainingIntelligence/hrZones.ts:25-35`, Aufruf `sessionPlanTargets.ts:145`, `:171`, `:217` | easy = Z2 (Z1 nur in Entlastungswoche), long = Z2, tempo = Z3–4, interval = Z4–5 | **REC** außerhalb von Entlastungswochen falsch als Z2; **M** und **T** beide als Z3–4 (M gehört in Z3, T in Z4) | **Ja, in Schritt 3:** Wenn `kind` gesetzt ist, Zone aus `kind` (REC Z1, E/MLR/LR Z2, M Z3, T Z4, I/R Z4–5, LR+M Z2 + Hinweis), sonst wie heute |
| Recovery-Last | `src/recovery/trainingDailyLoad.ts:14-15` | interval/tempo/race × 1,38; long × 1,12 | M (bis 29 km) als `tempo` mit 1,38 → Last eher überschätzt; LR+M als `long` mit 1,12 → unterschätzt | Nein. Richtung ist konservativ bzw. vertretbar; Feinjustierung mit `feat/session-kind-types` |
| Recovery-Planlast | `src/recovery/planTrainingLoad.ts:14` | längster `long`-Lauf | MLR zählt nicht als Long Run – gewollt | Nein |
| Marathonprognose | `src/marathonPrediction.ts:129-133`, `:181`, `:191-196`, `:432-470` | Gewichte je Typ; tempo/interval als Leistungssignal, long mit Boost | M läuft als `tempo`-Signal (0,48 / 1,5) – passt, M-Pace ist marathonspezifisch; LR+M als `long` bekommt den Long-Run-Boost – passt | Nein, aber nach Cutover einmal mit P4/P5 gegenprüfen |
| Prognose 2 | `src/marathonForecast.ts:262`, `src/lib/ai/coachRacePrediction.ts:195-199` | nur `long` bzw. tempo/interval vs. long/easy | wie oben, keine Fehlwirkung | Nein |
| Validatoren | `src/ai/validation/validateMicroStructure.ts:29-30`, `:124`; `validateSwap.ts:40-45`; `validatePhaseSwap.ts:18` | tempo/interval/race = hoch, long = mittel | M und T korrekt hart; **LR+M nur „mittel“**, obwohl laut Spec hart; MLR nie hart (korrekt) | Nein (nur Warnungen bei Nutzeränderungen); mit Schritt 14 über `isHardSession` |
| Anzeige-Texte/Pace-Fallback | `src/lib/ai/convertWorkout.ts:86-87`, `:132-154`, `:237-239` | Titel „Tempo X km“, Pace-Fallback aus `RUN_PACE_MIN_PER_KM` | M würde ohne eigenen Titel als „Tempo 22 km“ erscheinen; Pace-Fallback greift nur, wenn `pace` fehlt – der Kern setzt es immer | Nein, wenn der Kern Titel/`desc` immer setzt (Schritt 6, `text.ts`) – Prüfung als Teil von I1 |
| Long-Run-Hervorhebung | `src/App.tsx:358`, `:400-406`, `:422-455`, `:493-497`, `:548`, `:575`, `:621-628`, `:687`, `:1277`; `src/AppMain.tsx:663`, `:760-766`, `:800-804`, `:845`, `:1030-1037`, `:1155`, `:2440` | `long` und `km > 28` / `≥ 28` als „Schlüssellauf“ | LR+M wird korrekt als Long Run erkannt; Pläne mit LR-Peak < 28 km (P4, P6, alle HM) zeigen nie einen „Schlüssellauf“ – nur Hervorhebung, keine Fehlinformation | Nein |
| **Coach-Feedback** | `src/coachFeedback.ts:30-41`, `:89` | „Deine Long Runs liegen noch unter 28 km – für die Marathonbasis lohnt sich mehr Distanz“, **ohne Distanz- oder Plan-Bezug** | Widerspricht dem Plan: P4/P6 (LR-Peak 24–28) und **jeder HM-/10k-Plan** bekommen den Hinweis | **Ja, in Schritt 11:** Schwelle aus dem Plan (`max LR des Plans` bzw. nur bei `distance = m`), nicht fest 28 km |
| Wochenanalyse/Rückblick | `src/weeklyAnalysis.ts:151`, `src/prepRecap/buildPrepRecapSnapshot.ts:275`, `src/features/ai/ReplaceWorkoutPreviewCard.tsx` | zählen `long` | unverändert korrekt | Nein |

**Pace** läuft über das bestehende Feld `pace` im Format `m:ss–m:ss`. Die App liest es schon (`src/trainingIntelligence/sessionPlanTargets.ts:115-135`).
**Bausteine** stehen im `desc` und müssen vom Client-Parser lesbar sein (`src/sessionDistance.ts:153`). Prüfung: Für jede Einheit liegt `getSessionPlannedDistanceKm` innerhalb ±0,1 km am `km`, als Teil von I1.

---

## Schritte

Reihenfolge = Abhängigkeit. Schritte 2–6 lassen sich teilweise parallel bauen (siehe Grafik am Ende).
**MVP** = vor TestFlight nötig. **später** = kann warten.

### 0 · `chore/plan-api-local` — **später**, S (½ Tag)

> **v2: nicht mehr MVP.** Begründung: Ohne Schritt 8 ruft die Planerzeugung kein Claude mehr auf. Der Kern ist vollständig über Jest testbar (Invarianten, Property, P1–P6), der Client-Pfad (Schritt 11) läuft lokal ohne Netz, und der Server-Pfad (Schritt 10) wird auf einem Vercel-Preview im eingeloggten Chrome geprüft (Deployment Protection bleibt an). Kein späterer MVP-Schritt braucht den lokalen Server zwingend. In Schritt 10 entfällt deshalb auch die Verdrahtung in `server/index.js`. Wieder aufnehmen, sobald Schritt 8 kommt oder lokale Server-Tests häufig werden.

Planerzeugung lokal testbar machen (Roadmap-Folgepunkt (e)).

- **Dateien:**
  - `server/index.js` (ab `:638`): Routen `POST /api/onboarding/generate-plan-full` und `/generate-plan` binden die Vercel-Handler ein (`api/onboarding/generate-plan-full.js`, `generate-plan.js`).
  - `CLAUDE.md` Abschnitt „Live-Test-Setup“: `REACT_APP_AI_API_BASE=http://localhost:8787` für Web.
  - Die Basis-URL im Client bleibt unverändert (`src/lib/ai/claudePlanService.ts:86-95`): Die iOS-Hülle braucht die absolute URL.
- **Tests:** `src/__tests__/apiRouteAuth.test.js` um die neuen Express-Routen erweitern (401 ohne Token).
- **Abnahme:** `npm run start:full` + Onboarding in Chrome erzeugt einen Plan über `localhost:8787`. Production unberührt.

### 1 · `feat/plan-core-skeleton` — **MVP**, M (1 Tag)

Gerüst, Config, Typen, Build, keine Logik. Nicht verdrahtet.

- **Zuerst – Einbindungs-Test (max. ½ Tag, Ergebnis entscheidet A oder B):**
  1. Minimal-Modul `src/planCore/index.ts` mit `export const PLAN_CORE_PING = "ok"`.
  2. Test-Funktion `api/_probe/plan-core-probe.ts`, die es importiert und zurückgibt (ohne Auth, kein Nutzerinhalt, nur Preview).
  3. Preview-Deploy, Aufruf im eingeloggten Chrome. Gleichzeitig prüfen: `CI=false npm run build` bleibt grün (CRA darf `api/` nicht anfassen), und Jest kann `src/planCore` importieren.
  4. Besteht → **Variante A**, Probe-Funktion wieder löschen. Scheitert (Build-Fehler, Modul fehlt im Bundle, tsconfig-Konflikt ohne kleine Lösung) → **Variante B**, Fehlerbild im PR notieren.
- **Dateien (neu):**
  - `src/planCore/index.ts`: öffentliche API (`buildPlan`, `checkCorePlan`, `validatePlanRules`, `isHardSession`)
  - `src/planCore/config.ts`: alle Zahlen aus §0–§8 und §12, je Eintrag `{ value, source: "L"|"P"|"E", spec: "§5.3" }`, dazu `CONFIG_VERSION`
  - `src/planCore/types.ts`: `CoreInputs` (§2), `PlanRules` (§10), `CoreKind`, `CoreWorkout`, `CoreWeek`, `CorePlanMeta`
  - `src/planCore/dates.ts`: reine YMD-/UTC-Helfer. Vorlage: `api/_lib/planInvariants.js:210-221`
  - `src/planCore/random.ts`: deterministischer Zufall mit Seed, nur für Tests
  - `package.json`: ESLint-Override (siehe oben)
  - nur Variante B: `scripts/buildPlanCore.js`, Skript `build:plan-core`, `api/_lib/planCore/` (generiert, eingecheckt)
  - nur Variante A: ggf. `api/tsconfig.json`
- **Tests:**
  - `src/planCore/__tests__/config.test.ts`: jeder Eintrag hat `source` und `spec`, Snapshot der Config
  - `src/__tests__/planCorePurity.test.js`: keine Imports außerhalb `src/planCore`, kein `Date.now`/`new Date()`
  - nur Variante B: `src/__tests__/planCoreBuildDrift.test.js`: eingecheckter Stand = frisch übersetzter Stand
- **Abnahme:** Build und Tests grün, Entscheidung A/B im PR dokumentiert und in diesem Dokument nachgetragen. Production unverändert.
- **Umgesetzt (2026-11-04), Branch `feat/plan-core-skeleton`:**
  - Entscheidung **Variante A** (siehe Architekturentscheidung); `api/tsconfig.json` ist die einzige Zusatzdatei.
  - Zusätzlich zum Plan (freigegeben): `src/planV2/planCoreCompat.ts` (Typ-Prüfung `CorePlan` → `TrainingPlanV2`, nur Typen), `dates.test.ts`, `random.test.ts`. `index.ts` exportiert bewusst keine Stubs für `buildPlan` & Co.
  - Messwerte: Jest 178 Suites / 61.549 Tests grün (Baseline `main`: 174 / 61.509), `tsc` und ESLint auf `src/planCore` ohne Fehler, Build grün. Die erste Snapshot-Datei des Repos ist `src/planCore/__tests__/__snapshots__/config.test.ts.snap` (unter `CI=true` werden neue Snapshots nicht geschrieben: einmal ohne `CI` erzeugen und einchecken).
  - ESLint 8.57 kennt `regex` in `no-restricted-imports` nicht; der Override nutzt `group: ["/[a-zA-Z@_]*", "../**"]` (getestet: erlaubt nur `./…`).
  - Review-Befunde eingearbeitet: Herkunftsmarken, doppelte Spec-Zahlen mit Gleichheitstest, Spec-Widerspruch MLR (§6 vs. §7) als Review-Punkt 8 in `plan-spec.md` §14.
  - **Für Schritt 3 (Reviewer-Hinweis):** `normalizePlanMeta` (`src/planV2/normalizeTrainingPlan.ts:524ff`) behält in `plan.meta` nur `volumeNote`. `meta.core` (`configVersion`, `inputs`, `rules`) und `workout.kind` gehen sonst bei der Normalisierung verloren; beide gehören dort hinein.

### 2 · `feat/plan-core-volume` — **MVP**, M (2–3 Tage)

§4 Planlänge und Phasen, §5 Wochenumfang. Funktion `planVolume(inputs) → { weeks: [{ wn, startYmd, days, phase, targetKm, isRecoveryWeek }], peakKm, notes }`.

- **Dateien:**
  - `src/planCore/phases.ts`: Taper M/HM 2, 5k/10k 1; Rest 35/35/30 rückwärts; harte Untergrenze → Fehler; über Max → freie Wochen
  - `src/planCore/volume.ts`: Start-Clamp `minStart`; Peak-Tabelle nach Lauftagen, Zielzeit nur innerhalb der Spanne, ≤ Start × 1,5; +10 % **oder** +4 km; ≤ 1,30 × w−2; Entlastung 3:1 je Block −20–30 %, danach ≤ altes Niveau; Taper-Anteile nach §5.4
  - Vorlage: `api/_lib/weeklyVolumeProgression.js:24-207` (smoothstep-Verlauf, Teilwochen) und `api/_lib/deterministicPlanGenerator.js:637-799` (Wochenraster, Tage je Woche)
- **Tests:** `src/planCore/__tests__/volume.test.ts`
  - I3, I4, I5 und der Volumen-Teil von I13 als Unit-Tests
  - Property-Test: 2 000 Eingaben (4 Distanzen × 3–6 Tage × alle zulässigen Planlängen × Start 0–150 km × Wochentag des Planstarts)
- **Abnahme:** P1–P6 liegen bei Peak in den Bereichen aus §13. Nicht verdrahtet.

### 3 · `fix/plan-contract-passthrough` — **MVP**, S (1 Tag), unabhängig, früh mergen

Die App nimmt an, was der Kern liefern wird. Gleichzeitig wird der Nebenbefund zu Woche 1 behoben (I21).

- **Dateien:**
  - `src/planV2/types.ts:4-18`, `:43-45`: optionales `kind` an `WorkoutV2`; `meta.core = { configVersion, inputs, rules }` an `TrainingPlanMetaV2`
  - `src/planV2/normalizeTrainingPlan.ts:185-196`: `kind` durchreichen
  - `normalizeTrainingPlan.ts:525-549` (`normalizePlanMeta`): `meta.core` geprüft durchreichen
  - `normalizeTrainingPlan.ts:444-448`, `:484-496`, `:503-520`: Meta-Zuordnung auch über den Montag der Woche, damit eine angebrochene Woche 1 `focus`/`dates` behält
  - **v2:** `src/trainingIntelligence/hrZones.ts:21-35` + Aufrufe `sessionPlanTargets.ts:145`, `:171`, `:217`: optionaler `kind`-Parameter; gesetzt → Zone aus `kind` (REC Z1, E/MLR/LR Z2, M Z3, T Z4, I/R Z4–5), sonst unverändert. Damit stimmen HF-Ziele für REC und M ab dem ersten Kern-Plan (siehe Abbildungstabelle).
- **Tests:** `normalizeTrainingPlan.test.ts`, `hrZones`-Tests (mit/ohne `kind`):
  - Woche 1 mit Start Mi behält `focus`/`dates`
  - `kind` und `meta.core` bleiben erhalten, unbekannte Felder in `meta.core` fallen weg
  - Live-Fixtures (`src/testSupport/fixtures/livePlan*.json`) normalisieren unverändert, abgesehen von der reparierten Woche 1
- **Abnahme:** Bestehende Pläne werden gleich angezeigt; Woche 1 zeigt bei Start mitten in der Woche Fokus und Datum.

### 4 · `feat/plan-core-pace` — **MVP**, M (2 Tage), parallel zu 2

§3 Form und Pace.

- **Dateien:** `src/planCore/pace.ts`
  - VDOT nach Daniels-Gilbert; Abschlag für alte Rennen (−1 je angefangene 6 Wochen über 12, max. −4)
  - Schätzzeit 5k/10k; Einsteiger-Modus ohne Angabe
  - Paces REC/E/M/T/I/R; Zielpace nur bei VDOT-Lücke ≤ 2, sonst Hinweis (`notes`)
- **Tests:** `pace.test.ts`
  - Werte gegen die veröffentlichten Daniels-Tabellen (±2 s/km) für VDOT 30, 40, 50, 60, 70
  - I17 und I18 als Property-Test
- **Abnahme:** P3/P5 liefern plausible Paces (T für HM 1:35 ≈ 4:20–4:30/km). Nicht verdrahtet.
- **Offen (vor dem Schritt klären):** Die Minuten-Limits aus §7/§8 brauchen im Einsteiger-Modus eine Pace. Vorschlag: konservative Standard-E-Pace in `config.ts` (z. B. 7:00/km, Herkunft `E`, Review-Punkt).

### 5 · `feat/plan-core-week-templates` — **MVP**, M–L (3 Tage), nach 2

§6 Wochenschablonen und Platzierung.

- **Dateien:**
  - `src/planCore/templates.ts`: Schablonen je Lauftage × Phase, Q-Maximum je Lauftage, Einsteiger-Modus (Q2 bei 4 Tagen erst ab Aufbau)
  - `src/planCore/placement.ts`: LR auf `longRunDay`, Q1 ≈ LR−3, Q2 ≈ LR+2; keine harten Folgetage über die Wochengrenze; nicht verfügbare Tage → Ruhe; Konflikt → Q2 entfällt, nie verschieben
  - `src/planCore/hard.ts`: `isHardSession` nach §1 (I, T, R, M ≥ 5 km, Rennen, LR ≥ 90 min)
- **Tests:** `templates.test.ts`
  - I6 (inkl. So → Mo), I7, I16 als Unit- und Property-Test über alle Kombinationen von 3–6 Tagen × `availableDays` × `longRunDay`
  - Unerfüllbare Kombinationen (z. B. 6 Tage aus 6 verfügbaren mit LR in der Mitte) liefern einen definierten Fehler oder Q2 entfällt
- **Abnahme:** Jede gültige Eingabe ergibt eine Wochenform ohne Verstoß.

### 6 · `feat/plan-core-sessions` — **MVP**, L (4–5 Tage), nach 4 und 5

§7 Einheiten-Bibliothek, §7.1 Long Run, §7.2 Q-Typen, §8 Rennwoche, km-Verteilung nach §6.

- **Dateien:**
  - `src/planCore/longRun.ts`: Anteil nach Lauftagen (55/50/38/33 %), 150/180 min, +2 km/+15 % (max. +3), Start ≤ längster Lauf + 2, Peak-Ziele je Distanz, Entlastung −20–30 %, keiner in der Rennwoche. Vorlage für die Verlaufsform: `api/_lib/planInvariants.js:995-1093`
  - `src/planCore/sessions.ts`: Bausteine je `kind` mit Limits (WU/CD 1,5–3 km; T ≤ 10 %, I ≤ min(8 %, 10 km), R ≤ min(5 %, 8 km), M ≤ min(29 km, 110 min); E 25–75/90 min, ≤ 75 % LR; MLR; REC; Strides). Vorlagen: `api/_lib/planSessionText.js:52-108`, `:189-200`
  - `src/planCore/distribute.ts`: Rest auf E/REC innerhalb der Limits, Woche wird kleiner statt Einheit größer. Vorlage: `api/_lib/planInvariants.js:428-467`
  - `src/planCore/raceWeek.ts`: letzte Q ≥ 4/3 Tage vorher, letzte 2 Tage ≤ 30 min oder Ruhe, genau 1 RACE
  - `src/planCore/text.ts`: Titel/`desc`/Zone, Format für `src/sessionDistance.ts:153` lesbar. Vorlage: `api/_lib/planSessionText.js:114-206`
- **Tests:**
  - I1 (inkl. Parser-Abgleich), I2, I8, I9, I10, I11, I12, I13 (Qualität), I14, I15 als Unit-Tests je Modul
  - Property-Test wie in Schritt 2
  - Parser-Rundlauf: `parseStructuredWorkoutSpecFromDesc(desc)` ergibt die Bausteine
- **Abnahme:** P4 hat LR-Peak 26–28 km, P5 hat T ≤ 10 km und LR-Peak 30–34 km. Kein Tempo > 10 % der Woche.

### 7 · `feat/plan-core-assemble` — **MVP**, M (2–3 Tage), nach 3 und 6

`buildPlan(inputs, rules, todayYmd) → TrainingPlanV2` und `checkCorePlan(plan, inputs) → string[]`.

- **Dateien:**
  - `src/planCore/buildPlan.ts`: Wochen-Meta (`startIso` = Montag, `wn`, `phase`, Label `Woche N · Phase` wie `api/_lib/deterministicPlanGenerator.js:22-34`, `focus`, `dates`; Entlastung: `isRecoveryWeek` + „Entlastungswoche …“ wie `deterministicPlanGenerator.js:29`); eindeutige IDs `pc-<ymd>-<kind>`; `meta.core`
  - `src/planCore/invariants.ts`: I1–I22 als Prüfer, maschinenlesbare Codes, keine Nutzerinhalte
- **Tests:**
  - `src/planCore/__tests__/invariants.property.test.ts`: 2 000 zufällige gültige Eingaben, alle Invarianten halten; Seed im Testnamen, damit Fehlschläge reproduzierbar sind
  - `src/planCore/__tests__/profiles.test.ts`: P1–P6 als Jest-Snapshots **und** als Bereichsprüfungen aus §13 (Snapshot erkennt jede Änderung, Bereichsprüfung prüft die Spec)
  - I20: zweimal `buildPlan` → identisch. I21, I22
  - Vertrag: `normalizeTrainingPlan(plan)` deep-equal `plan`; `validateTrainingPlanV2Integrity` true; `deriveDisplayPlan` ohne Fehler
  - nur Variante B: Parität TS-Kern = `api/_lib/planCore` für P1–P6 und 200 Property-Fälle
- **Abnahme:** Alle Invarianten grün, P1–P6 in den Bereichen.
  - Zusätzlich `docs/plan-core-profiles.md`: Vergleichstabelle P1–P6 gegen je einen Literaturplan (§13: Peak-km, LR-Max, LR ≥ 30 km, Q/Woche, Taper). Ist Grundlage fürs Spoho-Review.
  - Hinweis: `CI=true` schreibt keine neuen Snapshots. Die Snapshot-Dateien müssen mit eingecheckt werden.

### 8 · `feat/plan-rules-claude` — **später**, S–M (1–2 Tage), nach 1

> **v2: nicht mehr MVP.** Die fünf neuen Onboarding-Fragen (Schritt 9) decken Lauftage, verfügbare Tage und Long-Run-Tag strukturiert ab – den Hauptteil dessen, was Freitext heute leistet. Freitext wird im MVP nur gespeichert und vom Coach gelesen. `buildPlan` bekommt `EMPTY_RULES`; `PlanRules`-Typ und `validatePlanRules` dürfen in Schritt 1 als Gerüst entstehen, werden aber nicht befüllt. Vorteil: Planerzeugung ohne Claude-Aufruf – kein Timeout, keine Kosten, keine Nebenwirkungen.

§10: Freitext → `PlanRules`.

- **Dateien:**
  - `src/planCore/rules.ts`: `validatePlanRules(raw, inputs)` mit Whitelist und Wertebereichen. Regeln können nur verschärfen. Liefert `{ rules, dropped: string[] }`, nur Feldnamen.
  - `api/_lib/planRulesFromText.js`: ein Claude-Aufruf mit festem JSON-Schema, Timeout, kein Retry-Loop. Bei Fehler gibt es leere Regeln. Vorlage für Client/Timeout: `api/_lib/claudePlanGenerator.js:212-243`.
- **Tests:**
  - `rules.test.ts`: unbekannte Felder, Lockerungsversuche (`maxWeeklyKm` über Peak, mehr Tage), Widerspruch zu Pflicht-Inputs
  - `src/__tests__/planRulesFromText.test.js`: gemockter Anthropic-Client mit Müll, Markdown-Zaun, Timeout
  - Logs ohne Nutzerinhalt: `src/__tests__/apiLogsNoUserContent.test.js` erweitern
- **Abnahme:** Kein Freitext kann eine Sicherheitsgrenze lockern. Ohne Claude entsteht ein vollständiger Plan.

### 9 · `feat/onboarding-plan-inputs` — **MVP**, M–L (3 Tage), nach 1

§2: die fünf neuen Fragen. Gerät-Test auf dem iPhone 13 nötig.

- **Dateien:**
  - `src/components/Onboarding.tsx`: Schritte/Felder für Lauftage (3–6), verfügbare Tage + LR-Tag, Wochen-km als Zahl, letzter Wettkampf/Schätzzeit, längster Lauf. Die Umfangs-Spanne (`:215`, `:719`) wird dadurch ersetzt.
  - `src/onboarding/marathonPreferencesOnboarding.ts:32-38`, `:210-247`: Payload und Preferences
  - `src/onboarding/planOwnedPreferences.ts`: neue Felder sind plan-eigen
  - `src/lib/ai/claudePlanService.ts:61-71`: `PlanGenerationProfile` erweitern
  - `api/_lib/inputLimits.js:105-146`: neue Felder in die Whitelist mit Grenzen, sonst werden sie serverseitig verworfen
- **Kompatibilität:** Der Client schickt weiter `weeklyKmRange`, abgeleitet aus der Zahl (z. B. 35 → „20–40 km“). Damit funktioniert der heutige Pfad unverändert, bis Schritt 10 umschaltet.
- **Bestehende Nutzer:** Profile ohne die Felder werden beim nächsten Erstellen eines Plans gefragt, nicht geraten.
- **Tests:**
  - `Onboarding.*.test.tsx` erweitern: Pflichtfelder, Einsteiger-Modus ohne Rennergebnis, Ableitung der Spanne
  - `apiInputLimits.test.js`: neue Felder, Grenzen, Kürzung
- **Abnahme:** Wizard auf iPhone 13 (Tastatur, Safe Areas, 390 px). Der Plan entsteht weiter über den heutigen Pfad.

### 10 · `feat/plan-core-server` — **MVP**, M (1,5 Tage), nach 7 und 9

Kern im Vercel-Handler hinter dem Schalter.

- **Dateien:**
  - `api/onboarding/generate-plan-full.js:24-45` (bzw. die `.ts`-Funktion bei Variante A):
    - `PLAN_CORE_MODE=on`: `buildPlan(inputs, EMPTY_RULES, todayYmd)` → `checkCorePlan`. Kein Claude-Aufruf. Mit Verstoß gibt es keinen Plan: Antwort 500 mit maschinenlesbarem Code, Verstoß-Codes im Log (ohne Nutzerinhalt); das Onboarding zeigt eine verständliche Meldung und bietet den lokalen vereinfachten Plan an (freigegeben).
    - `shadow`: Antwort wie heute; der Kern rechnet daneben und loggt nur Verstoß-Codes und Kennzahlen (Peak, LR-Max, Lauftage), keine Inhalte.
    - `off`: wie heute.
    - Fehlen die neuen Eingaben (alter Client), läuft der heutige Pfad.
  - Antwortformat `{ plan }` bleibt. `vercel.json` `maxDuration` erst nach dem Cutover senken.
  - Onboarding-UI: Fehlermeldung bei 500 mit Kern-Code + Button „Vereinfachten Plan nutzen“.
  - Keine Verdrahtung in `server/index.js` (Schritt 0 ist verschoben).
- **Tests:**
  - `src/__tests__/generatePlanFullCore.test.js`: die drei Modi, alter Client ohne Felder, Verstoß → 500 mit Code, kein Anthropic-Aufruf im Modus `on`
  - `apiLogsNoUserContent.test.js` für den Shadow-Log
- **Abnahme:** Auf einem Preview-Deploy mit `on` erzeugt das Onboarding einen Plan, die App zeigt ihn ohne UI-Änderung. Production bleibt auf `off`.

### 11 · `feat/plan-core-client` — **MVP**, M (2 Tage), nach 7 und 9

Client-Kopie ersetzen.

- **Dateien:**
  - `src/components/Onboarding.tsx:495-537`: Der „vereinfachte Plan“ ruft `buildPlan` aus `src/planCore` lokal auf, mit leeren Regeln und ohne Netz. Damit entfällt auch der Struktur-Aufruf `fetchClaudePlanStructure`.
  - `src/lib/ai/coachPlanMutations.ts:381-1129`: Generator löschen. Die Patch-Builder (`:1-380`) bleiben. `AiPlanRules`/`PlanPhaseSpec` (`:489-513`) wandern dorthin, wo sie noch gebraucht werden, oder entfallen.
  - Chat-Aktion „Marathon-Plan erzeugen“ entfernen (`src/lib/ai/coachDeterministicResponses.ts:695-716`, `src/lib/ai/aiActionContract.ts:18`, `src/lib/ai/types.ts:24`). Sie übernimmt heute nie einen Plan (Inventar §5). **Freigegeben: entfernen.**
  - **v2:** `src/coachFeedback.ts:30-41`: 28-km-Schwelle nicht mehr fest, sondern aus dem Plan (längster geplanter LR des aktiven Plans; Hinweis nur bei `distance = m`). Sonst widerspricht der Coach jedem HM-/10k-Plan und den Marathon-Plänen mit 3–4 Lauftagen.
- **Tests:**
  - `coachPlanMutations.generate.test.ts` entfällt
  - `coachDeterministicResponses.test.ts:106-107` anpassen
  - `coachFeedback`-Test: HM-Plan mit LR 20 km → kein Hinweis; M-Plan mit LR-Peak 27 km, längster gelaufener LR 27 km → kein Hinweis
  - Onboarding-Test: vereinfachter Plan besteht `checkCorePlan`
- **Abnahme:** Es gibt genau eine Generator-Implementierung im Client. Der vereinfachte Plan hat 0 Verstöße (heute 49).

### 12 · `chore/plan-core-cutover` — **MVP**, S (½ Tag + 2–3 Tage Beobachtung), nach 10 und 11

- **Ablauf:**
  1. `PLAN_CORE_MODE=shadow` in Production für **2–3 Tage** (v2). Shadow vergleicht nur mit dem alten Pfad, dessen Schwächen bekannt sind; die eigentliche Abnahme sind P1–P6, die Property-Tests und der iPhone-Test. Während Shadow selbst gezielt Pläne erzeugen (alle 6 Profile über das Onboarding), da es noch kaum echte Nutzer gibt.
  2. Auswertung: 0 Verstöße, Kennzahlen plausibel.
  3. iPhone-13-Test mit P1–P6-ähnlichen Eingaben.
  4. `on`.
  5. Roadmap und `CLAUDE.md` (Abschnitt „Zwei AI-Provider“) aktualisieren.
- **Rückweg:** Schalter auf `off`, keine Datenmigration (bestehende Pläne bleiben, wie sie sind, Spec §15.3).
- **Abnahme:** Neue Pläne in Production kommen aus dem Kern. Bestehende Pläne werden unverändert angezeigt.

### 13 · `chore/remove-legacy-plan-generator` — später, M (1–2 Tage), frühestens 2 Wochen nach 12

Alten Pfad löschen, wenn der Schalter stabil auf `on` steht.

- **Dateien:**
  - `api/_lib/phasedFullPlanGenerator.js`, `deterministicPlanGenerator.js`, `weeklyVolumeProgression.js`, `planInvariants.js`, `planSessionText.js`, `raceVolumeReference.js`
  - die Struktur- und Phasen-Prompts in `claudePlanGenerator.js`, `planWorkoutUtils.js`, `onboardingAiPlanRefinement.js`
  - `api/onboarding/generate-plan.js` und `vercel.json`-Eintrag
  - `scripts/test-long-run-cap.js`
- **Tests:** Matrix-, Regressions- und Paritätstests des alten Pfads (`src/__tests__/planInvariants.*`, `planVolumeRegression`, `planAuditRegression10k`, `planSessionText`, `planLabelParity`, `weeklyVolumeProgression`) entfallen bzw. gehen in die Kern-Tests auf. Die Live-Fixtures bleiben als Anzeige-Regression (Normalisieren + `deriveDisplayPlan`).
- **Abnahme:** Kein `require` mehr auf den alten Generator, Build und Tests grün.

### 14 · `refactor/validators-shared-hard` — später, S (1 Tag), nach 5

- **Inhalt:** `validateMicroStructure` und `validateSwap` nutzen `isHardSession` aus dem Kern und prüfen über die Wochengrenze (Spec §15.5). Betroffen:
  - `src/ai/validation/validateMicroStructure.ts:27-32` und `:68-101` (paarweise nur innerhalb der Kalenderwoche)
  - `src/ai/validation/validateSwap.ts:38-50` (Long Run = `long` oder ≥ 15 km)
  - Entfallende Regeln nach Gap §15.5 (3)
- **Tests:** bestehende Validator-Tests, neuer Fall So → Mo.
- **Warum später:** Es betrifft nur Warnungen bei Nutzer-Änderungen, nie die Planerzeugung.

### 15 · Weitere „später“-Punkte (eigene kleine Branches)

| Branch | Inhalt | Dateien |
|---|---|---|
| `refactor/recovery-week-flag` | App erkennt Entlastung am Flag statt am Text; `isRecoveryWeek` durch `toPlanWeeks`/`planToAi` reichen | `src/trainingIntelligence/sessionPlanTargets.ts:137-141`, `src/planV2/toPlanWeeks.ts:40-68`, `src/lib/ai/planToAi.ts:62-83` |
| `fix/normalize-swim` | `swim` nicht mehr zu `easy` umdeuten (Spec §15.4) | `src/lib/ai/mapSessionType.ts:3-30`, `src/lib/ai/types.ts` (`SessionType`) |
| `feat/session-kind-types` | Kern-Arten als echte App-Typen statt Abbildung auf 8 Typen | `mapSessionType.ts`, alle `type === …`-Stellen, `src/scheduling/capacityScore.ts:163` |
| `feat/plan-inputs-from-health` | Wochen-km und längsten Lauf aus `health_workouts` vorschlagen | `supabase/migrations/001_initial_schema.sql:44-60` (Lesepfad), Onboarding |
| §9, §11 | Formprüfung, Claude-Texte | laut Spec nicht im MVP |

---

## Übersicht (v2)

| # | Branch | MVP | Aufwand | hängt ab von | ändert Production? |
|---|---|---|---|---|---|
| 1 | `feat/plan-core-skeleton` | ja | M (1 T, inkl. Vercel-Test) | – | nein |
| 2 | `feat/plan-core-volume` | ja | M (2–3 T) | 1 | nein |
| 3 | `fix/plan-contract-passthrough` | ja | S (1–1,5 T, inkl. Zonen nach `kind`) | – | ja, Woche-1-Fix |
| 4 | `feat/plan-core-pace` | ja | M (2 T) | 1 | nein |
| 5 | `feat/plan-core-week-templates` | ja | M–L (3 T) | 2 | nein |
| 6 | `feat/plan-core-sessions` | ja | L (4–5 T) | 4, 5 | nein |
| 7 | `feat/plan-core-assemble` | ja | M (2–3 T) | 3, 6 | nein |
| 9 | `feat/onboarding-plan-inputs` | ja | M–L (3 T) | 1 | ja, neue Fragen, alter Pfad |
| 10 | `feat/plan-core-server` | ja | M (1,5 T) | 7, 9 | nein (Schalter `off`) |
| 11 | `feat/plan-core-client` | ja | M (2–2,5 T, inkl. Coach-Feedback) | 7, 9 | ja, vereinfachter Plan besser |
| 12 | `chore/plan-core-cutover` | ja | S (½ T + 2–3 T Shadow) | 10, 11 | ja, Umschalten |
| 0 | `chore/plan-api-local` | später | S | – | nein |
| 8 | `feat/plan-rules-claude` | später | S–M | 1 | nein |
| 13 | `chore/remove-legacy-plan-generator` | später | M | 12 | nein |
| 14 | `refactor/validators-shared-hard` | später | S | 5 | Warnungen |
| 15 | diverse | später | S–L | – | – |

**Aufwand bis Cutover (v2):**
- **Summe der Arbeit:** ca. 21–25 Arbeitstage + 2–3 Tage Shadow (v1: 22–28 inkl. einer Woche Shadow). Die Einsparung durch Schritt 0/8 und die kürzere Shadow-Phase liegt bei etwa 5–7 Tagen; Zonen-Fix und Coach-Feedback kosten etwa 1 Tag zurück.
- **Kritischer Pfad:** 1 → 2 → 5 → 6 → 7 → 10 → 12 ≈ 15–19 Arbeitstage + Shadow.
- **Realistisch nur mit Parallelarbeit:** 3, 4 und 9 laufen in eigenen Claude-Code-Sessions/Worktrees neben 2 und 5. Nacheinander abgearbeitet landet der Cutover bei der Summe, nicht beim kritischen Pfad.

```
3 ───────────────────────────────┐
1 ─┬─ 2 ─ 5 ─┐                   │
   ├─ 4 ─────┴─ 6 ─────────── 7 ─┴─┬─ 10 ─┬─ 12 ─ 13
   └─ 9 ───────────────────────────┴─ 11 ─┘
```

Das Spoho-Review kann nach Schritt 7 anhand von `docs/plan-core-profiles.md` laufen. Änderungen landen nur in `src/planCore/config.ts`. Danach `npm run build:plan-core`, Snapshots bewusst aktualisieren (`-u`) und die Bereichsprüfungen aus §13 anpassen, falls sich Abnahmekriterien ändern.

## Entscheidungen (Stand v2, 2026-11-04)

1. **Einbindung:** entschieden in Schritt 1 (2026-11-04) – **Variante A** (Vercel baut `api/*.ts` direkt, `src/planCore` wird importiert), mit `api/tsconfig.json` (`module: commonjs`, ohne `allowJs`). Ohne diese Datei läuft die Funktion nicht (ESM-Syntax im CJS-Laufzeitpfad). Variante B entfällt.
2. **Art-Abbildung:** freigegeben – MVP mit `kind` + Abbildung auf die 8 App-Typen (Tabelle oben); Zonen nach `kind` (Schritt 3) und Coach-Feedback-Schwelle (Schritt 11) im MVP; echte neue Typen später.
3. **Verstoß im Server-Pfad (`on`):** freigegeben – Plan verweigern (500 mit Code, Log ohne Nutzerinhalt), Onboarding zeigt verständliche Meldung und bietet den lokalen vereinfachten Plan an. Kein stiller Rückfall auf den alten Pfad.
4. **Chat-Aktion „Marathon-Plan erzeugen“:** freigegeben – im MVP entfernen.
5. **Property-Tests:** freigegeben – eigener Zufallsgenerator mit Seed (`src/planCore/random.ts`).
6. **Standard-Pace im Einsteiger-Modus:** freigegeben – 7:00/km als E-Pace, Herkunft `E`, Spoho-Review-Punkt.
7. **Shadow-Dauer:** 2–3 Tage, Schalter bleibt als Rückweg.
8. **Bestandsnutzer:** freigegeben – neue Fragen beim nächsten Erstellen eines Plans, keine Migration.
9. **Claude in der Planerzeugung:** im MVP keiner. Freitext nur gespeichert/Coach (Schritt 8 später).
10. **Lokaler API-Server (Schritt 0):** später; Server-Pfad wird auf Vercel-Preview im eingeloggten Chrome getestet.
