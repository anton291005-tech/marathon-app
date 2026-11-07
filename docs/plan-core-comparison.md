# Offline-Vergleich alt/neu (Plan-Kern Schritt 10)

Erzeugt mit `node -r ./node_modules/sucrase/register scripts/planCoreCompare.ts` (Kern `CONFIG_VERSION` 0.9.0). Nicht von Hand bearbeiten.

**Weg je Fall:** Kern-Eingaben → Wizard-Profil wie Schritt 9 → Server-Whitelist (`validatePlanBody`) → Mapping (`profileToCoreInputs`) → `buildCheckedPlan` (**neu**). Dasselbe Profil → deterministischer heutiger Generator `generateMarathonPlanV2ToRace` mit Standardstruktur und -regeln (**alt**; das ist der Rückfall des Claude-Pfads in `phasedFullPlanGenerator.js`, nicht die Claude-Ausgabe selbst). Der heutige Pfad kennt Lauftage und verfügbare Tage nicht (`legacyPlanProfile`).

**Kennzahlen** (`api/_lib/planMetrics.ts`, für beide gleich): Peak-Woche ohne Renn-km; längster Lauf vom Typ `long`; Q = `tempo` + `interval` je Woche vor der Rennwoche (M-Läufe zählen im Kern als `tempo`); Läufe/Woche max inkl. Rennwoche; Trainingsläufe an nicht verfügbaren Tagen ohne das Rennen (der Renntag ist vorgegeben); Wochen über Vorgabe = Wochen vor der Rennwoche mit mehr Läufen als `runDaysPerWeek`; Vorwoche/Rennwoche in % der Peak-Woche.

## Referenzprofile P1–P6 (Spec §13), Spalten „alt → neu“

| Profil | Wochen | Peak-Woche km | Längster LR km | LR ≥ 30 km | Q/Woche | Läufe/Woche max (Vorgabe) | Wochen über Vorgabe | Vorwoche % Peak | Rennwoche % Peak | Kern errors / warnings |
|---|---|---|---|---|---|---|---|---|---|---|
| P1 5k Anfänger | 8 | 19,8 → 15 | 5,7 → 7 | 0 → 0 | 2 → 0,1 | 4 → 3 (3) | 1 → 0 | 100 → 100 | 37 → 53 | 0 / 11 |
| P2 10k Finisher | 10 | 21,4 → 30 | 6 → 14,6 | 0 → 0 | 2 → 0,9 | 5 → 4 (4) | 1 → 0 | 100 → 100 | 39 → 50 | 0 / 6 |
| P3 HM 1:35 | 12 | 71 → 61 | 18 → 22 | 0 → 0 | 2 → 1,3 | 6 → 5 (5) | 11 → 0 | 74 → 70 | 40 → 43 | 0 / 0 |
| P4 M 4:00 | 16 | 47,7 → 50 | 14,2 → 25 | 0 → 0 | 2 → 0,9 | 6 → 4 (4) | 10 → 0 | 74 → 70 | 39 → 30 | 0 / 6 |
| P5 M 2:50 | 18 | 95,4 → 96 | 28,6 → 31,6 | 0 → 3 | 2 → 1,3 | 6 → 6 (6) | 0 → 0 | 74 → 70 | 40 → 43 | 0 / 3 |
| P6 M 3 Tage | 18 | 47,7 → 41,4 | 14,3 → 23,6 | 0 → 0 | 2 → 0,7 | 6 → 3 (3) | 17 → 0 | 74 → 70 | 39 → 24 | 0 / 2 |

### Kern-Meldungen P1–P6

| Profil | Kern-Meldungen je Code/Regel (alle sind warnings) |
|---|---|
| P1 | `I11/e-above-75-percent-long-run` ×6, `I2/q-softened` ×3, `I13/taper-q-excused` ×1, `I5/min-week-km-raised` ×1 |
| P2 | `I2/q-softened` ×5, `I13/taper-q-excused` ×1 |
| P3 | keine |
| P4 | `I2/q-softened` ×6 |
| P5 | `I2/q-softened` ×2, `I2/mlr-as-e` ×1 |
| P6 | `I13/taper-q-excused` ×1, `I2/q-softened` ×1 |

## Zufallsprofile

Fälle: 200 (Seed 20261110 …), Mapping ok: 200, Kern-Pläne mit error: 0, Ø Kern-warnings: 11.8.

| Kennzahl | alt | neu |
|---|---|---|
| Ø Peak-Woche km | 58,6 | 45,6 |
| Ø längster Long Run km | 14,5 | 17,2 |
| Ø Q-Einheiten je Woche | 1,9 | 0,7 |
| Pläne mit Long Run ≥ 30 km | 4 | 8 |
| Pläne mit Trainingsläufen an nicht verfügbaren Tagen (ohne Rennen) | 126 von 200 | 0 von 200 |
| Pläne mit Wochen über der Lauftage-Vorgabe | 134 von 200 | 0 von 200 |
| Ø Vorwoche in % der Peak-Woche | 70,4 | 75,2 |
| Ø Rennwoche (ohne Rennen) in % der Peak-Woche | 19,6 | 28,3 |

### Kern-Meldungen je Code/Regel (200 Zufallsprofile)

| Code/Regel | Meldungen | Pläne |
|---|---|---|
| `I13/taper-q-excused` | 240 | 184 |
| `I2/q-softened` | 572 | 118 |
| `VOLUME/week-km-raised` | 103 | 84 |
| `I10/no-long-run-in-window` | 82 | 78 |
| `I11/e-above-75-percent-long-run` | 717 | 53 |
| `I5/min-week-km-raised` | 103 | 38 |
| `VOLUME/week-km-reduced` | 36 | 36 |
| `I2/e-shortened-to-fit-week` | 275 | 22 |
| `I2/mlr-as-e` | 120 | 21 |
| `I2/e-shortened-to-long-run` | 95 | 19 |
| `I13/taper-mean-excused` | 6 | 6 |
| `I9/long-run-raised-to-minimum` | 3 | 3 |

## Warum alt und neu abweichen

Die Unterschiede sind Absicht der Spec (`docs/plan-spec.md`), kein Fehler des Mappings. Belege stehen in den Tabellen oben; die Zahlen in diesem Abschnitt gelten für Kern 0.9.0 und Seed 20261110 und werden bei einer Änderung von Hand nachgezogen.

- **Lauftage und verfügbare Tage:** Der heutige Pfad kennt beide nicht (`legacyPlanProfile`) und plant mit festen Regeln (Ruhetag Mo, bis zu 5–6 Läufe). Daher die Wochen über der Vorgabe (P3, P4, P6, 134 von 200) und die Trainingsläufe an nicht verfügbaren Tagen (126 von 200). Der Kern hält beides immer ein (§6, I6/I16).
- **Peak-Woche (Ø 58,6 → 45,6 km, P1 19,8 → 15):** Alt rechnet mit der Spanne (z. B. „20–40 km“ → Ziel 30 km), unabhängig vom genauen Wochenumfang und mit mehr Läufen als vorgegeben. Der Kern startet beim angegebenen Umfang, steigert höchstens +10 % oder +4 km je Woche, deckelt den Peak nach Lauftagen und bei Start × 1,5 und plant nur, was die Einheiten-Grenzen tragen (§5.1–5.3, Tragfähigkeit und monotoner Verlauf, Review-Punkte 32, 37). Für P1 ist der Peak-Bereich 13–15 km freigegeben (§13).
- **Q je Woche (Ø 1,9 → 0,7, P1 2 → 0,1):** Alt setzt in jeder Woche einen Intervall- und einen Tempotag, auch für Einsteiger mit 3 Tagen und im Taper. Der Kern begrenzt Q nach Lauftagen (3 Tage: 1), lässt Q2 in Basis, Entlastung und bei Einsteigern weg und schwächt Q zu E + Strides ab, wenn Q-Budget (15 % bei 3–4 Tagen, sonst 20 %) oder Mindestgröße nicht passen (`I2/q-softened`, §6, Review-Punkt 38). P1 läuft ohne Rennergebnis im Einsteiger-Modus: im ganzen Plan 1 T-Einheit, 3 abgeschwächte Q. Marathontempo-Läufe zählen im Kern als `tempo` und damit als Q; Long Runs mit M-Block zählen als `long`.
- **Long Runs ≥ 30 km (P5 0 → 3):** Für den Marathon mit 5–6 Lauftagen verlangt die Spec einen längsten Long Run von 30–34 km, mindestens zweimal (§7.1, §13 P5). Der heutige Generator deckelt den Long Run tiefer (P5: 28,6 km).
- **Längster Long Run höher (P2 6 → 14,6, P4 14,2 → 25, P6 14,3 → 23,6):** Der Kern setzt den Long-Run-Anteil nach Lauftagen (bis 55 % bei 3 Tagen) und das Peak-Ziel je Distanz (§7.1). Alt verteilt mehr Läufe und hält den Long Run kurz.
- **Taper (P6 Rennwoche 39 → 24 %):** Bei 3 Lauftagen bleiben in der Rennwoche neben dem Rennen 2 Läufe (P6: E 6 km, E 4,1 km); der Lauf in den letzten 2 Tagen ist höchstens 30 min, Q entfällt (`I13/taper-q-excused`, §5.4, §8). Die Taper-Reduktion prüft der Kern als Mittel über die Taper-Phase (I13), nicht je Woche. Die Vorwoche liegt im Kern bei 70 % (Taper 70 % / 42,5 %, §5.4); alt bei 74 %.
- **Warnings:** Alle Kern-Meldungen sind begründete warnings (Hinweis des Kerns erklärt die Abweichung, Schritt 7); 0 errors in allen Fällen.
