# Plan-Spec ↔ Code: Abgleich der Zahlen

Stand: 2026-11-03, Branch `docs/plan-inventory` (Code = `fix/plan-volume-guards` @ `4d725ed`).
Vergleicht jede Zahl aus `docs/plan-spec.md` §5–§8 mit dem heutigen Code und beantwortet §15.5. Reine Analyse, keine Code-Änderung.

**Status:** **gleich** = gleiche Regel und gleicher Wert (oder Code liegt im Spec-Bereich) · **abweichend** = Regel existiert, Wert oder Bezug ist anders · **fehlt** = keine entsprechende Regel im Code.

Abkürzungen: `wvp` = `api/_lib/weeklyVolumeProgression.js`, `det` = `api/_lib/deterministicPlanGenerator.js`, `inv` = `api/_lib/planInvariants.js`, `pst` = `api/_lib/planSessionText.js`, `rvr` = `api/_lib/raceVolumeReference.js`, `pf` = `api/_lib/phasedFullPlanGenerator.js`, `cpg` = `api/_lib/claudePlanGenerator.js`.

## Kurzfazit

- **Grundlegender Unterschied beim Eingang:** Die Spec rechnet mit `currentWeeklyKm`, `runDaysPerWeek` und Pace aus der Form. Der Code kennt nur die Umfangs-Spanne aus dem Wizard (Mittelwert 15/30/50/70/90 km) und die Zielzeit. Die Lauftage legt Claude fest. Viele Abweichungen folgen daraus.
- **Peak:** Der Code nimmt die Obergrenze der Referenz zur **Zielzeit**, gedeckelt auf Spannen-Obergrenze × 1,2. Die Spec nimmt eine Tabelle nach **Lauftagen** mit Deckel Start × 1,5. Die Zahlen liegen nah beieinander, Bezug und Formel sind verschieden.
- **Steigerung, Entlastung, Taper:** Grundzüge sind gleich (+10 %, 3:1, Taper nach Anteil der Spitze). Die Feinwerte weichen ab: kein +4-km-Zusatz, keine 30-%-Grenze über 2 Wochen, Entlastung tiefer (−28 %), nach der Entlastung +10 % über das alte Niveau erlaubt, die 5k/10k-Rennwoche bei 40 % statt 50–60 %.
- **Long Run ist die größte Lücke.** Der Code begrenzt den Long Run in Wochen mit 4–6 Läufen auf 30 % der Woche. Damit bleiben Marathon-Long-Runs deutlich unter dem Spec-Ziel: im Beispiel 21,4 km bei M 3:45 (Spec 30–34 km) und 14,2 km bei M 4:00 mit 20–40 km (Spec 26–30 km). Eine Steigerungsgrenze je Woche und eine Zeitgrenze gibt es nicht.
- **Wochenschablonen (§6) und Einheiten-Bibliothek (§7) fehlen fast vollständig.** Der Code kennt nur `easy/long/interval/tempo`. REC, MLR, M, LR+M, R, Strides, Minuten-Limits und der Qualitätsanteil fehlen. Tempo-Einheiten sind bis 24 km lang möglich (Spec: T ≤ 10 % der Woche).
- **Rennwoche (§8):** weitgehend gleich. Ausnahme: Die letzten zwei Tage erlauben bis 10 km (Spec: ≤ 30 min).

## Beispielrechnung mit dem heutigen Code

Deterministischer Generator mit Standardregeln (Ruhetag Mo, Long Run So, Intervall Di, Tempo Do), so wie er im Server-Fallback läuft. Der Claude-Pfad nutzt dieselben Ziele und dieselbe Long-Run-Logik, nur die Wochenform kommt von Claude. Rechnung per Ad-hoc-Skript außerhalb des Repos.

| Profil | Wochen-km (letzte = Rennwoche inkl. Rennen) | Peak | Längster LR | Längste harte Einheit | Lauftage/Wo |
|---|---|---|---|---|---|
| M 3:45, 40–60 km, 18 Wo | 50 50 51 37 54 56 58 43 62 64 66 49 70 71 71 72 53 71 | 72 | 21,4 | 15,0 | 5–6 |
| M 2:50, 60–80 km, 18 Wo | 70 70 71 53 75 77 79 59 84 87 89 66 93 95 95 95 71 80 | 95 | 28,6 | 23,4 | 6 |
| M 4:00, 20–40 km, 16 Wo | 29 29 30 21 33 36 38 29 41 44 46 34 48 48 36 61 | 48 | 14,2 | 10,0 | 4–6 |
| HM 1:35, 40–60 km, 12 Wo | 49 51 53 40 58 63 66 50 71 70 53 50 | 71 | 18,0 | 16,9 | 6 |
| 10k Finish, 0–20 km, 10 Wo | 16 16 16 14 17 18 18 20 21 18 | 21 | 6,0 | 7,0 | 3 |

Zum Vergleich: Spec-Profil P4 (M 4:00, 4 Tage) erwartet LR-Peak 26–28 km, P5 (M 2:50, 6 Tage) erwartet LR-Peak 30–34 km und T ≤ 10 km.

---

## §5 Wochenumfang

| § | Spec | Code heute (Datei:Zeile, Wert) | Status |
|---|---|---|---|
| 5.1 | `startKm = clamp(currentWeeklyKm, minStart, 150)` | Start = Mittelwert der Wizard-Spanne: 0–20 → 15, 20–40 → 30, 40–60 → 50, 60–80 → 70, 80+ → 90 (`det:90-98`). Kein Ist-Umfang, keine Ober- oder Untergrenze | abweichend |
| 5.1 | `minStart` 5k 10 · 10k 15 · HM 20 · M 25 | – | fehlt |
| 5.1 | Unter `minStart`: Start bei Ist-Umfang, Peak begrenzt | Indirekt: `volumeGapWarning`, wenn Start < 60 % der Referenz-Basis (`det:700`); dann Referenz-Peak ≤ Start × 1,6 (`det:701-705`) | abweichend |
| 5.2 | `peakKm = min(tableMax, max(tableMin, startKm), startKm × 1,5)` | `max(min(Referenz-Obergrenze, ⌊Spannen-Obergrenze × 1,2⌋), round(Start × 1,1))` (`wvp:50-54`, `det:698-705`). Spannen-Obergrenze 20/40/60/80/90 (`det:101-109`) → Peak-Deckel 24/48/72/96/108 km | abweichend |
| 5.2 | Deckel `startKm × 1,5` | Effektiver Deckel aus Spanne × 1,2 ÷ Mittelwert: 1,6 (0–20) · 1,6 (20–40) · 1,44 (40–60) · 1,37 (60–80) · 1,2 (80+) | abweichend |
| 5.2 | Untergrenze `max(tableMin, startKm)` | Untergrenze Start × 1,1 (`wvp:8`, `wvp:53`) | abweichend |
| 5.2 | Peak-Tabelle nach Distanz × **Lauftage** (z. B. M 6 Tage 65–110) | Referenz nach Distanz × **Zielzeit** (`rvr:4-49`, z. B. M ≤ 3:00: 120–150, M ≤ 4:00: 65–85, Finisher 40–55), genutzt wird nur die Obergrenze (`det:702`) | abweichend |
| 5.2 | Lauftage begrenzen den Peak | Ja, indirekt: Wochenziel ≤ was die Lauftage tragen (`weekCapacityKm`, `det:721-732`, `wvp:149-155`), mit Long Run ≤ 30 %/50 % und Easy ≤ 60 % LR | abweichend (anderer Mechanismus) |
| 5.2 | „erreichbar unter §5.3“ | Ja: +10 % und Kapazität haben Vorrang, sonst `meta.volumeNote` mit `reason` `growth`/`run-days` (`wvp:173-206`, `det:746-753`) | gleich |
| 5.3 | Woche zu Woche ≤ +10 % **oder ≤ +4 km (das Größere)** | `≤ ⌊1,1 × max(Vorwoche, Niveau vor Entlastung)⌋` (`wvp:12`, `wvp:156-162`); auf Ist-km nachgezogen (`inv:727-746`), geprüft als I11 mit +0,3 km Toleranz (`inv:1259-1270`). Kein +4-km-Zusatz → bei kleinen Umfängen strenger (15 km: +1 statt +4) | abweichend |
| 5.3 | Hart: `km(w) ≤ 1,30 × km(w−2)` | Kein eigener Check; folgt nur indirekt aus 1,1 × 1,1 = 1,21 | fehlt |
| 5.3 | Entlastung jede 4. Woche **je Block** (3:1) | Jede 4. Woche **ab Planstart** (`weekNumber % 4 === 0`, `wvp:6`, `wvp:164-165`), nicht in Peak/Peak−1, Taper und der Woche des längsten Laufs (`wvp:165`, `det:711-715`) | abweichend |
| 5.3 | Entlastung −20 bis −25 % zur Vorwoche | `round(Trendwert der Woche × 0,72)` (`wvp:5`, `wvp:167`) → −28 % zum eigenen Trend, zur Vorwoche etwas mehr. Zusätzlich ≤ 90 % der Vorwoche (`inv:49`, `inv:770`, Check `inv:1183-1187`) | abweichend |
| 5.3 | Nach Entlastung zurück auf das Niveau davor, **nicht darüber** | Bis 1,1 × Niveau vor Entlastung erlaubt (`wvp:157`, `inv:739-741`) | abweichend |
| 5.3 | `isRecoveryWeek = true` **und** „Entlastung“ im `focus` | Beides gesetzt: `isRecoveryWeek` + `RECOVERY_WEEK_FOCUS` = „Entlastungswoche – Volumen reduziert, Adaptationen festigen“ (`det:29`, `pf:584-590`, `det:882-893`). App liest nur den Text (`src/trainingIntelligence/sessionPlanTargets.ts:137-141`) | gleich |
| 5.3 | Peak in der Spezifisch-Phase, frühestens 4 Wochen vor dem Rennen | Peak = letzte Woche vor dem Taper (`wvp:135`, `wvp:68`) → 1–3 Wochen vor der Rennwoche, also innerhalb der letzten 4 Wochen | gleich |
| 5.4 | Taper-Wochen: M/HM 2, 5k/10k 1 (§4) | M 2 ab 8 Plan-Wochen, sonst 1; HM 2 erst ab 10 Wochen, sonst 1; 5k/10k/15k 1; +1, wenn die Rennwoche < 4 Tage hat; max. 3 (`wvp:30-44`) | abweichend (HM < 10 Wo, kurze Rennwoche) |
| 5.4 | Insgesamt −41 bis −60 % gegenüber Peak | M/HM 2 Wochen: Ø (75 % + 40 %) / 2 → −42,5 %; 1 Woche: 40 % → −60 % (`wvp:18-22`, `wvp:184-194`) | gleich (am Rand) |
| 5.4 | M/HM Taper-Woche 1: 65–75 % Peak | 75 % (`wvp:20`), zusätzlich ≤ 90 % der Ist-Spitze (`inv:771`) | gleich (Obergrenze) |
| 5.4 | M/HM Rennwoche ohne Rennen: 35–50 % Peak | `min(Anteil × Tage vor dem Rennen / 7, 40 %)` → bei Rennen So: 40 % (`wvp:14`, `wvp:185-189`); Ist-km ≤ 40 % der Ist-Spitze (`inv:60`, `inv:789-823`, Check I13 `inv:1285-1292`) | gleich |
| 5.4 | 5k/10k Rennwoche ohne Rennen: 50–60 % Peak | dieselbe 40-%-Grenze (Anteil 0,6 × 6/7 = 51 % wird auf 40 % gekappt) | abweichend |
| 5.4 | Genau 1 verkürzte Qualitätseinheit je Taper-Woche | Rennwoche (7 Tage vor dem Rennen): **höchstens** 1 harte Einheit, ≤ 8 km (`inv:327`, `inv:531-537`). Taper-Woche davor: keine Regel, Claude entscheidet | abweichend / fehlt |
| 5.4 | Lauftage im Taper ≥ `runDaysPerWeek − 1` | Keine Regel. Gegenteil möglich: lockere Läufe werden bei zu wenig km zu Ruhetagen (`inv:608-614`, `inv:817-822`) | fehlt |

## §6 Wochenschablonen

| § | Spec | Code heute | Status |
|---|---|---|---|
| 6 | Lauftage 3–6 | Keine Grenze; `runDaysFromRules` erlaubt 1–7 (`det:126-128`). Standardregeln (nur Mo frei) ergeben 6 Lauftage, obwohl `maxTrainingDaysPerWeek: 5` gesetzt ist: der Generator wendet `maxTrainingDaysPerWeek` nicht an (`det:558-587`), nur die Kapazitätsrechnung nutzt es | abweichend |
| 6 | Schablonen je Lauftage × Phase (Basis: LR + E…, ab Aufbau Q1/Q2, MLR, REC) | Keine Schablonen. Wochenform kommt von Claude (`pf:96-107`). Server-Fallback: Tag → Typ nur aus `longRunDay`/`intervalDay`/`tempoDay`, **in jeder Phase gleich**, also 2 Q auch in der Basis (`det:321-330`, Standard `det:968-979`) | fehlt |
| 6 | Platzierung: LR auf `longRunDay` | Long Run auf `rules.longRunDay` (Claude bzw. Standard So). Fehlt er, wird der längste lockere Lauf umgelabelt, nah am `longRunDay` (`inv:384-392`, `inv:558-561`) | gleich |
| 6 | Q1 ≈ 3 Tage vor LR, Q2 ≈ 2 Tage nach LR | Standardregeln Di/Do bei So-LR = Q1 3 Tage vor, Q2 2 Tage nach (`cpg:195-196`, `det:971-972`). Nur Vorgabe an Claude: nicht aufeinanderfolgend, nicht am Tag vor dem LR (`cpg:207-208`) | gleich (nur als Standard) |
| 6 | Harte Einheiten nie an Folgetagen, dazwischen ≥ 1 E/REC/Ruhetag | I8: keine zwei aus Intervall/Tempo/Rennen an Folgetagen (`inv:41`, `inv:224`, `inv:948-981`, Check `inv:1238-1244`) und I4: keine harte Einheit am Vortag des LR (`inv:910-940`). **Long Run zählt nicht als hart** → eine harte Einheit direkt nach dem LR ist erlaubt (Spec: LR ≥ 90 min ist hart) | abweichend |
| 6 | Nicht in `availableDays` → Ruhetag | Nur über `rules.restDays` von Claude; der Code erzwingt sie nicht, schützt sie nur beim Verschieben in Schritt 4b (`inv:964`) | abweichend |
| 6 | Regel 3 nicht erfüllbar → Q2 entfällt, nicht verschieben | Code verschiebt (Tausch mit lockerem Tag), erst sonst Herabstufung zu easy (`inv:921-938`, `inv:978-979`) | abweichend |
| 6 | Max. Q ohne LR: 3 Tage 1 · 4 Tage 2 · 5 Tage 2 · 6 Tage 2 | Gleiche Zahlen nur als **Annahme der Kapazitätsrechnung**: `hardDays = min(Zahl harter Regeltage ≤ 2, Lauftage − 2)` (`det:130-135`). Keine Durchsetzung, keine Prüfung; Ausnahme Rennwoche ≤ 1 (`inv:531-537`) | abweichend |
| 6 | Wochen-km: LR und Q nach §7, Rest gleichmäßig auf E/REC | LR fix aus `planLongRuns`, der Rest per Wasserfüllung auf **harte (Gewicht 1,15) und lockere Läufe (Gewicht 1)** (`inv:52`, `inv:580-629`). Q-Größe ergibt sich also aus dem Wochenrest, nicht aus einer Bibliothek | abweichend |
| 6 | Rest passt nicht → Wochen-km reduzieren, nie aufblähen | Läufe haben Obergrenzen (`inv:340-348`, `inv:593-606`), die Woche bleibt dann unter dem Ziel (`inv:165-207`). Zu wenig km → lockere Läufe werden Ruhetage (`inv:608-614`) | gleich (im Prinzip) |
| 6 | Qualitäts-km ≤ 20 % (Ziel), ≤ 25 % (hart) | – | fehlt |

## §7 Einheiten-Bibliothek

| § | Spec | Code heute | Status |
|---|---|---|---|
| 7 | Jede Einheit hat einen Typ aus der Bibliothek | Typen: `rest, easy, interval, tempo, long, strength, bike, race` (`src/lib/ai/mapSessionType.ts:3-12`). Kein REC, MLR, M, LR+M, R | abweichend |
| 7 | Ein-/Auslaufen je 1,5–3 km | WU 1,5 km (< 9 km Einheit) bzw. 2 km; CD 1 km bzw. 1,5 km (`pst:76-78`) → CD 1 km unter der Spec | abweichend |
| 7 | REC 20–45 min, REC-Pace | Kein eigener Typ. „Regenerationslauf“ = lockerer Lauf in Entlastungswochen, Zone 1 (`pst:29-33`, `pst:181`). Keine Minuten (es gibt keine Pace) | fehlt |
| 7 | E 25–75 min (6 Tage bis 90), optional 4–8 × 20 s Strides | km statt Minuten: min. 4 km (≤ 10-km-Rennen) bzw. 5 km (`inv:313-315`), max. 0,45 × Wochenziel (`inv:346`). Keine Strides | abweichend / Strides fehlt |
| 7 | E ≤ 75 % des LR derselben Woche | ≤ **60 %** des LR (`inv:66`, `inv:394-397`, Check I9 `inv:1246-1257`) | abweichend (strenger) |
| 7 | MLR 75–110 min, ≤ 75 % LR, ≥ 2 Tage Abstand zum LR, nur HM/M | – | fehlt |
| 7 | LR+M: M-Anteil ≤ 50 % LR und ≤ min(29 km, 110 min), nur M, Spezifisch | – (Claudes Titel „Marathon-Pace-Long-Run“ steht nur in den ungenutzten `sessionNames`, `cpg:187`; Long-Run-Text ist immer Zone 2, `pst:164-169`) | fehlt |
| 7 | M-Dauerlauf ≤ min(29 km, 110 min) | – | fehlt |
| 7 | T: ≤ 20 min Tempo oder Cruise-Intervalle; T-km ≤ 10 % Wochen-km | Tempo = ein Dauerblock = Einheit − WU − CD (`pst:81-83`); Einheit 6–20 km (≤ 30-km-Rennen) bzw. 6–24 km (`inv:317-320`) → Block bis ~20,5 km. Keine Cruise-Intervalle, kein Bezug zu Wochen-km | abweichend |
| 7 | I: 3–5 min Wiederholungen, Trabpause ≈ gleich lang; I-km ≤ min(8 % Wochen-km, 10 km) | Wiederholungslänge nach Distanz: 5k 0,4–1 km, 10k 0,6–1,6, HM 0,8–2, M 1–3 km (`pst:67-72`), 4–10 Wiederholungen (`pst:89`), Pause fest 90 s (`pst:17`). Einheit 6–14 km bzw. 6–16 km (`inv:317-320`) → bis ~12 km Belastung. Kein Bezug zu Wochen-km | abweichend |
| 7 | R: 200–400 m, volle Erholung; R-km ≤ min(5 %, 8 km), nur 5k/10k | – (kürzeste Wiederholung 400 m bei 5k, 90 s Pause) | fehlt |
| 7 | RACE genau einmal, am `raceDate` | Letzter Plantag = Rennen, alle früheren `race` → easy (`inv:502-505`); Check I3 (`inv:1109-1113`) | gleich |

### §7.1 Long Run

| § | Spec | Code heute | Status |
|---|---|---|---|
| 7.1 | Anteil hart: 3 Tage ≤ 55 % · 4 Tage ≤ 50 % · 5 Tage ≤ 38 % · 6 Tage ≤ 33 % | `longRunCap`: ≤ 3 Läufe 50 %, sonst 30 % (Peak-Wochen ≥ 120 km 33 %), 1 Lauf 100 % (`inv:44-47`, `inv:53`, `inv:79-84`). Anhebung, wenn lockere Läufe sonst > 60 % LR wären: `1 / (1 + 0,6 × lockere + 1,15 × harte)` (`inv:93-96`), z. B. 4 Läufe ohne harte Einheit 35,7 %. Ergebnis: 3 Tage 50 (Spec 55), 4 Tage 30–36 (50), 5 Tage 30 (38), 6 Tage 30/33 (33) | abweichend (strenger, v. a. 4–5 Tage) |
| 7.1 | (keine Untergrenze) | Untergrenze 20 % in vollen Wochen außer der Rennwoche (`inv:46`, `inv:652`, Check I10 `inv:1302-1328`) | nur im Code |
| 7.1 | Zeit ≤ 150 min Ziel, ≤ 180 min hart | – (keine Pace, keine Minuten) | fehlt |
| 7.1 | Steigerung ≤ +2 km oder +15 % (Größeres), max. +3 km | Linearer Verlauf von 65 % auf die LR-Spitze (`inv:54`, `inv:1038-1050`), Obergrenze je Woche linear (`det:723-729`). Kein Grenzwert je Schritt; kurze Pläne machen größere Sprünge | fehlt |
| 7.1 | Startwert ≤ `longestRecentRunKm` + 2 km | Start = `min(max(0,65 × LR-Spitze, 0,3 × Start-km), LR-Spitze / 1,15)` (`det:113`, `det:724`); kein Bezug zum längsten letzten Lauf (Feld fehlt) | fehlt |
| 7.1 | Peak-Ziel M: 5–6 Tage 30–34 km (2–3 Läufe ≥ 30 km); 3–4 Tage 26–30 km | Referenz je Zielzeit 35/34/32/32/30/30/28/26/24 km (`rvr:39-47`, Spalte `peakLongRunKm`), mind. 22 % des Peaks (`det:723`), **dann gekappt auf 30 % des Wochenziels** (`inv:1030-1037`). Beispiele oben: 21,4 / 28,6 / 14,2 km. Keine Regel „≥ 2 LR ≥ 30 km“ | abweichend (deutlich darunter) |
| 7.1 | Peak-Ziel HM 16–22 km | Referenz 24/22/20/18/16/15/13 km (`rvr:30-36`), gleiche Kappung; Beispiel HM 1:35: 18 km | abweichend (Spanne 13–24) |
| 7.1 | Peak-Ziel 10k 12–18 km | Referenz 20/18/16/14/12/10 km (`rvr:14-19`); Beispiel 10k Finisher 0–20 km: 6 km | abweichend (Spanne 10–20) |
| 7.1 | Peak-Ziel 5k 8–14 km | Referenz 16/14/12/10/9/7 km (`rvr:6-11`) | abweichend (Spanne 7–16) |
| 7.1 | Längster LR (Zeitpunkt) | Spitze ≥ 21 Tage (HM/M) bzw. ≥ 14 Tage (5k/10k/15k) vor dem Rennen (`inv:322-324`, `inv:1024-1028`), danach 70 % / 50 % (`inv:56`, `inv:1047`) | nur im Code |
| 7.1 | HM/M: genau 1 LR je Woche außer Rennwoche | **Alle** Distanzen: genau 1 LR in jeder Woche mit ≥ 5 Tagen außerhalb der 7 Tage vor dem Rennen (`inv:539-562`, Check I12 `inv:1272-1283`) | gleich (Code weiter) |
| 7.1 | Entlastungswoche: LR −20 bis −30 % | LR × 0,8 → −20 % (`inv:55`, `inv:1045`) | gleich (Untergrenze) |

### §7.2 Q-Typen je Phase und Distanz

| § | Spec | Code heute | Status |
|---|---|---|---|
| 7.2 | Basis: Strides, T bzw. R ab W3; Aufbau/Spezifisch: I, T, R, M, LR+M, HM-Pace je Distanz; Taper: 1 × kurz | Nur `interval` und `tempo`, gleiche Bausteinlogik in allen Phasen (`pst:75-102`). Welcher Typ an welchem Tag liegt, entscheidet Claude bzw. die Standardregel (Intervall Di, Tempo Do, auch in der Basis) | fehlt |
| 7.2 | Einsteiger-Modus: in Basis nur Strides, keine I/R im Plan | – | fehlt |

## §8 Rennwoche

| § | Spec | Code heute | Status |
|---|---|---|---|
| 8 | RACE am `raceDate`, Distanz exakt | `asRace`: km = Renndistanz (`inv:291-303`, `inv:502`) | gleich |
| 8 | Letzte Q ≥ 4 Tage vor M, ≥ 3 Tage vor HM/10k/5k | Mindestabstand M 4, HM/15k 3, 10k/5k 2 (`inv:330-334`, `inv:531-537`, Check `inv:1294-1300`). Weil Renntag −2/−1 nur locker oder frei sind (`inv:507-514`), liegt die letzte harte Einheit bei 10k/5k effektiv auch ≥ 3 Tage vorher | gleich (effektiv) |
| 8 | Letzte 2 Tage: nur REC/E ≤ 30 min oder Ruhe, optional Strides | Nur locker oder frei (`inv:507-514`), aber in km: Renntag −1 ≤ clamp(0,4 × Renndistanz, 3, 6) km, −2 ≤ clamp(0,6 × Renndistanz, 4, 10) km (`inv:306-311`) → M: 6 km und 10 km. Keine Strides | abweichend |
| 8 | Kein LR in der Rennwoche | Kein LR in den 7 Tagen vor dem Rennen, soweit sie in Taper-Wochen liegen (`inv:521-528`, `inv:545`, Check `inv:1276-1278`). Offen laut Roadmap: Rennen Do–Sa mit nur 1 Taper-Woche | gleich (mit bekannter Lücke) |
| 8 | Plan endet am Renntag | Tage nach dem Rennen werden verworfen (`inv:489`, `inv:494`) | gleich |
| 8 | (keine Zahl) | Rennwoche: harte Einheit ≤ 8 km inkl. WU/CD, Rennwoche ohne Rennen ≤ 40 % Peak (`inv:327`, `inv:60`) | nur im Code |

---

## §15.5 Offene Punkte

### (1) Welches Planmodell konsumiert die App?

**Beides, in einer festen Richtung: `TrainingPlanV2` ist die gespeicherte Quelle, `AiPlanWeek` wird bei jedem Rendern daraus abgeleitet.** Ein neuer Kern muss nur `TrainingPlanV2` liefern.

| Ebene | Modell | Datei:Zeile |
|---|---|---|
| Speicher (Supabase `training_plans.data`, localStorage, React-State) | `TrainingPlanV2` | `src/lib/supabase/services/trainingPlanService.ts:145-167`, `src/AppMain.tsx:3620-3644` |
| Anzeige (Woche, Home), Coach-Kontext, Capacity Engine | `AiPlanWeek[]` = `deriveDisplayPlan(V2, patches)`: `normalizeTrainingPlan` → `toPlanWeeks` → `toAiPlanWeeks` → `applyPlanPatches` | `src/displayPlan/deriveDisplayPlan.ts:15-21` |
| Patches (Coach, Kalender-Umverteilung) | `PlanPatch { sessionId, changes: Partial<AiPlanSession> }`, getrennt gespeichert und erst bei der Anzeige angewendet | `src/lib/ai/types.ts:124-128` |
| Chat-Tausch zweier Tage | direkt auf `TrainingPlanV2` (`validateSwap` bekommt V2 vorher/nachher) | `src/mutations/computeSwapWorkoutsV2Result.ts:61` |
| Capacity Engine | arbeitet auf `AiPlanWeek`/`PlanPatch`, baut für die Prüfung wieder ein V2 (`afterV2`) | `src/ai/mutations/assignSessionToBestCapacityDay.ts:158`, `:335` |

Folgen für den Kern:
- `AiPlanSession` kennt nur `id, day, date, dateIso, type, title, km, desc, pace` (`types.ts:40-51`). `structured`, `sport`, `intensity` und `isRecoveryWeek` kommen dort nicht an. Die km einer Einheit rechnet `getPlannedKmEquiv` neu, u. a. aus dem `desc` (`src/lib/ai/planToAi.ts:56`). Neue Felder des Kerns (Segmente, Paces, `isRecoveryWeek`) erreichen die UI nur, wenn `toPlanWeeks` (`src/planV2/toPlanWeeks.ts:20-68`) und `planToAi.ts:30-83` sie durchreichen.
- `PlanPatch` hängt an `sessionId`. Die IDs des Kerns müssen eindeutig und über einen Plan stabil bleiben.

### (2) Existieren `currentWeeklyKm`, `longestRecentRunKm`, `recentRace` im Onboarding/Profil?

**Nein, keins der drei Felder.** Damit gehört eine Onboarding-Änderung zum Scope (für §3, §5.1, §7.1).

| Spec-Feld | Heute | Datei:Zeile |
|---|---|---|
| `currentWeeklyKm` | Nur die Spanne `0–20 / 20–40 / 40–60 / 60–80 / 80+ km` (Chip im Wizard), im Code als Mittelwert 15/30/50/70/90 gelesen | `src/onboarding/marathonPreferencesOnboarding.ts:32-38`, `src/components/Onboarding.tsx:215`, `:719`, `det:90-98` |
| `longestRecentRunKm` | – | – |
| `recentRace` | – im Wizard. Im Profil gibt es nur `personalBestTime` (Marathon-Bestzeit ohne Datum, aus den Einstellungen, Spalte `profiles.personal_best_seconds`); genutzt nur für die Prognose | `supabase/migrations/007_profiles_personal_best_seconds.sql`, `src/lib/supabase/services/profilesService.ts:43-77`, `src/marathonForecast.ts:386-393` |
| `runDaysPerWeek`, `availableDays` (§2, nicht gefragt, aber gleiche Lage) | – im Wizard. Nur indirekt: Freitext-Wünsche → Claude → `rules.restDays`; die Kalenderblöcke aus Wizard-Schritt 4 fließen nicht in die Planerzeugung | `Onboarding.tsx:461-471` |
| `goalTime` | vorhanden (`raceTargetTime`, nur bei Ziel „Zeit“) | `marathonPreferencesOnboarding.ts:210-247` |

Mögliche Quelle ohne neue Eingabe: Apple-Health-/Strava-Läufe in `health_workouts` (`start_time`, `distance_meters`, `duration_seconds`, `supabase/migrations/001_initial_schema.sql:44-60`) könnten Ist-Umfang und längsten Lauf der letzten 4 Wochen liefern. Aus dem Onboarding liegen sie aber nicht sicher vor (Health-Verbindung erst nach dem Wizard), deshalb wird eine Eingabe als Fallback gebraucht.

### (3) Was wird aus `validateMicroStructure.ts` und `validateSwap.ts`?

Beide Validatoren prüfen **Änderungen durch den Nutzer** (Tausch, Kalender-Umverteilung, Umwandlung), nicht die Planerzeugung. Sie **warnen nur, blocken nie** (`validateSwap.ts:147-152`, `validateMicroStructure.ts:149`). Vorschlag: Was eine Planregel ist, wird Invariante des Kerns. Die Validatoren bleiben als Warnungen für Nutzer-Änderungen, nutzen aber dieselben Prädikate wie der Kern (z. B. was als „hart“ zählt), damit Kern und Warnung nicht auseinanderlaufen.

| Regel heute | Datei:Zeile | Wird im Kern | Bemerkung |
|---|---|---|---|
| Keine zwei intensiven Einheiten an Folgetagen | `validateMicroStructure.ts:107-110`, `validateSwap.ts:72` | **I6** | „intensiv“ = `intensity: high` bzw. Intervall/Tempo/Rennen (`:27-32`); Spec zählt LR ≥ 90 min mit → Prädikat angleichen |
| Nach intensiver Einheit am Folgetag nur locker (Taper: Warnung 95, sonst je Phase) | `validateMicroStructure.ts:112-121` | **I6**, sobald LR als hart zählt | heute deckt der Generator nur „hart vor LR“ ab (`inv:910-940`), nicht „LR nach hart“ |
| Nach Long Run ≥ 2 Tage Abstand zu intensiver Einheit (Peak/Taper: auch zu `medium`) | `validateMicroStructure.ts:123-135`, `validateSwap.ts:71` | **I6** (LR hart) + §6 Platzierung (Q2 ≈ 2 Tage nach LR); für MLR: **I2** (Limit „≥ 2 Tage Abstand zum LR“) | Spec verlangt ≥ 1 Tag, Validator 2 Tage → im Review entscheiden |
| Drei intensive Einheiten in vier Tagen | `validateMicroStructure.ts:81-96` | entfällt | mit I6 (keine Folgetage) nicht mehr möglich |
| Woche ohne Ruhetag | `validateMicroStructure.ts:74-79` | entfällt im Kern | folgt aus 3–6 Lauftagen (**I16**); bleibt als Warnung für Tausche |
| Ruhepuffer zwischen zwei harten Einheiten geht verloren | `validateSwap.ts:75-87` | **I6** / §6 Regel 3 | reine Vorher/Nachher-Warnung, im Kern als „zwischen zwei harten ≥ 1 E/REC/Ruhetag“ |
| Wochen-km steigen durch Tausch um > 30 % | `validateLoadShift.ts:16-50` (über `validateSwap.ts:124`) | bleibt Swap-Prüfung | vergleicht dieselbe Woche vor/nach dem Tausch, keine Progression; verwandt mit **I3/I4** |
| Intensive Einheit in den Taper verschoben | `validatePhaseSwap.ts:49-58` | **I13** (genau 1 Q je Taper-Woche) | |
| Long Run in die Basis verschoben | `validatePhaseSwap.ts:60-65` | entfällt / anpassen | widerspricht der Spec (Basis-Schablonen enthalten einen LR) |
| Peak-Kompression | `validatePhaseSwap.ts:67-75` | entfällt im Kern | nur Nutzer-Tausch |
| Recovery-Achse (Ermüdung des Nutzers) | `validateSwap.ts:128-142` | entfällt im Kern | Nutzerzustand, keine Planregel |
| Long Run = `long` **oder ≥ 15 km** | `validateSwap.ts:38-42` | Prädikat aus §1 übernehmen | Spec-Definition „LR ≥ 90 min ist hart“ |

Zwei Lücken, die beim Übertragen auffallen:
- `validateMicroStructure` gruppiert nach Kalenderwoche und vergleicht nur Paare innerhalb der Woche (`:68-101`). Eine harte Einheit am Sonntag und eine am Montag fallen durch. Die Kern-Invariante I6 muss wochenübergreifend prüfen (das tut `inv:1238-1244` schon).
- Die Intensität kommt aus `intensity`, sonst aus dem Typ. Der Normalisierer setzt für Tempo ohne Angabe `medium` (`src/planV2/normalizeTrainingPlan.ts:33-42`), der Validator dagegen `high` (`validateMicroStructure.ts:27-32`). Der Server setzt `high` ausdrücklich (`inv:890`), deshalb fällt es heute nicht auf. Der Kern sollte `intensity` immer setzen.
