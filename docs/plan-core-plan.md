# Umbauplan: deterministischer Plan-Kern

Stand: 2026-11-03, Basis `main` @ `c1f4711`. Grundlage: `docs/plan-spec.md` (v0.3), `docs/plan-architecture-inventory.md`, `docs/plan-spec-gap.md`.
Reiner Plan, keine Code-Änderung. Zeilenangaben beziehen sich auf `main` @ `c1f4711`.

## Leitplanken

- **Ein TS-Modul** `src/planCore/**`: keine Imports von React, Node, Supabase oder aus anderen `src/`-Ordnern; keine Uhr (`todayYmd` ist Eingabe). Server und App nutzen denselben Code.
- **Output** `TrainingPlanV2` (`src/planV2/types.ts:47-53`). `AiPlanWeek` bleibt die abgeleitete Anzeige (`src/displayPlan/deriveDisplayPlan.ts:15-21`).
- **Alle Spec-Zahlen in `src/planCore/config.ts`**, jede mit Herkunft (`L`/`P`/`E`) und Spec-Abschnitt. Das Spoho-Review ändert nur diese Datei (plus die erwarteten Snapshots).
- **Invarianten I1–I22** als Funktion im Kern (`checkCorePlan`) und als Tests. Dazu Property-Tests über zufällige gültige Eingaben und Snapshot-Tests der Referenzprofile P1–P6.
- **Claude** übersetzt nur noch Freitext in `PlanRules` (§10). Alles andere rechnet der Code.
- **Production wird nie schlechter:** Bis zum Umschalten ist der Kern nicht verdrahtet. Danach läuft er hinter einem Schalter (`PLAN_CORE_MODE=off|shadow|on`, Standard `off`). Der heutige Pfad bleibt bis zum Cutover unverändert.
- **Jeder Schritt:** `CI=true npm test` grün, `CI=false npm run build` grün, eigener Branch von `main`, Merge nur mit Freigabe.

## Architekturentscheidung: wie der JS-Server das TS-Modul nutzt

Die Vercel-Funktionen sind CommonJS-JS (`api/onboarding/generate-plan-full.js`, `require(...)`). Die `tsconfig.json` ist auf CRA ausgelegt (`module: esnext`, `noEmit`, nur `src`).

**Vorschlag:** Der Kern wird per `typescript.transpileModule` (ist als Abhängigkeit schon da) nach `api/_lib/planCore/*.js` (CommonJS) übersetzt. Das Ergebnis wird **eingecheckt**.
- Skript `scripts/buildPlanCore.js`, Aufruf `npm run build:plan-core`.
- Ein Jest-Drift-Test übersetzt jede Kern-Datei erneut und vergleicht mit dem eingecheckten Stand. Weicht er ab, ist der Test rot.
- Ein Paritätstest lässt P1–P6 und die Property-Fälle durch TS und JS laufen und verlangt identische Pläne.

Warum eingecheckt: Es ist nicht gesichert, ob Vercel Dateien, die erst im Build-Kommando entstehen, in die Funktionen übernimmt. Mit eingecheckten Dateien gibt es diese Unsicherheit nicht, und `server/index.js` kann sie lokal genauso laden. Bewährtes Muster im Repo: `legacyYearAnchor` mit `legacyYearAnchorParity.test.js`, `planLabelParity.test.js`.

Verworfen:
- **TS-Funktion direkt auf Vercel (`api/*.ts`):** Die CRA-`tsconfig` passt nicht dazu, und `server/index.js` bräuchte einen eigenen Loader.
- **Zwei Implementierungen mit Paritätstest:** widerspricht der Vorgabe „ein Modul“.

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

**Pace** läuft über das bestehende Feld `pace` im Format `m:ss–m:ss`. Die App liest es schon (`src/trainingIntelligence/sessionPlanTargets.ts:115-135`).
**Bausteine** stehen im `desc` und müssen vom Client-Parser lesbar sein (`src/sessionDistance.ts:153`). Prüfung: Für jede Einheit liegt `getSessionPlannedDistanceKm` innerhalb ±0,1 km am `km`, als Teil von I1.

---

## Schritte

Reihenfolge = Abhängigkeit. Schritte 2–6 lassen sich teilweise parallel bauen (siehe Grafik am Ende).
**MVP** = vor TestFlight nötig. **später** = kann warten.

### 0 · `chore/plan-api-local` — **MVP**, S (½ Tag)

Planerzeugung lokal testbar machen (Roadmap-Folgepunkt (e)). Ohne das läuft jeder Live-Test gegen Production.

- **Dateien:**
  - `server/index.js` (ab `:638`): Routen `POST /api/onboarding/generate-plan-full` und `/generate-plan` binden die Vercel-Handler ein (`api/onboarding/generate-plan-full.js`, `generate-plan.js`).
  - `CLAUDE.md` Abschnitt „Live-Test-Setup“: `REACT_APP_AI_API_BASE=http://localhost:8787` für Web.
  - Die Basis-URL im Client bleibt unverändert (`src/lib/ai/claudePlanService.ts:86-95`): Die iOS-Hülle braucht die absolute URL.
- **Tests:** `src/__tests__/apiRouteAuth.test.js` um die neuen Express-Routen erweitern (401 ohne Token).
- **Abnahme:** `npm run start:full` + Onboarding in Chrome erzeugt einen Plan über `localhost:8787`. Production unberührt.

### 1 · `feat/plan-core-skeleton` — **MVP**, M (1 Tag)

Gerüst, Config, Typen, Build, keine Logik. Nicht verdrahtet.

- **Dateien (neu):**
  - `src/planCore/index.ts`: öffentliche API (`buildPlan`, `checkCorePlan`, `validatePlanRules`, `isHardSession`)
  - `src/planCore/config.ts`: alle Zahlen aus §0–§8 und §12, je Eintrag `{ value, source: "L"|"P"|"E", spec: "§5.3" }`, dazu `CONFIG_VERSION`
  - `src/planCore/types.ts`: `CoreInputs` (§2), `PlanRules` (§10), `CoreKind`, `CoreWorkout`, `CoreWeek`, `CorePlanMeta`
  - `src/planCore/dates.ts`: reine YMD-/UTC-Helfer. Vorlage: `api/_lib/planInvariants.js:210-221`
  - `src/planCore/random.ts`: deterministischer Zufall mit Seed, nur für Tests
  - `scripts/buildPlanCore.js`, `package.json`: Skript `build:plan-core`, ESLint-Override (siehe oben)
  - `api/_lib/planCore/` (generiert, eingecheckt)
- **Tests:**
  - `src/planCore/__tests__/config.test.ts`: jeder Eintrag hat `source` und `spec`, Snapshot der Config
  - `src/__tests__/planCoreBuildDrift.test.js`: eingecheckter Stand = frisch übersetzter Stand
  - `src/__tests__/planCorePurity.test.js`: keine Imports außerhalb `src/planCore`, kein `Date.now`/`new Date()`
- **Abnahme:** Build und Tests grün. `require("./api/_lib/planCore")` lädt im Node- und im Vercel-Preview-Deploy (einmal kurz mit einer Test-Funktion prüfen, dann wieder entfernen). Production unverändert.

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
- **Tests:** `normalizeTrainingPlan.test.ts`:
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
  - Parität: TS-Kern = `api/_lib/planCore` für P1–P6 und 200 Property-Fälle
- **Abnahme:** Alle Invarianten grün, P1–P6 in den Bereichen.
  - Zusätzlich `docs/plan-core-profiles.md`: Vergleichstabelle P1–P6 gegen je einen Literaturplan (§13: Peak-km, LR-Max, LR ≥ 30 km, Q/Woche, Taper). Ist Grundlage fürs Spoho-Review.
  - Hinweis: `CI=true` schreibt keine neuen Snapshots. Die Snapshot-Dateien müssen mit eingecheckt werden.

### 8 · `feat/plan-rules-claude` — **MVP**, S–M (1–2 Tage), nach 1

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

### 10 · `feat/plan-core-server` — **MVP**, M (2 Tage), nach 7, 8, 9

Kern im Vercel-Handler hinter dem Schalter.

- **Dateien:**
  - `api/onboarding/generate-plan-full.js:24-45`:
    - `PLAN_CORE_MODE=on`: `planRulesFromText` → `buildPlan` → `checkCorePlan`. Mit Verstoß gibt es keinen Plan, Antwort 500 mit Codes im Log (Vorschlag, siehe Entscheidungen).
    - `shadow`: Antwort wie heute; der Kern rechnet daneben und loggt nur Verstoß-Codes und Kennzahlen (Peak, LR-Max, Lauftage), keine Inhalte.
    - `off`: wie heute.
    - Fehlen die neuen Eingaben (alter Client), läuft der heutige Pfad.
  - Antwortformat `{ plan }` bleibt. `vercel.json` `maxDuration` erst nach dem Cutover senken.
  - Gleiche Verdrahtung in `server/index.js` (aus Schritt 0).
- **Tests:**
  - `src/__tests__/generatePlanFullCore.test.js`: die drei Modi, alter Client ohne Felder, Claude-Ausfall, Verstoß → 500
  - `apiLogsNoUserContent.test.js` für den Shadow-Log
- **Abnahme:** Auf einem Preview-Deploy mit `on` erzeugt das Onboarding einen Plan, die App zeigt ihn ohne UI-Änderung. Production bleibt auf `off`.

### 11 · `feat/plan-core-client` — **MVP**, M (2 Tage), nach 7 und 9

Client-Kopie ersetzen.

- **Dateien:**
  - `src/components/Onboarding.tsx:495-537`: Der „vereinfachte Plan“ ruft `buildPlan` aus `src/planCore` lokal auf, mit leeren Regeln und ohne Netz. Damit entfällt auch der Struktur-Aufruf `fetchClaudePlanStructure`.
  - `src/lib/ai/coachPlanMutations.ts:381-1129`: Generator löschen. Die Patch-Builder (`:1-380`) bleiben. `AiPlanRules`/`PlanPhaseSpec` (`:489-513`) wandern dorthin, wo sie noch gebraucht werden, oder entfallen.
  - Chat-Aktion „Marathon-Plan erzeugen“ entfernen (`src/lib/ai/coachDeterministicResponses.ts:695-716`, `src/lib/ai/aiActionContract.ts:18`, `src/lib/ai/types.ts:24`). Sie übernimmt heute nie einen Plan (Inventar §5). Vorschlag für das MVP: entfernen statt anschließen.
- **Tests:**
  - `coachPlanMutations.generate.test.ts` entfällt
  - `coachDeterministicResponses.test.ts:106-107` anpassen
  - Onboarding-Test: vereinfachter Plan besteht `checkCorePlan`
- **Abnahme:** Es gibt genau eine Generator-Implementierung im Client. Der vereinfachte Plan hat 0 Verstöße (heute 49).

### 12 · `chore/plan-core-cutover` — **MVP**, S (½ Tag + Beobachtung), nach 10 und 11

- **Ablauf:**
  1. `PLAN_CORE_MODE=shadow` in Production, mindestens eine Woche bzw. 30 Pläne.
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

## Übersicht

| # | Branch | MVP | Aufwand | hängt ab von | ändert Production? |
|---|---|---|---|---|---|
| 0 | `chore/plan-api-local` | ja | S | – | nein (nur lokaler Server) |
| 1 | `feat/plan-core-skeleton` | ja | M | – | nein |
| 2 | `feat/plan-core-volume` | ja | M | 1 | nein |
| 3 | `fix/plan-contract-passthrough` | ja | S | – | ja, nur Woche-1-Fix |
| 4 | `feat/plan-core-pace` | ja | M | 1 | nein |
| 5 | `feat/plan-core-week-templates` | ja | M–L | 2 | nein |
| 6 | `feat/plan-core-sessions` | ja | L | 4, 5 | nein |
| 7 | `feat/plan-core-assemble` | ja | M | 3, 6 | nein |
| 8 | `feat/plan-rules-claude` | ja | S–M | 1 | nein |
| 9 | `feat/onboarding-plan-inputs` | ja | M–L | 1 | ja, neue Fragen, alter Pfad |
| 10 | `feat/plan-core-server` | ja | M | 7, 8, 9 | nein (Schalter `off`) |
| 11 | `feat/plan-core-client` | ja | M | 7, 9 | ja, vereinfachter Plan besser |
| 12 | `chore/plan-core-cutover` | ja | S | 10, 11 | ja, Umschalten |
| 13 | `chore/remove-legacy-plan-generator` | später | M | 12 | nein |
| 14 | `refactor/validators-shared-hard` | später | S | 5 | Warnungen |
| 15 | diverse | später | S–L | – | – |

Grober Gesamtaufwand bis Cutover: **ca. 22–28 Arbeitstage**. Der längste Pfad ist 1 → 2 → 5 → 6 → 7 → 10 → 12.

```
0 ─────────────────────────────────────────────┐
3 ───────────────────────────────┐             │
1 ─┬─ 2 ─ 5 ─┐                   │             │
   ├─ 4 ─────┴─ 6 ─────────── 7 ─┴─┬─ 10 ─┬─ 12 ─ 13
   ├─ 8 ───────────────────────────┤      │
   └─ 9 ───────────────────────────┴─ 11 ─┘
```

Das Spoho-Review kann nach Schritt 7 anhand von `docs/plan-core-profiles.md` laufen. Änderungen landen nur in `src/planCore/config.ts`. Danach `npm run build:plan-core`, Snapshots bewusst aktualisieren (`-u`) und die Bereichsprüfungen aus §13 anpassen, falls sich Abnahmekriterien ändern.

## Entscheidungen vor dem Start (bitte freigeben)

1. **Einbindung:** übersetzter, eingecheckter Kern in `api/_lib/planCore/` mit Drift- und Paritätstest (siehe oben).
2. **Art-Abbildung:** MVP mit `kind` + Abbildung auf die 8 App-Typen; echte neue Typen erst später (`feat/session-kind-types`).
3. **Verstoß im Server-Pfad (`on`):** Plan verweigern (500, Onboarding zeigt Fehler und bietet den lokalen vereinfachten Plan an) statt still auf den alten Pfad zurückzufallen.
4. **Chat-Aktion „Marathon-Plan erzeugen“:** im MVP entfernen.
5. **Property-Tests:** eigener Zufallsgenerator mit Seed (`src/planCore/random.ts`) statt neuer Abhängigkeit (`fast-check`).
6. **Standard-Pace im Einsteiger-Modus** für die Minuten-Limits (Schritt 4): Wert festlegen, Herkunft `E`, Review-Punkt.
7. **Shadow-Dauer:** mindestens eine Woche bzw. 30 Pläne vor `on`.
8. **Bestandsnutzer:** neue Fragen nur beim nächsten Erstellen eines Plans (Spec §2), keine Migration bestehender Pläne (Spec §15.3).
