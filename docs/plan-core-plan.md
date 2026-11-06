# Umbauplan: deterministischer Plan-Kern

Stand: 2026-11-04 (v2), Basis `main` @ `c1f4711`. Grundlage: `docs/plan-spec.md` (v0.4), `docs/plan-architecture-inventory.md`, `docs/plan-spec-gap.md`.
Reiner Plan, keine Code-Änderung. Zeilenangaben beziehen sich auf `main` @ `c1f4711`.

## Änderungen v2 (2026-11-04, nach Review)

1. **Freigegeben:** Server verweigert den Plan bei Regelverstoß (Codes loggen, im UI verständliche Meldung + lokaler vereinfachter Plan als Angebot). Chat-Aktion „Marathon-Plan erzeugen“ wird entfernt. Standard-E-Pace 7:00/km im Einsteiger-Modus (Herkunft `E`, Spoho-Review-Punkt). Eigener Zufallsgenerator statt `fast-check`. Bestandsnutzer werden nur beim nächsten Erstellen gefragt.
2. **Schritt 8 (Claude → `PlanRules`) ist nicht mehr MVP.** Freitext wird wie heute gespeichert und nur vom Coach gelesen. Die Planerzeugung läuft im MVP **ohne Claude**: `buildPlan(inputs, EMPTY_RULES, todayYmd)`.
3. **Shadow-Betrieb 2–3 Tage** statt einer Woche. Schalter `off/shadow/on` bleibt als Rückweg. *(v3: kein Production-Shadow, siehe Änderungen v3.)*
4. **Schritt 0 ist nicht mehr MVP** (Begründung dort).
5. **Schritt 1 beginnt mit einem Vercel-Test:** Kann `api/*.ts` direkt gebaut werden und `src/planCore` importieren? Beide Varianten sind unten beschrieben, die Entscheidung fällt im Schritt.
6. **Abbildungstabelle** der Kern-Arten auf die 8 App-Typen mit allen betroffenen Stellen (Datei:Zeile). Daraus zwei neue kleine MVP-Punkte: Zonen nach `kind` (in Schritt 3) und der 28-km-Hinweis im Coach-Feedback (in Schritt 11).

## Änderungen v3 (2026-11-06, Verdrahtung)

1. **Reihenfolge:** Schritt 9 zuerst (Server und App brauchen die neuen Eingaben; der Server verwarf unbekannte Profilfelder). Die Teile von Schritt 11, die ohne Schritt 9 gingen (Chat-Aktion, 28-km-Schwelle, `kind` in der Auswertung, Titel „Marathontempo“), bleiben in Schritt 11.
2. **Wizard nur 5k/10k/HM/M**, keine freie Distanz. **Renndatum unter der harten Untergrenze** (§4) lehnt der Wizard ab; die Meldung nennt das früheste mögliche Renndatum.
3. **Rückfall bei error bis Schritt 13: alter Generator** (bestätigt). Der Button „Vereinfachten Plan nutzen“ bleibt bis Schritt 11. Entscheidung 3 unten ist entsprechend nachgezogen.
4. **Kein Production-Shadow.** Der Schalter `off/shadow/on` bleibt (Rückweg, Preview). Abnahme von Schritt 10: Offline-Vergleich alt/neu (P1–P6 und Zufallsprofile, Kennzahlen) und Preview-Test mit `on`. Schritt 12 schaltet danach direkt auf `on`.
5. **`freeText` nie im Plan:** nicht in `meta.core.inputs` (`buildPlan`) und beim Normalisieren entfernt; er bleibt nur in den Preferences.
6. **Längster Lauf optional**, Standardwert nach Distanz und Lauftagen, immer > 0 (Spec §2, Review-Punkt 39).
7. **Bestandsnutzer:** Der Wizard füllt die neuen Felder mit den Werten des letzten Plans vor (nur, wenn dieser Plan sie schon hat).
8. **Spoho-Review und `docs/plan-core-profiles.md`:** nach Schritt 12, vor dem App-Store-Release.

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
  - `src/planCore/volume.ts`: Start-Clamp `minStart`; Peak-Tabelle nach Lauftagen, Zielzeit nur innerhalb der Spanne, ≤ Start × 1,5; +10 % **oder** +4 km; ≤ 1,30 × w−2; Entlastung 3:1 je Block fest −20 % (v0.4), danach ≤ altes Niveau; Taper-Anteile nach §5.4
  - Vorlage: `api/_lib/weeklyVolumeProgression.js:24-207` (smoothstep-Verlauf, Teilwochen) und `api/_lib/deterministicPlanGenerator.js:637-799` (Wochenraster, Tage je Woche)
- **Tests:** `src/planCore/__tests__/volume.test.ts`
  - I3, I4, I5 und der Volumen-Teil von I13 als Unit-Tests
  - Property-Test: 2 000 Eingaben (4 Distanzen × 3–6 Tage × alle zulässigen Planlängen × Start 0–150 km × Wochentag des Planstarts)
- **Abnahme:** P1–P6 liegen bei Peak in den Bereichen aus §13. Nicht verdrahtet.
- **Umgesetzt (2026-11-04), Branch `feat/plan-core-volume`** (Spec auf v0.4, `CONFIG_VERSION` 0.4.0):
  - Entscheidungen (freigegeben): P1 in §13 auf Peak 13–15 km, LR-Peak 7–8 km (I5 bleibt); Wochen-Entlastung fest −20 %; `peakPosition` als Option von `planVolume`, Standard 0,75 (Herkunft E, Review-Punkt 9; Schritt 7 leitet sie aus der VDOT-Lücke ab); I3/I4/Peak gelten nur bis zur Peak-Woche (Taper- und Rennwochen ausgenommen), Rennwochen-Volumen „ohne Rennen“, das Rennen zählt separat; Zusatz-Taper-Woche bei Rennwoche < 4 Tage (`phases.shortRaceWeekDays`).
  - Annahmen (bestätigt): Teilwochen als Vollwochen-Äquivalent (`fullWeekKm`), Kalenderwochen, Verlauf vor Woche 1 = Woche 1, Woche 1 = min(Ist, Obergrenze), kein Abschlag bei „unter Empfehlung“, Peak-Woche = letzte Nicht-Taper-Woche, Taper 70 % / 42,5 %, 5k/10k 50 %.
  - Kleine Abweichungen, die beim Bauen nötig wurden (bitte bestätigen): (1) Neuer Config-Eintrag `volume.weekOneMinKm` = 5 (E): ohne ihn bleibt ein Plan bei 0 km für immer bei 0 (I3). (2) Bei Umfängen unter etwa 10 km ist die Entlastung nicht tiefer, als I3 für die übernächste Woche zulässt (sonst gäbe es danach einen Rückgang). (3) `peak-not-reached` erscheint, sobald der erreichte Peak mehr als 10 % unter dem Ziel der `peakPosition` liegt (`volume.peakShortfallNote`, freigegeben). Kleinere Abstände sind normal (P3: 61 statt 62, weil die Entlastung in Woche 8 Woche 10 über I3 begrenzt). (4) Rennwochen-Anteil bei weniger als 7 Tagen: Tage vor dem Rennen / 6 (`taper.fullRaceWeekDaysBefore`). Folge: Bei 5k/10k mit Rennen Mo–Sa liegt die Taper-Reduktion außerhalb von −41 bis −60 % (z. B. Donnerstag-Rennen: Rennwoche nur 25 % des Peaks ohne Rennen); I13 wird deshalb nur für Rennwochen mit 7 Tagen geprüft. (5) Verlaufsform: Die Kurve von Woche 1 zur Peak-Woche nimmt die erste von vier Formen (smoothstep, linear, schneller Anstieg, so schnell wie erlaubt), die den Peak erreicht; freigegeben und als Regel in Spec §5.3 beschrieben (E, Review-Punkt 12). (2) präzisiert: Die Entlastung weicht von −20 % nur durch Rundung (z. B. 12 → 10) und durch die I3-Untergrenze `ceil(Vorwoche / 1,3)` ab, die in der Praxis nur bei 8 → 7 km greift.
  - Messwerte: Peaks P1–P6 = 15 / 30 / 61 / 50 / 96 / 43 km (Bereiche aus §13 gehalten). Property-Test mit 2 000 Eingaben und Seed 20261104 grün; zusätzlich einmalig 25 Seeds × 2 000 Eingaben ohne I3-Verstoß.
  - Nicht Teil dieses Schritts: Mindestumfang je Lauftage-Zahl (siehe Folgepunkt bei Schritt 6).

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

- **Umgesetzt (2026-11-04), Branch `fix/plan-contract-passthrough`:**
  - **Ursache Woche 1:** Der Server legt eine angebrochene Woche 1 unter dem Startdatum ab (`weekKeyOverrides`, `deterministicPlanGenerator.js:649`), `normalizeTrainingPlan` gruppiert nach Montag und fand die Meta nicht. Verloren gingen `wn`, `phase`, `label`, `focus`, `isRecoveryWeek` (der Server-Pfad `phasedFullPlanGenerator.js` schreibt kein `dates`; der Client-Generator `coachPlanMutations.ts:1096` schon, deshalb sind dort auch `dates` betroffen). Freigegeben: alle diese Felder sollen ankommen. Fix: `weekMetaKey` rechnet den Schlüssel auf den Montag um (rein kalendarisch in UTC, zeitzonensicher; zwei Stellen: `ingestWeek` und der `weeks[]`-Zweig).
  - **Zusätzlich zum Plan (freigegeben):** `kind` an `PlanSession`/`AiPlanSession` plus Durchreichen in `toPlanSession` und `normalizePlanSessionToAi` (Whitelists), sonst erreicht `kind` die Zonen-Funktionen nie. `meta.core`-Prüfung in `src/planV2/normalizePlanCoreMeta.ts`.
  - **Zonen:** `zoneLabelForSession(type, kind?, recoveryWeek?)` in `hrZones.ts`; ohne `kind` identisch zu `zoneLabelForSessionType` (Test über alle Typen × Entlastung); passt `kind` nicht zum `type` (z. B. nach einem AI-Patch, der nur `type` ändert, `applyPlanPatches` spreizt `{...session, ...changes}`), gilt der Typ. E bleibt in Entlastungswochen Z1. LR+M-Hinweis nur im `desc`, keine UI-Änderung. Neue Labels „Zone 3“ (76–82 %) und „Zone 4“ (82–88 %) teilen das Band „Zone 3–4“.
  - **Für Schritt 6 (Reviewer-Hinweis):** Konsistenztest „Kern-Ausgabe: `sessionType` == `SESSION_TYPE_OF_KIND[kind]`“ (`hrZones.ts`), sonst fällt die Zone still auf den Typ zurück. Die Abbildung steht dann doppelt (`CoreSessionType` und `SESSION_TYPE_OF_KIND`). Beim Spoho-Review klären: MLR in der Entlastungswoche ist mit `kind` Zone 2 (ohne `kind` als `easy` Zone 1); freigegeben war nur „E bleibt Z1“.
  - **Spoho-Review-Punkt (Nr. 13 in `plan-spec.md` §14):** Die Bänder für Zone 3/Zone 4 sind vorläufig; Daniels setzt M/T eher bei ~80–90 % bzw. 88–92 % HFmax an. Änderung nur in `HR_ZONE_PCT_BANDS` (`hrZones.ts`) plus Test `hrZones.test.ts`.
  - **Golden-Stand:** `src/planV2/__fixtures__/golden/*` wurde vor der Änderung mit dem alten Code erzeugt; `liveFixtureGolden.test.ts` prüft Normalisierung und Anzeige byte-gleich und je Fixture eine Mid-Week-Variante, bei der sich nur die Meta von Woche 1 ändert.

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
- **Umgesetzt (2026-11-04), Branch `feat/plan-core-pace`** (Spec auf v0.5, `CONFIG_VERSION` 0.5.0):
  - API (`src/planCore/pace.ts`): `vdotFromRace`, `predictRaceSeconds`, `vdotPenalty`, `trainingPaces`, `buildPaceProfile(inputs, todayYmd)`, `formatPace`, `formatPaceRange`. Alle Paces in ganzen s/km. Ergebnis ist `mode: "vdot"` (Paces, `racePace`, `goal`, `notes`) oder `mode: "beginner"` (nur E = 420 s/km und REC = E + 30 s; I, R, T, M nur als RPE). Schritt 6 entscheidet, wie T/M-Einheiten im Einsteiger-Modus ohne Pace dimensioniert werden.
  - Entscheidungen (freigegeben): Bezugsdatum für das Rennalter ist `todayYmd`; unplausible Rennangabe (Distanz außerhalb 1,5–42,2 km, Zeit ≤ 0, Wettkampf ohne Datum, VDOT vor oder nach Abschlag außerhalb 20–85) → Einsteiger-Modus mit Hinweis `recent-race-invalid`; Ziel leichter als die Form wird genutzt und auf E − 1 begrenzt, beim Marathon ersetzt es M und bleibt zusätzlich über T + 1 (I17); R = I − 15 s/km; Anteile E 0,66 (Mitte von 0,62–0,70), T 0,88, I 0,974, abgeleitet aus dem VDOT-Rechner (vdoto2.com, 4.11.2026) für VDOT 40–70 (Herkunft `E`, Spec §14 Punkt 15).
  - Abweichungen beim Bauen (bitte bestätigen): (1) Beim Marathon steht die Renn-/Zielpace in `paces.M`, bei anderen Distanzen bleibt `paces.M` die Formpace und die Zielpace steht nur in `racePace`. (2) Für VDOT 30 weicht der Rechner von Daniels-Gilbert ab (≈ VDOT 32–33); geprüft werden dort nur Rennzeiten und M, E/T/I/R stehen nicht in der Referenz (Spec §14 Punkt 14). (3) Eine Schätzzeit gilt für jede gültige Distanz, nicht nur 5k/10k (Schritt 9 begrenzt die Eingabe). (4) Die Referenz liegt in `src/planCore/__fixtures__/danielsReference.ts` statt unter `__tests__/` (Jest hielte sie dort für eine Testdatei) und ist importfrei (`planCorePurity.test.js`). (5) `gapSeconds` im Hinweis `goal-above-form` ist Formzeit minus Zielzeit, positiv, wenn das Ziel über der Form liegt.
  - Messwerte: P3 (10 km in 43:30): VDOT 47,1, T 4:28/km. Formel gegen Rechner (VDOT 40–70): M, T, I, R ±2 s/km, E im Bereich schnell − 2 bis langsam + 2, Rennzeiten ±2 s/km; Property-Test mit 500 Eingaben (I17, I18) grün.

### 5 · `feat/plan-core-weeks` — **MVP**, M–L (3 Tage), nach 2

§6 Wochenschablonen und Platzierung.

- **Dateien:**
  - `src/planCore/templates.ts`: Schablonen je Lauftage × Phase, Q-Maximum je Lauftage, Einsteiger-Modus (Q2 bei 4 Tagen erst ab Aufbau und nie für Einsteiger, so die Spec §6)
  - `src/planCore/placement.ts`: LR auf `longRunDay`, Q1 ≈ LR−3, Q2 ≈ LR+2; keine harten Folgetage über die Wochengrenze; nicht verfügbare Tage → Ruhe; Konflikt → Q2 entfällt, nie verschieben
  - `src/planCore/hard.ts`: `isHardSession` nach §1 (I, T, R, M ≥ 5 km, Rennen, LR ≥ 90 min)
- **Tests:** `templates.test.ts`
  - I6 (inkl. So → Mo), I7, I16 als Unit- und Property-Test über alle Kombinationen von 3–6 Tagen × `availableDays` × `longRunDay`
  - Unerfüllbare Kombinationen (z. B. 6 Tage aus 6 verfügbaren mit LR in der Mitte) liefern einen definierten Fehler oder Q2 entfällt
- **Abnahme:** Jede gültige Eingabe ergibt eine Wochenform ohne Verstoß.

- **Umgesetzt (2026-11-05), Branch `feat/plan-core-weeks`** (Spec auf v0.6, `CONFIG_VERSION` 0.6.2):
  - API: `layoutWeeks(inputs, planPhases(inputs), { beginner }) → WeekLayout[]` (je Woche `days: { ymd, weekday, slot }`, `runDayCount`, `qCount`, `hasLongRun`, `notes`), dazu `placeWeek`, `slotsFor`, `weekModeOf`, `resolveLongRunDay`, `isHardSession`, `isHardSlot`, `findHardSpacingViolations`. Slots: `LR, Q1, Q1L, Q2, MLR, E, REC, RACE, REST`. Der Kern entscheidet Rollen und Tage, nicht km, Pace, Q-Art (I/T/M/R) oder Strides: das ist Schritt 6.
  - Entscheidungen (freigegeben): (1) Long Run, jedes Q und das Rennen gelten bei der Platzierung als hart, weil Dauer und km noch fehlen; Schritt 6 kann nur weicher machen (Test `isHardSession` ⊆ Annahme). (2) Kein LR in den 7 Tagen bis zum Rennen statt in der Kalenderwoche; der LR der Vorwoche entfällt dann mit Hinweis `no-long-run-in-window`, I10-Ausnahme. (3) Liegt der LR-Tag in Woche 1 vor dem Start, hat Woche 1 keinen LR. (4) Q-Art-Wahl bleibt in Schritt 6, Q1/Q1L belegen im Einsteiger-Basis-Fall einen Q-Slot. (5) Taper-Woche = Aufbau ohne Q2 und MLR; Rennwoche mit Lauftage − 1 Läufen inklusive Rennen (seit dem Nachtrag unten bei höchstens 3 Lauftagen alle Lauftage), höchstens 1 Q (Renntag−3, Marathon −4), ohne zulässigen Tag kein Q (`q-dropped-race-gap`, I13-Ausnahme). Dazu die sechs Annahmen (Einsteiger nie Q2 bei 4 Tagen, MLR-Abstand = Tagesdifferenz ≥ 2 zyklisch, LR-Tag-Vorgabe So/Sa/letzter, ungültiger LR-Tag = `invalid-input`, Entlastungswoche layoutneutral, MLR nur bei 6 Tagen).
  - Neue harte Regel: Der MLR liegt nie zwischen zwei harten Tagen, auch nicht über die Wochengrenze (`prevMlrAfterHard`, `nextHard`). Weiche Zielgröße davor: MLR nicht direkt neben einem harten Tag, dann MLR weit vom LR. Ergebnis bei 6 Tagen Aufbau HM/M: Mo REC · Di Q2 · Mi MLR · Do – · Fr Q1 · Sa E · So LR (Q1 weicht von LR−3 auf LR−2 aus).
  - Rangfolge im Löser (in `placement.ts` dokumentiert): mehr Q, dann MLR behalten (Q hat Vorrang vor MLR, **Auslegung** der Reihenfolge „erst Q2, dann Q1, danach MLR"), MLR-Nachbarschaft, MLR-Abstand, Q-Soll-Tage, wenig direkt aufeinanderfolgende Lauftage, wenig Ruhetage nach hartem Tag, REC nach dem LR, frühere Wochentage.
  - Abweichungen beim Bauen (bitte bestätigen): (1) Woche 1 startet mit dem Zustand einer vollen Vorwoche gleicher Art (zwei Probeläufe), sonst wählt der Löser dort andere E-Tage als in den Folgewochen (Beispiel: Mo/Di/Fr/Sa/So frei, 4 Tage Basis: E am Sa statt Mo/Di). Der Property-Test hält fest: Woche 1 ist der Ausschnitt der Folgewoche gleicher Art (ohne Probelauf 3 Abweichungen in 2.000 Plänen). (2) Neue Config-Einträge `placement.mlrNoSandwich` und `raceWeek.noLongRunDaysBefore` (Herkunft `E`, Review-Punkte 17/18). (3) `package.json`: ESLint-Override für `src/planCore` nimmt `__fixtures__` aus (Testhilfen brauchen `../`-Importe). `src/__tests__/planCorePurity.test.js` erlaubt dort `../`-Importe, solange der Zielpfad in `src/planCore` liegt; Uhr-, Zufall- und Umgebungsprüfung gelten weiter. (4) Prüfer und Profil-Eingaben liegen in `src/planCore/__fixtures__/` (`layoutChecks.ts`, `profiles.ts` mit P1–P6; Schritt 6/7 nutzen sie weiter). (5) Der Löser setzt `placement.minEasyDaysBetweenHard` = 1 voraus (Zustand der Vorwoche = ein Tag), Q-Soll-Tage kommen aus `q1DaysBeforeLongRun`/`q2DaysAfterLongRun`; ein Test hält beides fest. (6) Strides in der Basis bei 3 Lauftagen (`weekTemplates.stridesInBase3Days`) wird in Schritt 6 umgesetzt, das Layout kennt keine Strides.
  - **Nachtrag nach dem P1–P6-Review (2026-11-05):** Rennwoche mit höchstens 2 Ruhetagen direkt vor dem Rennen (soweit `availableDays` es zulassen); E/REC bevorzugt an Renntag−2, dann −1, statt am Wochenanfang (Rang direkt nach dem Q-Erhalt, vor MLR- und Abstandsregeln); bei höchstens 3 Lauftagen hat die Rennwoche alle Lauftage inklusive Rennen (Spec §5.4: Untergrenze N−1 bleibt eingehalten). Neue Config-Einträge `raceWeek.maxRestDaysBeforeRace` (2) und `raceWeek.fullRunDaysUpToRunDays` (3). Der Prüfer verlangt in der erschöpfenden Rennwochen-Prüfung: keine Lücke von 3 oder mehr Ruhetagen vor dem Rennen, wenn Renntag−1 … −3 verfügbar und frei wäre, und kein E/REC vor Renntag−2, solange −1/−2 verfügbar und frei sind. Rennwochen-Zeilen: P1 `– – – Q1 E – RACE`, P2 `– – – Q1 E – RACE`, P3 `– – – Q1 E E RACE`, P4 `– – Q1 – E – RACE`, P5 `E – Q1 – E E RACE`, P6 `– – Q1 – E – RACE`. Die Rangstufe „Renntag−2 vor −1" ist äquivalent zum Tie-Break der Folgeregeln (Mutation bleibt unentdeckt), sie bleibt als ausdrückliche Absicht stehen.
  - **Nachtrag 2 (P3-Korrektur, 2026-11-05):** Rennwoche mit höchstens 2 Ruhetagen am Stück, auch am Wochenanfang (`raceWeek.maxRestDaysInRow` = 2, weiche Regel). Rang: Q-Erhalt → Ruhetage direkt vor dem Rennen → Ruhetage am Stück → E-Bevorzugung an Renntag−2/−1 → Q-Soll-Tag. Folge: Bei 5k/10k/HM rückt das Q1 von Do (Renntag−3) auf Mi (Renntag−4), weil die E-Bevorzugung im Rang vor dem Q-Soll-Tag steht. Rennwochen-Zeilen jetzt: P1 `– – Q1 – E – RACE`, P2 `– – Q1 – E – RACE`, P3 `– – Q1 – E E RACE`, P4/P5/P6 unverändert. Alternative (Q-Soll-Tag vor der E-Bevorzugung, Q bleibt auf Do): P1 und P2 `E – – Q1 – – RACE`, P3 `E – – Q1 E – RACE`, P4–P6 unverändert; nicht übernommen. Zur Alternative: Bei Q auf Do muss das E (P1/P2) wegen „höchstens 2 am Stück" in Mo–Mi liegen, der Montag kommt vom Tie-Break „frühere Wochentage"; an Renntag−1/−2 liegt dann kein E. Eine Form mit E am Dienstag (`– E – Q1 …`) liefert keine der beiden Rangfolgen. Der Prüfer bildet die Rangfolge nach (alle Verteilungen mit gleicher Zahl Läufe und zulässigem Q werden aufgezählt). Die Strafe „Ruhetage direkt vor dem Rennen" ist im getesteten Raum zur Streak-Regel äquivalent (ein Tail von mindestens 3 Ruhetagen ist immer auch eine Serie von mindestens 3); sie bleibt wegen der festgelegten Reihenfolge stehen.
  - **Einschränkung (nur direkter `placeWeek`-Aufruf):** Die Streak-Zählung der Rennwoche beginnt am Montag. Bei einem Teilfenster (`firstDayYmd` nach Montag) zählen die Tage davor als Ruhetage. Über `layoutWeeks` ist das nicht erreichbar (Mindestplanlänge 4 Wochen, die Rennwoche beginnt immer am Montag); kein Test deckt den direkten Aufruf ab.
  - Review-Punkte in `plan-spec.md` §14: 16 (Entfällt Q2 in der Entlastungswoche?), 17 (Long-Run-Sperrfenster und Rennwoche), 18 (Hart-Annahme, MLR-Sandwich, Rangfolge).
  - Messwerte: Jest 188 Suites / 61.828 Tests grün (Baseline `main`: 183 / 61.747), `tsc` und ESLint auf `src/planCore` ohne Meldung, `CI=false npm run build` grün. Erschöpfender Test: 11.020 Wochenformen (alle Mengen verfügbarer Tage × LR-Tag × Lauftage × Art × Zustand) und 5.200 Rennwochen ohne Verstoß; Property-Test 2.000 Pläne (Seed 20261105, jeder Wochentag für Start und Rennen) ohne Verstoß. Mutationen lassen die Tests rot werden: Sandwich-Regel, Zustand der Vorwoche, `nextHard`, `prevMlrAfterHard`, Sperrfenster, Rennabstand, MLR-Abstand zum LR, Probelauf von Woche 1, Q-Soll-Tage, die weichen Rangstufen (MLR neben hartem Tag, MLR weit vom LR) die Rennwochen-Rangstufen „höchstens 2 Ruhetage am Stück" (Strafe aus und Config-Wert ignoriert) und „E an Renntag−1/−2". Äquivalent und deshalb nicht erkannt: die Strafe „Ruhetage direkt vor dem Rennen" (ein Tail von mindestens 3 Ruhetagen ist immer auch eine Serie von mindestens 3; in 66.400 Rennwochen identisch, ein allgemeiner Beweis ist es nicht), „Renntag−2 vor −1", Q2-Soll-Tag LR+1 statt LR+2 (LR+1 ist als Nachbartag des Long Runs gesperrt, der Löser weicht auf LR+2 aus) und `nextHard` vor dem Montagsrennen (`lrOk`/`qOk` sperren den Sonntag schon).
  - **Für Schritt 6/7 (Hinweise):** `LayoutNote`-Codes (`q1-dropped`, `q2-dropped`, `q-dropped-race-gap`, `mlr-as-e`, `no-long-run-in-window`) gehören in `meta.core` oder ins Log; ein Slot, der zu E wurde, steht bereits als `E` im Layout. Die Rennwoche hat bei Rennen Mo–Mi oft kein Q (kein Fehler). `placeWeek` wirft `invalid-input: week-layout`, wenn keine Variante lösbar ist; über `layoutWeeks` ist das in den getesteten Domänen unerreichbar (die Zustände `prevHard` + Montags-LR bzw. Montagsrennen schließt `nextHard` der Vorwoche aus). Build-Hinweis: `npm run build` führt `cap sync ios` aus und schreibt dabei `ios/App/CapApp-SPM/Package.swift` um (im Worktree zurückgesetzt, nicht committet).

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
- **Abnahme:** P4 hat LR-Peak 26–28 km (nach Freigabe 2026-11-05: 24–25 km), P5 hat T ≤ 10 km und LR-Peak 30–34 km. Kein Tempo > 10 % der Woche (T; M-Läufe dürfen nach §7 bis min(29 km, 110 min) und erscheinen in der App als `tempo`).
- **Folgepunkt aus Schritt 2:** `volume.minWeekKmPerRunDay` (Herkunft E, Review-Punkt). Schritt 2 kennt keine Pace und keine Einheiten-Minuten und setzt nur `weekOneMinKm` = 5 km als Schutz vor 0 km. Bei sehr kleinem Ist-Umfang (etwa unter 3 km je Lauftag) passen die Mindestdauern aus §7 (E ≥ 25 min, REC ≥ 20 min) nicht in die Woche. Hier festlegen: Mindest-Wochen-km = Lauftage × Mindest-km je Lauftag; `planVolume` hebt Woche 1 darauf an oder `distribute.ts` meldet einen Fehler.
- **Umgesetzt (2026-11-05), Branch `feat/plan-core-sessions`** (Spec auf v0.7, `CONFIG_VERSION` 0.7.0), Teilcommits 6a–6f:
  - API: `planSessions(inputs, todayYmd, { peakPosition }) → { pace, paces, volume, layouts, weeks, minWeekKm, longRunPeakTargetKm }` mit je Woche `sessions` (eine `CoreSession` je Plantag: `kind`, `km` = Summe der Bausteine, `segments`, `paceBand`, `qualityKm`, `notes`), `totalKm`, `targetKm` und `notes` (`week-km-reduced`, `week-km-raised`, `long-run-raised-to-min`). `renderSession` liefert `sessionType`, `intensity`, `title`, `desc` (Parser-Format), `pace` (`m:ss–m:ss`) und `structured` (nur `interval`). Module: `longRun.ts`, `qTypes.ts`, `sessions.ts`, `distribute.ts`, `raceWeek.ts`, `planSessions.ts` (Orchestrierung, zusätzlich zum Plan), `text.ts`; `paceBands` in `pace.ts`.
  - Entscheidungen (freigegeben 2026-11-05): (1) Rennwoche mit allen Lauftagen inkl. Rennen (`raceWeek.fullRunDaysUpToRunDays` = 6); Restdefizit → Woche kürzen + `week-km-reduced`, I13 als Mittel der Taper-Phase, Einzelwochen als Warnung. Layout-Tests und Snapshots aus Schritt 5 angepasst (P2–P5). (2) Abnahme P4 LR-Peak 24–25, P6 23–24. (3) `minWeekKm` als Option von `planVolume` (Änderung an Schritt 2). (4) Renntempo HM/10k als `T`, 5k als `I`. (5) Q-Budget 20 %/15 % (3–4 Tage)/25 % hart; Q2 → E + Strides bei aufgebrauchtem Budget, in der Entlastungswoche und bei Einsteigern mit 5–6 Tagen. (6) E-Grenze in Wochen ohne LR: letzter LR. (7) Taper-LR ≤ 60 %. (8) I9-Ausnahme nach Entlastung. (9) Pace-Bänder E aus 0,70/0,62, sonst ±5 s/km. (10) Einsteiger-T/M: Der Parser verträgt den Klammerzusatz „(ca. 10 min nach Gefühl)“ (Rundlauf-Test grün), kein eigenes Feld. Zusätzlich: HM Spezifisch Q2 wechselt I / T; Marathon-M-Block ≤ 10 km, wenn das Q ≤ 2 Tage vor dem LR liegt (Test mit P5 6 Tage = Fr vor So und P5 mit 5 Tagen = Do vor So).
  - Abweichungen beim Bauen (bitte bestätigen): (1) **Long-Run-Anteil gegen die geplanten Wochen-km** (`planVolume`), nicht gegen die nach den E-Limits gekürzte Woche; angebrochene Woche 1 gegen das Vollwochen-Äquivalent. Gegen die tatsächliche Woche schrumpft P6 auf ≈ 33 km/Woche und LR-Peak 20,7 km (unter der Abnahme), weil E bei 3 Tagen auf 75 min begrenzt ist. Q-Limits (I12) und Q-Budget (I8) gelten gegen die tatsächliche Woche (gekürzte Wochen werden mit ihren tatsächlichen km neu gerechnet). Review-Punkt 29. (2) **Q1 entfällt nicht wegen des Budgets:** mindestens ein Block von 5 min (I bzw. R: Mindest-Wiederholungen), solange Typ-Limit und 25 % es zulassen; sonst E + Strides mit `q-softened-budget` bzw. `q-softened-room` (I13-Ausnahme). Folge: P6-Rennwoche M-Block 0,9 km. (3) **Ziel des längsten Long Runs** = 30 % des Peak-Wochenumfangs, begrenzt auf die Peak-Ziele (P1 8, P2 12, P3 18,3, P4 25, P5 30, P6 23,6); der Marathon hält das Ziel 2 Wochen; beginnt das Plateau nach einer Entlastung, gehört die Woche davor dazu (P4: 3 LR ≥ 24 km). (4) Neue Config-Einträge (alle E, Review-Punkte 19–31): siehe `config.ts` und Spec §14. (7) **Long Run auf das Minimum angehoben** (`long-run-raised-to-min`, Review-Punkt 31a): reicht der Long Run nicht für die Mindestdauern der übrigen Läufe (E ≥ 25 min, ≤ 75 % des LR), liegt er genau auf diesem Minimum, auch über Start-, Steigerungs-, Entlastungs-, Taper- und Anteilsgrenze (I9-Ausnahme); 1 165 Wochen in 495 der 2 000 Property-Pläne. Der Prüfer verlangt dann LR = Minimum. (8) `minWeekKm` hebt Peak-Korridor und Entlastungswochen (I5 ≤ max(Grenze, `minWeekKm`), Entlastung < Vorwoche oder = `minWeekKm`); eigener Property-Test in `distribute.test.ts`. (5) Wochen werden schrittweise weicher, wenn die Mindestdauern nicht passen: MLR → E, Q2 → E + Strides, Q1 → E + Strides, zuletzt Woche größer. (6) `SESSION_TYPE_OF_KIND` steht jetzt in `text.ts` und in `hrZones.ts`; der Konsistenztest (`src/__tests__/planCoreSessionText.test.ts`) prüft über `zoneLabelForSession`, dass mit `kind` die Zone der Art kommt.
  - **Befund für das Review (Spec §14 Punkt 29):** Im Property-Test (2 000 Pläne) liegen bei plausiblen Eingaben (Standardwert für den längsten Lauf) volle Wochen ≥ 10 % unter dem Ziel: 3 Tage 59 %, 4 Tage 44 %, 5 Tage 8 %, 6 Tage 14 %. Ursachen: Long-Run-Aufbau (Start 30 % + 2 km, +2–3 km/Woche) zusammen mit E ≤ 75 % des LR; E ≤ 75 min; Entlastung LR −25 % bei Woche −20 %. Bei den Referenzprofilen betrifft das nur P6 (und die Rennwochen von P2/P3/P4/P6). Optionen: Vorgabe für den längsten Lauf nach Lauftagen, E-Grenze lockern, oder `planVolume` die Long-Run-Tragfähigkeit vorab geben.
  - Messwerte: Property-Test 2 000 Pläne (Seed 20261107) ohne Verstoß gegen I1, I2, I6, I8–I15, I17; Taper-Mittel in 215 von 277 geprüften Plänen im Bereich, 62 außerhalb mit Hinweis (Limits/Mindestdauern). Parser-Rundlauf über P1–P6 und 300 Zufallspläne (306 Fälle): km ±0,1 und Bausteine identisch.
  - **Nachtrag v0.8 (freigegeben 2026-11-05, `CONFIG_VERSION` 0.8.0):** (1) Tragfähigkeit: `planVolume` bekommt `capacity` und plant nur, was `planSessions` liefern kann (zwei Durchläufe: ohne Tragfähigkeit für Wochenraster und Long-Run-Ziel, dann mit); `PlanVolumeWeek.curveKm` hält den Wert davor (Bezug des Long-Run-Anteils). Angebrochene Woche 1 deckelt den Verlauf nicht (sonst 0 km ohne Lauftag im Fenster). (2) Long-Run-Anteil gegen `curveKm`, den Wert **vor** der Tragfähigkeit: freigegeben war „geplante statt tatsächliche Wochen-km“ vor Einführung der Tragfähigkeit; dass der Long Run bei 3 Tagen dadurch über 55 % der gelieferten Woche liegt (P6 W16: 23,6 von 38,8 km = 61 %), ist **zu bestätigen**. (3) Long Run nie über seine Grenzen (`long-run-raised-to-min` entfällt, I9 ohne Ausnahme); E ≤ max(75 % LR, E-Mindestdauer), nie > LR; ist der LR kürzer als die E-Mindestdauer, wird E auf seine Länge gekürzt (`e-shortened-to-long-run`, I11 vor I2). `minWeekKm` = Lauftage × E 25 min. (4) Mindestgrößen M ≥ 3 km, T ≥ 10 min, I ≥ 3, R ≥ 4 Wiederholungen (`library.m.minKm`, `library.t.minMinutes`; `intensity.minBlockMinutes` entfällt). (5) Ziel des längsten LR = Anteilsgrenze × Peak-Woche (`longRun.targetShareOfPeakWeek` entfällt); Folge: Abnahme P2 10–15 und P3 18–22 (zu bestätigen). Folgen der Tragfähigkeit für §5.3 (Peak nicht immer in der Peak-Woche, Rückgänge ohne Entlastung, Entlastung tiefer als −20 %) sind **zu bestätigen**; I3/I4/I5 auf dem gelieferten Volumen prüft der Property-Test. Messwerte und Messmethode in Spec §14 Punkte 21, 29, 31, 32.
  - **Nachtrag v0.9 (freigegeben 2026-11-05, `CONFIG_VERSION` 0.9.0):** (1) Abnahme P2 10–15, P3 18–22 bestätigt. (2) E bei 3 Lauftagen HM/M bis 90 min (`library.e.minutesMaxFewDays`). (3) Monotoner Verlauf in `planVolume`: Rückwärtsdurchlauf nach dem Kappen (`monotoneCeilings`), Obergrenzen nur kleiner, neu rechnen bis zum festen Punkt (`simulateMonotone`, höchstens 200 Runden); Entlastung geplant −20 % abgerundet, geliefert −20 bis −30 % (`volume.recovery.maxReduction`); I3-Untergrenze auf 0,1 km. Bezug des Long-Run-Anteils jetzt der Plan ohne Tragfähigkeit (`SessionPlan.uncappedVolume`), weil `curveKm` die gesenkten Wochen nachzieht (Seed 15: Peak-Woche 39 statt 45 km); bestätigt. Property-Test prüft: keine Aufbauwoche kleiner als die letzte Aufbauwoche davor, Peak zuletzt, Entlastung im Band, auch auf den sichtbaren Wochen (`totalKm`); ohne Ausnahme (Runde 3: statt eine Woche bis zur Peak-Woche anzuheben, werden E/REC bis 15 min gekürzt, `e-shortened-to-fit-week`: neue Stufe 4 in `assembleWeekAt`, nur außerhalb von Taper und Rennwoche und nur, wenn Stufe 3 die Woche anheben würde; E-Obergrenze bleibt max(75 % LR, 25 min); Pläne ohne angehobene Woche unverändert; die Prüfung schließt die angebrochene Woche 1 ein; vorher 9 nicht monotone Pläne, jetzt 0). (4) Harte Untergrenze 15 min (`library.easyHardMinMinutes`) für E/REC und den Long Run (`long-run-raised-to-minimum`, einzige I9-Ausnahme; bestätigt). (5) P6-Rennwoche ohne Q akzeptiert. (6) Q1 der Entlastungswoche × Faktor der Woche (`q1-scaled-recovery-week`); P5 W12 7,9 km, bestätigt. Runde 3 (2026-11-05): Anteilsbezug `uncappedVolume`, Long Run auf 15 min und die Kosten der Monotonie akzeptiert (Kosten als Spoho-Review-Punkt 37). Messwerte vorher/nachher in Spec §14 Punkte 29, 31–36.
  - **Für Schritt 7:** `buildPlan` übernimmt `planSessions` und `renderSession`; `checkCorePlan` kann `__fixtures__/sessionChecks.ts` als Vorlage nehmen (I5 mit `minWeekKm`, I9-Anteil gegen `planVolume`). IDs `pc-<ymd>-<kind>`; Ruhetage als `rest`-Workouts oder weglassen (offen). Die Hinweise der Wochen und Einheiten gehören in `meta.core` oder ins Log.

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
- **Umgesetzt (Branch `feat/plan-core-invariants`, zwei Teilcommits 7a/7b, nicht gemergt; Entscheidungen vom 2026-11-05):**
  - **7a `src/planCore/invariants.ts`:** `checkPlan(SessionPlan, inputs) → { violations, errors, warnings }`. Ein Verstoß hat Code (I1–I22 oder `QMIN`/`BEGINNER`/`VOLUME`/`LAYOUT`/`PLAN`), Regel, Schwere, Woche, Tag, Ist/Soll, Einheit. `INVARIANT_RULES` (120 Regeln) legt die Schwere fest:
    - **error:** Sicherheitsgrenze, verletzte Vorgabe des Nutzers oder für die App kaputter Plan. Dazu gehören I1, I2-Struktur (Art, ≥ 15 min, Hinweis-Missbrauch), I3, I5-Deckel, I6, I7, I8, I9 komplett, I12, I14, I15 (Abstände, letzte Tage), I16, I17, I18, I21, I22, Einsteiger mit I/R, Strukturfehler, doppelte IDs.
    - **warning:** I2-Dauern, I4 inkl. Monotonie, I5-Entlastungsband, I10, I11, I13, Mindestgrößen der Q-Einheiten, weiche Rennwochen-Regeln, Konsistenz des Volumenplans.
  - **Toleranz:** Jede error-Grenze auf Zahlen hat eine Toleranz (`INVARIANT_TOLERANCE`: 0,1 km, 0,5 Prozentpunkte, 1 min). Liegt die Überschreitung innerhalb, ist es warning, darüber error; Rundungsrauschen (1e-6 km bzw. 0,05 min) ist kein Verstoß. Ohne Toleranz bleiben nur Struktur-, Ja/Nein- und Ganzzahl-Regeln (Tage, Anzahl, Reihenfolge der Paces, Konsistenz der Zielpace, Gültigkeit eines Hinweises); ein Test hält die Liste fest.
  - **Begründete Abweichungen:** Wo ein Hinweis des Kerns erklärt, warum eine Regel nicht greift, erscheint das als warning mit eigener Regel und `reasoned: true`. Hebt der Hinweis eine error-Regel auf, rechnet der Prüfer die Bedingung nach: E/REC unter der Mindestdauer (genau auf LR-Länge bzw. nur bis zur Peak-Woche, ≥ 15 min), Long Run auf 15 min (nur wenn Anteil, 180 min oder Verlauf darunter liegen), Mindest-Wochen-km (aus Lauftage × 25 min E, nicht aus dem Plan) und E über 75 % des LR. Hinweise, die nur weicher machen (Q → E + Strides, MLR → E) oder die Abweichung vom Volumenplan erklären (Wochen-km), genügen als Begründung. Hinweise, die selbst die Regel sind (Q2 der Entlastungswoche, Einsteiger, Taper-Long-Run, M-Block vor dem LR, Q1-Faktor), erscheinen nicht. Häufigkeit in 2 000 Property-Plänen (Seed 20261107), je Regel Meldungen und betroffene Pläne:

    | Regel | Meldungen | Pläne |
    |---|---|---|
    | `I11/e-above-75-percent-long-run` | 8 130 | 603 |
    | `I2/q-softened` (Q → E + Strides wegen Budget/Platz) | 5 552 | 1 203 |
    | `I13/taper-q-excused` | 2 384 | 1 861 |
    | `I2/e-shortened-to-fit-week` | 2 253 | 213 |
    | `I5/min-week-km-raised` | 1 472 | 414 |
    | `I2/e-shortened-to-long-run` | 1 335 | 217 |
    | `VOLUME/week-km-raised` | 1 083 | 836 |
    | `I2/mlr-as-e` | 886 | 156 |
    | `I10/no-long-run-in-window` | 830 | 775 |
    | `VOLUME/week-km-reduced` | 359 | 359 |
    | `I13/taper-mean-excused` | 45 | 45 |
    | `I9/long-run-raised-to-minimum` | 38 | 33 |

    P1–P6: 0 errors und 0 unbegründete warnings. P3 hat gar keine Meldung; P1 hat 11 begründete, P2 6, P4 6, P5 3 und P6 2 (Snapshot in `invariants.test.ts.snap`).
  - **Weitere Exporte:** `checkVolume`, `checkWeekLayout`, `checkPlanLayouts`, `taperMeanOf` und `toLogEntries` (für Logs nur Code, Regel, Woche und Schwere; kein Tag, keine Zahlen).
  - **Abgelöste Prüfer:** `__fixtures__/layoutChecks.ts`, `__fixtures__/sessionChecks.ts` und `violations()` aus `volume.test.ts` sind darin aufgegangen; in volume.test bleibt nur die exakte Entlastungstiefe ohne Tragfähigkeit. Die Snapshot-Helfer stehen in `__fixtures__/compact.ts`.
  - **Tests:**
    - `invariants.property.test.ts` (ersetzt `sessions.property.test.ts`): 2 000 Pläne mit 0 errors und 0 unbegründeten warnings, I20 (jeder Plan zweimal gerechnet), Abdeckung der Hinweise.
    - `invariants.test.ts`: Mutation je Regel; begründete Regeln in echten Plänen und ohne Hinweis als unbegründete Regel; Toleranz beidseitig für km, Anteil, Minuten und Untergrenze; P1–P6.
  - **Abweichungen vom Entwurf (zu bestätigen):**
    - (1) Das Entlastungsband (I5 recovery-*) ist warning statt error: Es ist keine Sicherheitsgrenze, der Deckel `I5/cap` bleibt error.
    - (2) I16-Rennwochenzahl: Unter dem Spec-Minimum (Lauftage − 1) ist es error, nur die Abweichung von der genauen Zahl der Platzierung ist warning.
    - (3) I15-Rangregeln der Rennwoche (höchstens 2 Ruhetage vor dem Rennen bzw. am Stück, E an Renntag−1/−2) sind warning: Die Spec nennt sie weiche Regeln (§5.4, §6). Die Abstände (Q, Long Run, harte Tage vor dem Rennen, 30 min in den letzten 2 Tagen) bleiben error.
    - (4) P1–P6 haben 0 errors und 0 unbegründete warnings, aber begründete warnings (P1 11, P2 6, P4 6, P5 3, P6 2, P3 keine). Die Freigabe nennt „P1–P6 0 Verstöße“.
  - **Korrektur im Kern (gefunden durch den Prüfer):** `long-run-raised-to-minimum` stand auch dann, wenn nur der Wunschwert des Verlaufs unter 15 min lag, die Grenzen aber nicht (3 Fälle, jeweils Woche 2 nach einem angehobenen Long Run). Der Hinweis steht jetzt nur, wenn die Grenzen selbst darunter liegen (`longRunLimitKm`); die km ändern sich nicht.
  - **7b `src/planCore/buildPlan.ts`:** `assemblePlan(SessionPlan, inputs, rules) → CorePlan`, `buildPlan(inputs, rules, todayYmd)` und `buildCheckedPlan(...) → { plan, check }` (`checkPlan` + `checkAssembledPlan`).
    - Eine Einheit je Plantag, Ruhetage als `rest`-Workouts.
    - ID `pc-<ymd>-<kind>`; `dateIso` ist Mittag UTC.
    - Woche: `startIso` Montag; `totalKm` als Summe wie in `deriveWeeksFromWorkouts`.
    - Label „Woche N · Phase“, `dates` „8. Mär ff.“ ab dem ersten Plantag, `focus` je Phase, Rennwoche „Rennwoche – frisch an den Start“, Entlastung „Entlastungswoche – …“ mit `isRecoveryWeek`.
    - `meta.core` mit den Eingaben in normalisierter Form (verfügbare Tage Mo–So); `meta.volumeNote` bei `peak-not-reached`.
    - `rules` werden nur gespeichert.
  - **`checkAssembledPlan(CorePlan, inputs)`:** I1 (Wochensumme; `workouts` = Workouts der Wochen; jedes Workout in der Woche seines Montags), I14, I21, I22, eindeutige IDs.
  - **Tests 7b:**
    - `buildPlan.test.ts`: P1–P6, Form, angebrochene Woche 1, `volumeNote`, I20, Mutation je Regel, 2 000 Pläne gebaut und geprüft.
    - `src/__tests__/planCoreBuildPlanContract.test.ts`: P1–P6 und 200 Zufallspläne bestehen `normalizeTrainingPlan(plan)` deep-equal `plan`, `validateTrainingPlanV2Integrity` und `deriveDisplayPlan`.
  - **Offen für später:**
    - `dateIso` Mittag UTC landet unter `TZ=Pacific/Auckland` beim Gruppieren der App im falschen Wochentag; das ist der vorbestehende Zeitzonenpunkt `fix/timezone-tests`, nicht neu geprüft.
    - Der Branch-Name weicht vom Plan ab (`feat/plan-core-assemble`); Inhalt wie hier.
    - `docs/plan-core-profiles.md` (Vergleich P1–P6 gegen je einen Literaturplan, Abnahme von Schritt 7 und Grundlage fürs Spoho-Review) fehlt noch: Die Werte der Literaturpläne (Daniels, Pfitzinger, Hansons) brauchen die Quellen und werden nicht aus dem Gedächtnis eingetragen. **v3:** nach Schritt 12, vor dem App-Store-Release.

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
- **Umgesetzt (2026-11-06), Branch `feat/onboarding-plan-inputs`, nicht gemergt; Gerätetest auf dem iPhone 13 offen:**
  - **Wizard (7 statt 5 Schritte):** 1 Distanz & Ziel (nur 5 km, 10 km, HM, M) → 2 Rennen (Renndatum mit Prüfung der Mindest-Planlänge, Start, Name) → **3 Trainingswoche** (Lauftage 3–6, verfügbare Tage Mo–So, alle vorausgewählt, Long-Run-Tag nur aus den verfügbaren, Vorgabe So/Sa/letzter wie `resolveLongRunDay`) → **4 Form** (Wochen-km als Zahl 0–150, längster Lauf optional 0–45 mit angezeigtem Standardwert, Rennergebnis „Wettkampf“ mit Distanz/Zeit/Datum, „Schätzung“ nur 5/10 km, „Keine Angabe“ = Einsteiger-Modus) → 5 Präferenzen → 6 Kalender → 7 Zusammenfassung mit allen neuen Angaben.
  - **Dateien:** `src/onboarding/onboardingPlanInputs.ts` (neu: Typen, `weeklyKmRangeFromKm`, Prüfungen, `raceDateTooEarlyMessage`, `toProfilePlanInputs`, `readPlanInputsFromPreferences`), `src/components/Onboarding.tsx`, `src/onboarding/marathonPreferencesOnboarding.ts` (`DISTANCE_SHORTCUTS` ohne 15 km, mit `coreDistance`; `planInputs` in Payload und Preferences), `planOwnedPreferences.ts` und `onboardingPlanIsolation.ts` (`planInputs` plan-eigen), `runtimePersistenceTypes.ts`, `claudePlanService.ts` (`PlanGenerationProfile`), `src/AppMain.tsx` (`initialPlanInputs` aus den Preferences), `api/_lib/inputLimits.js` (`cleanPlanInputs`, `legacyPlanProfile`), beide Routen unter `api/onboarding/`.
  - **Kern:** `earliestRaceDate(distance, startYmd)` (`phases.ts`), `defaultLongestRecentRunKm` + Config `inputs.longestRecentRunDefaultKm` (E, Review-Punkt 39), `buildPlan` speichert kein `freeText`, `normalizePlanCoreMeta` entfernt es. P1–P6 und Property-Pläne unverändert (der Kern-Fallback ohne Angabe bleibt 30 %/min. 5; das Onboarding schickt den Standardwert ausdrücklich mit). `CONFIG_VERSION` bleibt 0.9.0.
  - **Profil an den Server** (zusätzlich, nur wenn gültig): `runDaysPerWeek`, `availableDays` (Mo–So), `longRunDay`, `currentWeeklyKm`, `longestRecentRunKm` (Angabe oder Standardwert), `longestRecentRunKmIsDefault`, `recentRace` (`{ distanceKm, timeSeconds, dateYmd|null, estimated }` oder `null`). Ungültige Werte fallen einzeln weg; ein alter Client bekommt genau das alte Profil.
  - **Abweichung vom Plan (Befund beim Bauen):** Der Struktur-Aufruf des heutigen Pfads schickt das Profil komplett als JSON an Claude (`claudePlanGenerator.js` `callClaudeForStructure`). Damit der heutige Pfad unverändert bleibt, bekommen beide Routen das Profil ohne die Plan-Eingaben (`legacyPlanProfile`). **Schritt 10 muss dem Kern das volle Profil geben** und nur dem Rückfall das gekürzte.
  - **Kompatibilität:** `weeklyKmRange` aus der Zahl, Obergrenze inklusive (20 → „0–20 km“, 20,1 → „20–40 km“, > 80 → „80+ km“); der alte Generator nimmt die Obergrenze als Deckel. Eigener Test gegen `parseWeeklyKmTarget`/`parseWeeklyKmRangeMax`.
  - **Persistenz:** `planInputs` liegt wie die übrigen plan-eigenen Felder nur im localStorage (Supabase `profiles` hat nur 4 Spalten). Keine Migration. Folge: Auf einem neuen Gerät gibt es nichts vorzufüllen.

### 10 · `feat/plan-core-server` — **MVP**, M (1,5 Tage), nach 7 und 9

Kern im Vercel-Handler hinter dem Schalter.

- **Dateien:**
  - `api/onboarding/generate-plan-full.js:24-45` (bzw. die `.ts`-Funktion bei Variante A):
    - `PLAN_CORE_MODE=on`: `buildCheckedPlan(inputs, EMPTY_RULES, todayYmd)` (Schritt 7b). Kein Claude-Aufruf. Bei `check.errors > 0` gibt es keinen Kern-Plan; warnings verhindern nichts. Ins Log nur `toLogEntries(errors)` (Code, Regel, Woche; kein Tag, keine Zahlen).
      - **Rückfall bei error (freigegeben 2026-11-05, bis Schritt 13):** der alte Generator (`api/_lib/phasedFullPlanGenerator.js` bzw. der deterministische Pfad), nicht der lokale vereinfachte Plan; der kommt ab Schritt 11 aus demselben Kern und hätte denselben Fehler. Jeder Rückfall erhöht einen Zähler (Log-Kennzahl `planCoreFallbacks` mit Codes, ohne Nutzerinhalt), Auswertung im Shadow-/On-Betrieb. Antwort an den Client wie heute `{ plan }`.
      - Nur wenn auch der Rückfall scheitert: Antwort 500 mit maschinenlesbarem Code, z. B. `{ "error": "plan-core-invariant", "configVersion": "0.9.0", "errors": 6, "warnings": 2, "violations": [{ "code": "I9", "rule": "step", "wn": 2, "severity": "error" }, …] }`; das Onboarding zeigt eine verständliche Meldung.
    - `shadow`: Antwort wie heute; der Kern rechnet daneben und loggt nur Verstoß-Codes und Kennzahlen (Peak, LR-Max, Lauftage), keine Inhalte. **v3: nicht in Production**, nur als Schalter für Preview/Rückweg.
    - `off`: wie heute.
    - Fehlen die neuen Eingaben (alter Client), läuft der heutige Pfad.
    - **Aus Schritt 9:** Die Route gibt dem heutigen Generator `legacyPlanProfile(profile)`; der Kern bekommt das volle Profil (Mapping Profil → `CoreInputs`, Datum `TT.MM.JJJJ` → YMD, `raceTargetTime` → `goalTime` in Sekunden).
  - Antwortformat `{ plan }` bleibt. `vercel.json` `maxDuration` erst nach dem Cutover senken.
  - Onboarding-UI: Fehlermeldung bei 500 mit Kern-Code + Button „Vereinfachten Plan nutzen“.
  - Keine Verdrahtung in `server/index.js` (Schritt 0 ist verschoben).
- **Tests:**
  - `src/__tests__/generatePlanFullCore.test.js`: die drei Modi, alter Client ohne Felder, Verstoß → 500 mit Code, kein Anthropic-Aufruf im Modus `on`
  - `apiLogsNoUserContent.test.js` für den Shadow-Log
- **Abnahme (v3, ersetzt Production-Shadow):**
  1. **Offline-Vergleich alt/neu** (Jest oder Skript, ohne Claude): P1–P6 und Zufallsprofile als Wizard-Profil → Mapping → `buildCheckedPlan` und derselbe Eingabesatz → deterministischer alter Generator (`deterministicPlanGenerator.js`). Für beide dieselben Kennzahlen: Wochen, Peak-km, längster Long Run, Long Runs ≥ 30 km, Q je Woche, Taper-Reduktion; dazu Kern errors/warnings je Code. Kern 0 errors; Abweichungen zum alten Plan erklärbar.
  2. **Preview-Deploy mit `on`:** Das Onboarding erzeugt einen Plan, die App zeigt ihn ohne UI-Änderung. Production bleibt auf `off`.

- **Umgesetzt (2026-11-06), Branch `feat/plan-core-server`, nicht gemergt; Preview-Test mit `on` offen:**
  - **Route:** `api/onboarding/generate-plan-full.ts` ersetzt die `.js` (gelöscht), `vercel.json` zeigt auf `.ts`. Exportiert per `module.exports = handler` (Babel kennt `export =` nicht); JS-Helfer per `require`, Kern und neue Module per `import`. Vorab geprüft: Jest lädt `api/*.ts` (inkl. `src/planCore`), `tsc -p api/tsconfig.json` erfasst die neuen Dateien ohne `allowJs`.
  - **Module:** `api/_lib/planCoreMapping.ts` (`profileToCoreInputs`, Europe/Berlin-Tag, `TT.MM.JJJJ` → YMD mit echter Datumsprüfung, Distanz 5/10/21,1/42,2 bzw. 42,195, `raceTargetTime` → `goalTime`; Wettkampfdatum muss existieren und ≤ heute sein, sonst ohne Rennergebnis mit Hinweis; `freeText` nie gesetzt), `api/_lib/planCoreRoute.ts` (`readPlanCoreMode`, `attemptCorePlan`, `coreFailureBody`, `logPlanCore`), `api/_lib/planMetrics.ts` (Kennzahlen für Log und Vergleich).
  - **Modi:** `off` Standard (auch leer/unbekannt). `on`: Kern-Plan bei 0 errors, Antwort `{ plan, source: "plan-core", configVersion }`, kein Claude, kein `ANTHROPIC_API_KEY` nötig. Rückfall auf den heutigen Generator bei `invariant`, `plan-too-short`, `invalid-input`, `exception`, `distance-unsupported`, `dates-invalid` mit Logzeile `[plan-core] {"event":"fallback",…,"planCoreFallbacks":1}`; alter Client ohne Plan-Eingaben = `legacy-inputs` (kein Zähler). Scheitert nach einem Verstoß auch der Rückfall: 500 `{ error: "plan-core-invariant", configVersion, errors, warnings, violations }`. `shadow`: Antwort vom heutigen Generator, Logzeile mit Kennzahlen beider Pläne; ein Kern-Fehler kommt dort nie in die Antwort.
  - **Logs:** nur Code, Regel, Woche, Schwere der errors (`toLogEntries`), Zähler, Feldnamen, Hinweis-Codes und Kennzahlen; keine Daten, Texte oder Rennzeiten (Test in `apiLogsNoUserContent.test.js` und `generatePlanFullCore.test.js`).
  - **Abnahme Offline-Vergleich:** `docs/plan-core-comparison.md` (Skript `scripts/planCoreCompare.ts`, Test `planCoreOfflineComparison.test.ts` mit Snapshot). P1–P6 und 200 Zufallsprofile: Mapping ok, 0 errors, nie Training an nicht verfügbaren Tagen oder über der Lauftage-Vorgabe (alt: 126 bzw. 134 von 200). Kern-Meldungen je Code/Regel für P1–P6 und die Zufallsprofile (alles begründete warnings) und ein Abschnitt „Warum alt und neu abweichen“ (Peak, Q je Woche, Long Run, Taper mit Spec-Bezug) stehen im Dokument. „alt“ ist der deterministische Rückfall des heutigen Pfads, nicht die Claude-Ausgabe.
  - **Nicht geändert (vom Plan abweichend, Bestätigung offen):** Onboarding-UI. Bei 500 zeigt es wie bisher „Plan konnte nicht erstellt werden …“ mit „Vereinfachten Plan verwenden“; eine eigene Meldung für `plan-core-invariant` gibt es nicht (Client liest den Fehler-Body nicht). `vercel.json` `maxDuration` bleibt 240 s bis nach dem Umschalten.
  - **Offen:** Preview-Deploy mit `PLAN_CORE_MODE=on` und Onboarding im eingeloggten Chrome (Deployment Protection), dann Schritt 11.
### 11 · `feat/plan-core-client` — **MVP**, M (2 Tage), nach 7 und 9

Client-Kopie ersetzen.

- **Dateien:**
  - `src/components/Onboarding.tsx:495-537`: Der „vereinfachte Plan“ ruft `buildPlan` aus `src/planCore` lokal auf, mit leeren Regeln und ohne Netz. Damit entfällt auch der Struktur-Aufruf `fetchClaudePlanStructure`.
  - `src/lib/ai/coachPlanMutations.ts:381-1129`: Generator löschen. Die Patch-Builder (`:1-380`) bleiben. `AiPlanRules`/`PlanPhaseSpec` (`:489-513`) wandern dorthin, wo sie noch gebraucht werden, oder entfallen.
  - Chat-Aktion „Marathon-Plan erzeugen“ entfernen (`src/lib/ai/coachDeterministicResponses.ts:695-716`, `src/lib/ai/aiActionContract.ts:18`, `src/lib/ai/types.ts:24`). Sie übernimmt heute nie einen Plan (Inventar §5). **Freigegeben: entfernen.**
  - **Aus Schritt 3 (Folgepunkt, vor Schritt 12):** `usePostWorkoutSummary.ts` (`getPostWorkoutPlannedHr`/`plannedHrRangeForSessionType`, Aufrufe um `:386`, `:508`, `:653`, `:774`, `:1101`) und `src/ai/analysis/backfillIntervalWorkoutScores.ts:129` mit `session.kind` versorgen. Die API nimmt `kind` seit Schritt 3 entgegen; ohne dieses Nachziehen zeigt die Auswertung nach dem Training für REC, M und T eine andere Zone als die Karte.
  - **v2:** `src/coachFeedback.ts:30-41`: 28-km-Schwelle nicht mehr fest, sondern aus dem Plan (längster geplanter LR des aktiven Plans; Hinweis nur bei `distance = m`). Sonst widerspricht der Coach jedem HM-/10k-Plan und den Marathon-Plänen mit 3–4 Lauftagen.
- **Tests:**
  - `coachPlanMutations.generate.test.ts` entfällt
  - `coachDeterministicResponses.test.ts:106-107` anpassen
  - `coachFeedback`-Test: HM-Plan mit LR 20 km → kein Hinweis; M-Plan mit LR-Peak 27 km, längster gelaufener LR 27 km → kein Hinweis
  - Onboarding-Test: vereinfachter Plan besteht `checkCorePlan`
- **Abnahme:** Es gibt genau eine Generator-Implementierung im Client. Der vereinfachte Plan hat 0 Verstöße (heute 49).

### 12 · `chore/plan-core-cutover` — **MVP**, S (½ Tag), nach 10 und 11

- **Ablauf (v3, kein Production-Shadow):**
  1. Voraussetzung: Abnahme von Schritt 10 (Offline-Vergleich alt/neu, Preview mit `on`) und Schritt 11.
  2. iPhone-13-Test mit P1–P6-ähnlichen Eingaben auf einem Build gegen die Preview mit `on`.
  3. `PLAN_CORE_MODE=on` in Production.
  4. Roadmap und `CLAUDE.md` (Abschnitt „Zwei AI-Provider“) aktualisieren.
  5. Danach, vor dem App-Store-Release: Spoho-Review anhand von `docs/plan-core-profiles.md`.
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
| `fix/timezone-tests` | Vorbestehender Zeitzonen-Fehler im Altcode: Unter `TZ=Pacific/Auckland` scheitern `normalizeTrainingPlan`-Golden-Tests und mehrere Altests schon auf `main`-Stand (vom Reviewer in Schritt 3 gemeldet, **nicht verifiziert**). Vermutlich `mondayIsoFromDateIso`/`deriveWeeksFromWorkouts` (lokales `setHours` + `toISOString`). In Schritt 3 bewusst nicht angefasst | `src/planV2/normalizeTrainingPlan.ts` (`mondayIsoFromDateIso`), `src/core/deriveWeeksFromWorkouts.ts:3-13`, Tests mit `TZ=Pacific/Auckland` und `TZ=America/Los_Angeles` prüfen |
| §9, §11 | Formprüfung, Claude-Texte | laut Spec nicht im MVP |

---

## Übersicht (v2)

| # | Branch | MVP | Aufwand | hängt ab von | ändert Production? |
|---|---|---|---|---|---|
| 1 | `feat/plan-core-skeleton` | ja | M (1 T, inkl. Vercel-Test) | – | nein |
| 2 | `feat/plan-core-volume` | ja | M (2–3 T) | 1 | nein (umgesetzt, nicht gemergt) |
| 3 | `fix/plan-contract-passthrough` | ja | S (1–1,5 T, inkl. Zonen nach `kind`) | – | ja, Woche-1-Fix |
| 4 | `feat/plan-core-pace` | ja | M (2 T) | 1 | nein |
| 5 | `feat/plan-core-weeks` | ja | M–L (3 T) | 2 | nein (umgesetzt, nicht gemergt) |
| 6 | `feat/plan-core-sessions` | ja | L (4–5 T) | 4, 5 | nein |
| 7 | `feat/plan-core-assemble` | ja | M (2–3 T) | 3, 6 | nein |
| 9 | `feat/onboarding-plan-inputs` | ja | M–L (3 T) | 1 | ja, neue Fragen, alter Pfad |
| 10 | `feat/plan-core-server` | ja | M (1,5 T) | 7, 9 | nein (Schalter `off`) |
| 11 | `feat/plan-core-client` | ja | M (2–2,5 T, inkl. Coach-Feedback) | 7, 9 | ja, vereinfachter Plan besser |
| 12 | `chore/plan-core-cutover` | ja | S (½ T, kein Production-Shadow) | 10, 11 | ja, Umschalten |
| 0 | `chore/plan-api-local` | später | S | – | nein |
| 8 | `feat/plan-rules-claude` | später | S–M | 1 | nein |
| 13 | `chore/remove-legacy-plan-generator` | später | M | 12 | nein |
| 14 | `refactor/validators-shared-hard` | später | S | 5 | Warnungen |
| 15 | diverse | später | S–L | – | – |

**Aufwand bis Cutover (v2):**
- **Summe der Arbeit:** ca. 21–25 Arbeitstage + 2–3 Tage Shadow (v1: 22–28 inkl. einer Woche Shadow). Die Einsparung durch Schritt 0/8 und die kürzere Shadow-Phase liegt bei etwa 5–7 Tagen; Zonen-Fix und Coach-Feedback kosten etwa 1 Tag zurück.
- **Kritischer Pfad:** 1 → 2 → 5 → 6 → 7 → 10 → 12 ≈ 15–19 Arbeitstage + Shadow.
- **v3 (2026-11-06):** Ohne Production-Shadow entfallen die 2–3 Beobachtungstage; Schritt 10 bekommt dafür den Offline-Vergleich alt/neu.
- **Realistisch nur mit Parallelarbeit:** 3, 4 und 9 laufen in eigenen Claude-Code-Sessions/Worktrees neben 2 und 5. Nacheinander abgearbeitet landet der Cutover bei der Summe, nicht beim kritischen Pfad.

```
3 ───────────────────────────────┐
1 ─┬─ 2 ─ 5 ─┐                   │
   ├─ 4 ─────┴─ 6 ─────────── 7 ─┴─┬─ 10 ─┬─ 12 ─ 13
   └─ 9 ───────────────────────────┴─ 11 ─┘
```

Das Spoho-Review läuft (v3) nach Schritt 12 und vor dem App-Store-Release anhand von `docs/plan-core-profiles.md`. Änderungen landen nur in `src/planCore/config.ts`. Danach `npm run build:plan-core`, Snapshots bewusst aktualisieren (`-u`) und die Bereichsprüfungen aus §13 anpassen, falls sich Abnahmekriterien ändern.

## Entscheidungen (Stand v2, 2026-11-04)

1. **Einbindung:** entschieden in Schritt 1 (2026-11-04) – **Variante A** (Vercel baut `api/*.ts` direkt, `src/planCore` wird importiert), mit `api/tsconfig.json` (`module: commonjs`, ohne `allowJs`). Ohne diese Datei läuft die Funktion nicht (ESM-Syntax im CJS-Laufzeitpfad). Variante B entfällt.
2. **Art-Abbildung:** freigegeben – MVP mit `kind` + Abbildung auf die 8 App-Typen (Tabelle oben); Zonen nach `kind` (Schritt 3) und Coach-Feedback-Schwelle (Schritt 11) im MVP; echte neue Typen später.
3. **Verstoß im Server-Pfad (`on`):** freigegeben – kein Kern-Plan bei error (Codes ins Log, ohne Nutzerinhalt). **Bis Schritt 13 Rückfall auf den alten Generator** (freigegeben 2026-11-05, bestätigt 2026-11-06), mit Zähler `planCoreFallbacks`. Erst wenn auch der Rückfall scheitert: 500 mit Code und verständliche Meldung im Onboarding. Der Button „Vereinfachten Plan nutzen“ bleibt bis Schritt 11 (danach kommt der vereinfachte Plan aus demselben Kern).
4. **Chat-Aktion „Marathon-Plan erzeugen“:** freigegeben – im MVP entfernen.
5. **Property-Tests:** freigegeben – eigener Zufallsgenerator mit Seed (`src/planCore/random.ts`).
6. **Standard-Pace im Einsteiger-Modus:** freigegeben – 7:00/km als E-Pace, Herkunft `E`, Spoho-Review-Punkt.
7. **Shadow:** v3 (2026-11-06) – kein Production-Shadow. Abnahme über Offline-Vergleich alt/neu und Preview mit `on` (Schritt 10); der Schalter `off/shadow/on` bleibt als Rückweg.
8. **Bestandsnutzer:** freigegeben – neue Fragen beim nächsten Erstellen eines Plans, keine Migration; v3: mit den Werten des letzten Plans vorausgefüllt, sofern vorhanden.
9. **Claude in der Planerzeugung:** im MVP keiner. Freitext nur gespeichert/Coach (Schritt 8 später).
10. **Lokaler API-Server (Schritt 0):** später; Server-Pfad wird auf Vercel-Preview im eingeloggten Chrome getestet.
