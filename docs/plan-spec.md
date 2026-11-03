# MyRace – Plan-Spec v0.3 (Entwurf)

> Zweck: Single Source of Truth für den deterministischen Plan-Kern. Jede Regel ist eine Zahl und damit ein Test.
> Herkunft jeder Zahl ist markiert: **[L]** Literatur · **[P]** Praxis-Konsens (Daniels/Pfitzinger/Hansons-Pläne) · **[E]** eigene Setzung → muss ins Spoho-Review.
> Status: Entwurf v0.3, 3.11.2026. Abgeglichen mit `docs/plan-architecture-inventory.md` (963f99e) und `docs/plan-spec-gap.md` (c12c630). Wo Code und Spec abweichen, gilt die Spec; Ausnahmen sind in §16 begründet.
>
> **Was der Umbau tatsächlich ersetzt:** Der Code rechnet Volumen, Taper, Peak, km-Verteilung, Long Runs, Bausteine, Texte und Zonen bereits selbst. Claude entscheidet heute nur die **Wochenform** (welcher Tag welcher Typ, Anzahl Läufe/harte Einheiten) und übersetzt Freitext. Neu zu bauen sind daher: deterministische Wochenschablonen (§6), Einheiten-Limits als Prüfung statt Reparatur (§7, §12) und eine Pace-Berechnung (§3), die es heute nicht gibt.

---

## 0. Scope MVP

- Distanzen: 5 km, 10 km, Halbmarathon (HM), Marathon (M). Keine Ultras, keine Trail-/Höhenmeter-Logik.
- 3–6 Lauftage pro Woche.
- Ein Zielrennen pro Plan, Plan endet am Renntag.
- Kein Krafttraining/Cross-Training im Plan-Kern (kann später als Slot ergänzt werden).

## 1. Begriffe

| Begriff | Definition |
|---|---|
| Woche | Mo–So, Woche 1 = erste volle oder angebrochene Woche ab Planstart |
| Wochen-km | Summe aller Einheiten inkl. Ein-/Auslaufen, ohne Strides |
| Harte Einheit | I, T, R, Rennen, LR ≥ 90 min, jede Einheit mit ≥ 5 km bei M-Pace oder schneller. **Eine gemeinsame Definition** (`isHardSession`) für Kern, `validateMicroStructure` und `validateSwap`. |
| Qualitäts-km | nur die Belastungsanteile bei M/T/I/R-Pace (ohne Ein-/Auslaufen, ohne Trabpausen) |
| Peak | höchster Wochenumfang des Plans |

## 2. Inputs

| Feld | Pflicht | Wertebereich | Default / Fallback |
|---|---|---|---|
| `distance` | ja | 5k, 10k, hm, m | – |
| `raceDate` | ja | ≥ Mindest-Planlänge (§4) in der Zukunft | – |
| `runDaysPerWeek` | ja | 3–6 | – |
| `availableDays` | ja | Teilmenge Mo–So, Anzahl ≥ `runDaysPerWeek` | alle |
| `longRunDay` | nein | Wochentag aus `availableDays` | So, sonst Sa |
| `currentWeeklyKm` | ja | 0–150 (Ø letzte 4 Wochen) | – |
| `longestRecentRunKm` | nein | 0–45 (letzte 4 Wochen) | 30 % von `currentWeeklyKm`, min. 5 |
| `recentRace` | nein | Distanz + Zeit + Datum | siehe §3 |
| `goalTime` | nein | – | kein Zielpace-Training, nur Formpace |

**Onboarding-Scope (laut Gap neu):** Heute fragt der Wizard nur eine Umfangs-Spanne ab; Lauftage, verfügbare Tage, Wochen-km, längster Lauf und Rennergebnis fehlen, im Profil steht nur eine Marathon-Bestzeit ohne Datum. Neu abzufragen:

1. Lauftage pro Woche (3–6) – Pflicht
2. Verfügbare Tage + Long-Run-Tag – Pflicht (Default: alle Tage, LR So)
3. Aktuelle Wochen-km als Zahl (statt Spanne) – Pflicht
4. Letzter Wettkampf oder geschätzte 5k/10k-Zeit (Distanz, Zeit, Datum) – optional, sonst Einsteiger-Modus
5. Längster Lauf der letzten 4 Wochen – optional, Fallback siehe Tabelle

Bestehende Profile ohne diese Felder: beim nächsten Planerstellen nachfragen, nicht raten.
| `freeText` | nein | – | → Claude-Regeln (§10) |

## 3. Form und Pace

**Grundsatz: Trainingspaces kommen aus der aktuellen Form, nicht aus dem Ziel.** [L: Daniels]

> Neu: Laut Bestandsaufnahme gibt es heute keine Pace-Berechnung, Einheiten haben nur Zonen. Dieser Abschnitt ist komplett neu zu implementieren.

1. VDOT aus `recentRace` (Daniels-Gilbert-Formel).
2. Rennen älter als 12 Wochen: −1 VDOT je angefangene 6 Wochen darüber, max. −4. [E]
3. Kein Rennen: Nutzer gibt geschätzte 5-km- oder 10-km-Zeit an; fehlt auch die → Einsteiger-Modus: Paces nur als RPE/Gefühl, keine I- und R-Einheiten. [E]
4. Zielpace (`goalTime`) wird für M-/HM-Pace-Einheiten nur genutzt, wenn `VDOT_Ziel − VDOT_aktuell ≤ 2`. Sonst Renntempo aus aktueller Form + Hinweis im UI („Ziel liegt aktuell X min über deiner Form"). [E]

Paces (sec/km) aus VDOT nach Daniels-Tabellen:

| Code | Name | Ungefähr | App-Zone |
|---|---|---|---|
| REC | Regeneration | E-Pace + 20–40 s/km | Z1 |
| E | Locker | 59–74 % VO2max | Z2 |
| M | Marathonpace | 75–84 % | Z3 |
| T | Schwelle | 83–88 % | Z4 |
| I | Intervall | 95–100 % | Z5 |
| R | Wiederholung | 105–120 % | Z5+ |

**Invariante:** `pace(REC) > pace(E) > pace(M) > pace(T) > pace(I) > pace(R)` (sec/km, also langsamer → größer).

## 4. Planlänge und Phasen

| Distanz | Harte Untergrenze | Unter Empfehlung (Warnung, Peak reduziert) | Empfohlen | Max |
|---|---|---|---|---|
| 5k | 4 Wo | 4–5 | 6–10 | 16 |
| 10k | 5 Wo | 5–7 | 8–12 | 16 |
| HM | 6 Wo | 6–9 | 10–14 | 18 |
| M | 8 Wo | 8–11 | 12–18 | 20 |

[P für „empfohlen", E für Grenzen] Unter harter Untergrenze: keine Planerstellung, klare Fehlermeldung. Über Max: Plan startet erst `Max` Wochen vor dem Rennen, davor „freie Wochen" ohne Plan.

**Phasen** (rückwärts vom Renntag gebaut):

1. **Taper**: M und HM 2 Wochen (inkl. Rennwoche), 10k und 5k 1 Woche (Rennwoche). [L: Bosquet 2007 – Optimum 8–14 Tage]
2. Restliche Wochen: **Basis 35 % / Aufbau 35 % / Spezifisch 30 %**, gerundet, jede Phase ≥ 1 Woche sobald ≥ 6 Restwochen. [E]

## 5. Wochenumfang

### 5.1 Start
`startKm = clamp(currentWeeklyKm, minStart[distance], 150)` mit `minStart`: 5k 10 · 10k 15 · HM 20 · M 25. [E]
Liegt `currentWeeklyKm` unter `minStart`: Plan startet trotzdem bei `currentWeeklyKm`, Peak wird nach §5.2 begrenzt.

### 5.2 Peak

`peakKm = min( tableMax, max(tableMin, startKm), startKm × 1.5 )` und zusätzlich erreichbar unter den Steigerungsregeln (§5.3). [E]

Abweichung zum Code: Heute bestimmen Zielzeit und Umfangs-Spanne × 1,2 den Peak. Die Spec nimmt Lauftage und tatsächliche Wochen-km, weil die Zielzeit nichts über die Belastbarkeit aussagt. Die Zielzeit darf den Peak nur **innerhalb** der Tabellenspanne verschieben (schnelleres Ziel → oberer Teil der Spanne), nie darüber hinaus.

Peak-Tabelle (km/Woche) [E, orientiert an Stufen in Daniels/Pfitzinger/Hansons]:

| Distanz | 3 Tage | 4 Tage | 5 Tage | 6 Tage |
|---|---|---|---|---|
| 5k | 20–30 | 25–40 | 35–55 | 45–70 |
| 10k | 25–35 | 30–45 | 40–60 | 50–80 |
| HM | 30–40 | 35–55 | 45–70 | 55–90 |
| M | 35–50 | 45–65 | 55–85 | 65–110 |

### 5.3 Steigerung

- Zielwert: Woche zu Woche ≤ +10 % oder ≤ +4 km (das Größere). [P]
- **Harte Grenze:** `km(w) ≤ 1.30 × km(w−2)` – keine Steigerung > 30 % über zwei Wochen. [L: Nielsen et al. 2014, JOSPT – Assoziation bei Laufanfängern]
- Entlastungswoche: jede 4. Woche in Basis/Aufbau/Spezifisch (3:1), −20 bis −30 % zur Vorwoche (Code heute −28 %, liegt im Bereich). Nach Entlastung wird höchstens auf das Niveau vor der Entlastung gesprungen, nicht darüber – der Code erlaubt heute +10 % darüber, das wird geändert. [P]
- Kennzeichnung: `isRecoveryWeek = true` **und** `focus` enthält „Entlastung" (die App erkennt Entlastungswochen heute nur am Text). Die App soll auf das Flag umgestellt werden; bis dahin liefert der Kern beides.
- Peak wird in der Spezifisch-Phase erreicht, frühestens 4 Wochen vor dem Rennen. [P]

### 5.4 Taper

- Volumen: insgesamt −41 bis −60 % gegenüber Peak über die Taper-Phase, progressiv. [L: Bosquet 2007]
  - M/HM Taper-Woche 1 (T−2): 65–75 % Peak
  - Rennwoche ohne Rennen: 35–50 % Peak
  - 5k/10k Rennwoche ohne Rennen: 40–60 % Peak (Code heute 40 %, liegt im Bereich)
- **Intensität bleibt:** pro Taper-Woche genau 1 verkürzte Qualitätseinheit im Renntempo/T. [L: Bosquet 2007]
- **Frequenz bleibt:** Lauftage ≥ `runDaysPerWeek − 1`. [L: Bosquet 2007]

## 6. Wochenschablonen

Slots pro Woche (Basis → Spezifisch). Q = Qualitätseinheit, LR = Long Run, MLR = mittellanger Lauf.

| Lauftage | Basis | Aufbau / Spezifisch |
|---|---|---|
| 3 | LR, E, E (+Strides) | LR, Q1, E |
| 4 | LR, Q1(leicht), E, E | LR, Q1, Q2*, E |
| 5 | LR, Q1, E, E, E | LR, Q1, Q2, E, E |
| 6 | LR, Q1, E, E, E, REC | LR, Q1, Q2, MLR**, E, REC |

\* Q2 bei 4 Tagen nur ab Aufbau und nur wenn nicht Einsteiger-Modus. ** MLR nur HM/M, sonst E.

**Platzierung (Algorithmus):**
1. LR auf `longRunDay`.
2. Q1 ≈ 3 Tage vor LR, Q2 ≈ 2 Tage nach LR (bzw. maximal verteilt).
3. Harte Einheiten nie an aufeinanderfolgenden Tagen; zwischen zwei harten Einheiten ≥ 1 E-/REC-/Ruhetag. [P, ≈48 h]
4. Nicht in `availableDays` → Ruhetag. Lässt sich Regel 3 nicht erfüllen → Q2 entfällt (nicht verschieben auf Kollision).
5. Max. Q-Einheiten (ohne LR): 3 Tage 1 · 4 Tage 2 · 5 Tage 2 · 6 Tage 2.

**Verteilung der Wochen-km:** LR und Q-Einheiten bekommen ihre Größe aus §7, der Rest wird gleichmäßig auf E/REC verteilt, innerhalb deren Limits. Passt der Rest nicht in die Limits → Wochen-km wird reduziert, nie eine Einheit über ihr Limit aufgebläht.

**Intensitätsverteilung pro Woche:**
- Qualitäts-km ≤ 20 % der Wochen-km (Ziel), ≤ 25 % (hart). [L: Seiler 2010, Polarisierung ~80/20; Grenze E]

## 7. Einheiten-Bibliothek

Jede Einheit im Plan muss einem Typ aus dieser Tabelle entsprechen. Ein-/Auslaufen: je 1,5–3 km bei E, zählt zu Einheiten-km, nicht zu Qualitäts-km.

| Typ | Inhalt | Limits |
|---|---|---|
| REC | locker, REC-Pace | 20–45 min |
| E | locker, E-Pace, optional 4–8 × 20 s Strides | 25–75 min (6 Tage: bis 90 min), max. 75 % des LR derselben Woche |
| MLR | E-Pace, nur HM/M ab Aufbau, 5–6 Tage | 75–110 min, ≤ 75 % LR, ≥ 2 Tage Abstand zum LR [P: Pfitzinger] |
| LR | E-Pace | siehe 7.1 |
| LR+M | LR mit M-Pace-Block am Ende, nur M, Spezifisch | M-Anteil ≤ 50 % des LR [E] und ≤ min(29 km, 110 min) [L: Daniels] |
| M | Dauerlauf M-Pace | ≤ min(29 km, 110 min) [L: Daniels] |
| T | Tempodauerlauf ≤ 20 min oder Cruise-Intervalle (z. B. 3–5 × 1,6 km, 1 min Trab) | T-km pro Einheit ≤ 10 % Wochen-km [L: Daniels] |
| I | 3–5 min Wiederholungen, Trabpause ≈ gleich lang | I-km ≤ min(8 % Wochen-km, 10 km) [L: Daniels] |
| R | 200–400 m, volle Erholung | R-km ≤ min(5 % Wochen-km, 8 km) [L: Daniels]; nur 5k/10k |
| RACE | Wettkampf | genau einmal, am `raceDate` |

Beispiel 2:50-Profil bei 95 km: T ≤ 9,5 km, I ≤ 7,6 km. Die heutigen 19,9-km-Tempoblöcke wären damit strukturell unmöglich.

### 7.1 Long Run

| | Regel | Herkunft |
|---|---|---|
| Anteil an Wochen-km (hart) | 3 Tage ≤ 55 % · 4 Tage ≤ 50 % · 5 Tage ≤ 38 % · 6 Tage ≤ 33 % | [E] – Daniels empfiehlt 25–30 %; das ist für 3–4-Tage-Marathonpläne nicht umsetzbar → **Review-Punkt** |
| Zeit | ≤ 150 min Ziel [L: Daniels], ≤ 180 min hart [E] | |
| Steigerung | ≤ +2 km oder ≤ +15 % zur letzten LR (Größeres), max. +3 km | [E] |
| Startwert | ≤ `longestRecentRunKm` + 2 km | [E] |
| Peak-Ziel M | 5–6 Tage 30–34 km (2–3 Läufe ≥ 30 km); 3–4 Tage 26–30 km, begrenzt durch 180 min | [P] |
| Peak-Ziel HM | 16–22 km | [P] |
| Peak-Ziel 10k | 12–18 km | [P] |
| Peak-Ziel 5k | 8–14 km | [P] |
| Pflicht | HM/M: jede Woche außer Rennwoche hat genau 1 LR; Entlastungswoche: LR −20–30 % | [E] |

### 7.2 Q-Typen je Phase und Distanz

| | Basis | Aufbau | Spezifisch | Taper |
|---|---|---|---|---|
| 5k | Strides, R (ab W3) | I, T | I, R | 1 × kurz I/Renntempo |
| 10k | Strides, T (ab W3) | I, T | I, T | 1 × kurz T/Renntempo |
| HM | Strides, T (ab W3) | T, I | T, HM-Pace-Blöcke | 1 × HM-Pace kurz |
| M | Strides, T (ab W3) | T, M | M, LR+M, T | 1 × M-Pace kurz |

Einsteiger-Modus: in Basis nur Strides, keine I/R im ganzen Plan.

## 8. Rennwoche

- RACE am `raceDate`, Distanz exakt.
- Letzte Q-Einheit ≥ 4 Tage vor M, ≥ 3 Tage vor HM/10k/5k.
- Letzte 2 Tage vor dem Rennen: nur REC/E ≤ 30 min oder Ruhe, optional Strides. (Code heute bis 6 bzw. 10 km vor dem Marathon – wird auf die Zeitgrenze umgestellt; 30 min ≈ 6–7 km bei schnellen Läufern, 4–5 km bei langsamen.)
- Kein LR in der Rennwoche.
- Plan endet am Renntag (Erholungswoche danach: nicht im MVP).

## 9. Wöchentliche Formprüfung

Nicht im MVP-Kern. Spätere Erweiterung: VDOT-Update alle 4 Wochen aus geloggten Einheiten, nur nach unten automatisch, nach oben mit Bestätigung.

## 10. Claude vor dem Kern: Freitext → Regeln

Claude übersetzt `freeText` in ein Regel-Objekt mit fester Schema-Whitelist. Regeln dürfen Sicherheitsgrenzen nur **verschärfen**, nie lockern.

```ts
type PlanRules = {
  unavailableDays?: Weekday[];          // zusätzlich zu availableDays
  longRunDay?: Weekday;
  maxMinutesByDay?: Partial<Record<Weekday, number>>; // 20–300
  preferQualityDays?: Weekday[];
  avoidTypes?: ("I" | "R" | "T" | "M")[];
  maxWeeklyKm?: number;                 // nur ≤ berechnetem Peak wirksam
  notes?: string;                       // ungeparster Rest, nur für Coach-Texte
};
```

- Unbekannte Felder → verworfen und geloggt.
- Widerspruch zu Pflicht-Inputs (z. B. weniger freie Tage als Lauftage) → Kern gewinnt, UI-Hinweis.

## 11. Claude nach dem Kern: Texte

**MVP: entfällt.** Bausteine und Texte erzeugt der Code laut Bestandsaufnahme schon deterministisch. Claude-Texte erst, wenn die Template-Texte nachweislich nicht reichen. Dann gilt:

- Input: fertiges Skelett (Tag, Typ, km, Segmente, Paces) je `sessionId`.
- Output: nur `{ sessionId: { title, description } }`.
- Zahlen kommen **nicht** von Claude: Beschreibungen nutzen Platzhalter (`{km}`, `{pace_T}`, `{reps}`), die der Kern einsetzt.
- Validierung: Fingerprint (Tag, Typ, km, Segmente, Paces) vor und nach dem Text-Schritt identisch; jede Abweichung oder fehlende ID → Template-Text des Kerns.
- Ausfall von Claude → Plan bleibt vollständig nutzbar mit Template-Texten.

## 12. Invarianten (= Testsuite)

| ID | Invariante |
|---|---|
| I1 | Wochen-km = Summe der Einheiten-km jeder Woche |
| I2 | Jede Einheit hat einen Typ aus §7 und liegt in dessen Limits |
| I3 | `km(w) ≤ 1.30 × km(w−2)` für alle w ≥ 3 |
| I4 | `km(w) ≤ max(1.10 × km(w−1), km(w−1) + 4)` außer erste Woche nach Entlastung (dann ≤ Niveau vor Entlastung) |
| I5 | Peak ≤ Tabellen-Max (§5.2) und ≤ `startKm × 1.5` |
| I6 | Keine zwei harten Einheiten an aufeinanderfolgenden Tagen – **auch über die Wochengrenze** (So → Mo) |
| I7 | Q-Einheiten pro Woche ≤ Max nach Lauftagen |
| I8 | Qualitäts-km ≤ 25 % der Wochen-km |
| I9 | LR-Anteil, LR-Zeit, LR-Steigerung nach §7.1 |
| I10 | HM/M: genau 1 LR pro Woche außer Rennwoche |
| I11 | Kein E/REC/MLR länger als der LR derselben Woche |
| I12 | T ≤ 10 %, I ≤ min(8 %, 10 km), R ≤ min(5 %, 8 km), M ≤ min(29 km, 110 min) |
| I13 | Taper-Volumen nach §5.4, genau 1 Qualitätseinheit pro Taper-Woche |
| I14 | Genau ein RACE, am `raceDate`, letzte Einheit des Plans |
| I15 | Regeln aus §8 (Abstände vor dem Rennen) |
| I16 | Lauftage ⊆ verfügbare Tage, Anzahl = `runDaysPerWeek` (Taper: ≥ −1) |
| I17 | Pace-Reihenfolge nach §3 |
| I18 | Zielpace nur, wenn VDOT-Lücke ≤ 2 |
| I19 | Fingerprint unverändert nach Claude-Text-Schritt |
| I20 | Determinismus: gleiche Inputs → identischer Plan (Snapshot) |
| I21 | Jede Woche hat `focus` und `dates`, auch eine angebrochene Woche 1 |
| I22 | Entlastungswochen: `isRecoveryWeek` und „Entlastung" im `focus` stimmen überein |

Zusätzlich: Property-Tests über zufällige gültige Inputs (alle Distanzen × 3–6 Tage × Planlängen × Startumfänge), alle Invarianten müssen halten.

## 13. Referenzprofile (Abnahmekriterien)

| # | Profil | Inputs | Erwartung |
|---|---|---|---|
| P1 | 5k Anfänger | 3 Tage, 10 km/Wo, kein Rennen, 8 Wo | Einsteiger-Modus, Peak 18–22 km, LR-Peak 7–10 km, keine I/R |
| P2 | 10k Finisher | 4 Tage, 20 km/Wo, 10k-Schätzung 62:00, 10 Wo | Peak 28–35 km, LR-Peak 10–13 km, max. 1 Q in Basis |
| P3 | HM 1:35 | 5 Tage, 45 km/Wo, 10k 43:30 vor 4 Wo, 12 Wo | Peak 55–65 km, LR-Peak 18–21 km, T-Einheit ≤ 6,5 km |
| P4 | M 4:00 | 4 Tage, 35 km/Wo, HM 1:55 vor 6 Wo, 16 Wo | Peak 50–55 km, LR-Peak 26–28 km (180-min-Grenze), ≥ 2 LR ≥ 24 km |
| P5 | M 2:50 | 6 Tage, 70 km/Wo, HM 1:21 vor 8 Wo, 18 Wo | Peak 95–105 km, LR-Peak 30–34 km, 2–3 LR ≥ 30 km, T ≤ 10 km, nie > 110 km |
| P6 | M 3 Tage | 3 Tage, 30 km/Wo, HM 2:05 vor 8 Wo, 18 Wo | Peak 40–45 km, LR-Peak 24–26 km, bewusster Grenzfall für LR-Anteil |

Pro Profil zusätzlich: Vergleichsspalte mit einem passenden Literaturplan (Daniels, Pfitzinger, Hansons): Peak-km, LR-Max, Anzahl LR ≥ 30 km, Q-Einheiten/Woche, Taper-Volumen. Abweichung > 15 % → begründen oder Regel anpassen.

## 14. Offene Fragen für das Spoho-Review

1. LR-Anteil bei 3–4 Lauftagen (55 % / 50 %) – vertretbar oder lieber kürzere LR akzeptieren?
2. 180 min als harte LR-Grenze für langsame Marathonläufer (statt Daniels' 150 min)?
3. Steigerung 10 %/Woche als Zielwert und 30 %/2 Wochen als harte Grenze – reicht die Evidenz (Nielsen: Anfänger, Assoziation)?
4. Entlastungsrhythmus 3:1 für alle Niveaus oder 2:1 für Anfänger/Ältere?
5. VDOT-Abschlag für alte Rennergebnisse (−1 je 6 Wo).
6. Peak-Tabelle §5.2 – realistisch für die Zielgruppe?
7. Taper-Verteilung innerhalb der −41–60 %.

## 15. Abgleich mit der Bestandsaufnahme

### 15.1 Übernehmen (laut Inventar ohne Umbau nutzbar)
Volumenreferenz, Volumenverlauf, `buildVolumeContext`, Long-Run-Planung, km-Verteilung, Bausteine/Texte/Zonen. `checkPlanInvariants` wird Grundlage der Testsuite (§12). **Vor Übernahme:** jede dort hart codierte Zahl gegen §5–§7 prüfen; Abweichungen werden entweder als Regel in diese Spec übernommen (mit Begründung) oder im Code angepasst.

### 15.2 Ersetzen
- Wochenform von Claude → Wochenschablonen §6.
- `enforcePlanInvariants`: Korrekturschritte, die nur Claudes Wochenform reparieren, entfallen; die übrigen werden reine Prüfungen. Kein Schritt darf nach dem Umbau noch Einheiten verändern.
- **Client-Kopie** (live für den „vereinfachten Plan" im Onboarding, 49 Regelverstöße vs. 0 auf dem Server): wird durch denselben Kern ersetzt. Es gibt danach genau eine Implementierung.

### 15.3 Entscheidungen (Vorschlag)
- **Ort des Kerns:** ein reines TS-Modul ohne React/Node-Abhängigkeiten, das Server (Vercel) und App identisch importieren. Server ist maßgeblich; die App nutzt es nur für Onboarding-Vorschau und Offline-Fallback. Wie die JS-API das TS-Modul einbindet, entscheidet der Fable-Plan anhand des Builds.
- **Freitext:** Claude behält die Übersetzung Freitext → Regeln, aber nur über das Schema in §10; der Kern validiert und kann Regeln nur verschärfen.
- **Chat-Aktion „Marathon-Plan erzeugen":** rechnet einen Plan, übernimmt ihn nie → im MVP entweder an den neuen Kern anschließen oder aus dem Chat entfernen. Nicht im halbfertigen Zustand lassen.
- **Bestehende Pläne:** keine Migration; nur neu erzeugte Pläne laufen über den neuen Kern.

### 15.4 Nebenbefunde, die der Kern berücksichtigen muss
- Woche 1 bei Start mitten in der Woche verliert beim Normalisieren `focus` und `dates` → Invariante I21: jede Woche hat `focus` und `dates`, auch eine angebrochene Woche 1.
- Schwimm-Einheiten werden beim Normalisieren zu `easy` → Normalisierung darf unbekannte/Nicht-Lauf-Typen nie zu Lauf-Typen umdeuten (betrifft vor allem den Coach/Patches, nicht den Lauf-Kern selbst).

### 15.5 Geklärt durch `plan-spec-gap.md`
- **Ausgabeformat:** Der Kern liefert nur `TrainingPlanV2` (gespeicherter Plan). `AiPlanWeek` wird bei jeder Anzeige daraus abgeleitet und nimmt die Patches auf. Neue Felder (Paces, Segmente, `isRecoveryWeek`, neue Typen) müssen in `toPlanWeeks` und `planToAi` durchgereicht werden – gehört zum Scope, sonst kommen sie nie in der UI an.
- **Inputs:** fehlen alle → Onboarding-Änderung (§2) gehört zum Scope.
- **Validatoren:** bleiben Warnungen bei Nutzeränderungen, blockieren nie. Harte Einheiten/Abstände → I6, Taper-Intensität → I13. Ermüdungs-Achse, Peak-Kompression und „Long Run in die Basis“ entfallen im Kern. Beide Validatoren nutzen danach `isHardSession` aus dem Kern und prüfen über die Wochengrenze.

## 16. Gap-Zusammenfassung (Code → Spec)

| Bereich | Code heute | Spec | Aufwand |
|---|---|---|---|
| Peak | Zielzeit + Spanne × 1,2 | Lauftage + Start × 1,5, Tabelle | mittel |
| Steigerung | +10 % | +10 % oder +4 km; hart ≤ 30 %/2 Wo | klein |
| Entlastung | −28 %, danach +10 % über altes Niveau | −20–30 %, danach max. altes Niveau | klein |
| Taper | Anteile der Spitze | übernehmen, Bereiche angepasst | – |
| **Long Run** | 30 % der Wochen-km bei 4–6 Tagen, keine Zeit-/Steigerungsgrenze → M 4:00 nur 14,2 km | §7.1: Anteil nach Lauftagen, 150/180 min, ±2–3 km/Wo | **groß** |
| **Wochenschablonen** | Claude; Standardregeln erzeugen 6 Tage trotz `maxTrainingDaysPerWeek: 5` | §6 deterministisch | **groß** |
| **Einheiten** | locker, lang, Intervall, Tempo; Tempo bis 24 km | §7 Bibliothek mit Limits | **groß** |
| Paces | keine | §3 VDOT | **groß** |
| Rennwoche | bis 6/10 km in den letzten 2 Tagen | ≤ 30 min | klein |
| Onboarding | Umfangs-Spanne, M-Bestzeit ohne Datum | §2 fünf Fragen | mittel |
| Durchreichen | `toPlanWeeks`/`planToAi` kennen neue Felder nicht | durchreichen | mittel |

## Quellen

- Daniels, J. *Daniels' Running Formula* (3./4. Aufl.) – VDOT, Pace-Zonen, Einheiten-Limits.
- Pfitzinger, P. & Douglas, S. *Advanced Marathoning* – MLR, LR-Progression, Entlastungswochen.
- Humphrey, L. *Hansons Marathon Method* – Vergleichspläne niedrigerer LR-Längen.
- Bosquet, L. et al. (2007). Effects of tapering on performance: a meta-analysis. *Med Sci Sports Exerc*, 39(8).
- Nielsen, R. O. et al. (2014). Excessive progression in weekly running distance and risk of running-related injuries. *J Orthop Sports Phys Ther*, 44(10).
- Seiler, S. (2010). What is best practice for training intensity and duration distribution in endurance athletes? *Int J Sports Physiol Perform*, 5(3).
