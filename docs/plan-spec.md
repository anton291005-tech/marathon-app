# MyRace – Plan-Spec v0.9 (Entwurf)

> Zweck: Single Source of Truth für den deterministischen Plan-Kern. Jede Regel ist eine Zahl und damit ein Test.
> Herkunft jeder Zahl ist markiert: **[L]** Literatur · **[P]** Praxis-Konsens (Daniels/Pfitzinger/Hansons-Pläne) · **[E]** eigene Setzung → muss ins Spoho-Review.
> Status: Entwurf v0.9, 5.11.2026 (v0.3: 3.11.2026). Nachtrag 6.11.2026 (Umbauplan Schritt 9, ohne Änderung der Pläne): Standardwert für den längsten Lauf nach Distanz und Lauftagen, Wizard nur 5k/10k/HM/M, Renndatum unter der Untergrenze abgelehnt, `freeText` nie im Plan (§2), Review-Punkt 39 (§14). Änderungen v0.9 (Schritt 6, Nachtrag 2 nach dem Review vom 5.11.2026): monotoner Volumenverlauf mit Tragfähigkeit, Entlastung −20 bis −30 % zur gelieferten Vorwoche (§5.3, I4/I5), Bezug des Long-Run-Anteils = Plan ohne Tragfähigkeit (§6, I9), E bei 3 Lauftagen HM/M bis 90 min und harte Untergrenze 15 min für E/REC/LR (§6, §7, I2/I9), Q1 der Entlastungswoche mit dem Faktor der Woche (§6, I12), Abnahme P2/P3 bestätigt (§13), Review-Punkte 29, 31–36 (§14); Runde 3 (5.11.2026): Aufbauwochen werden nicht mehr angehoben, E/REC dafür bis 15 min gekürzt (§5.3, §6, I2), Punkte 29, 34, 36 bestätigt, Punkt 37 (Kosten der Monotonie) neu. Änderungen v0.8 (Schritt 6, Nachtrag nach dem Review vom 5.11.2026): Tragfähigkeit der Wochen in `planVolume` (§5.3), Mindest-Wochen-km = Lauftage × E 25 min (§5.1), Long Run nie über seine Grenzen, E dafür bis zur Länge des Long Runs (§6, §7, I2/I9/I11), Mindestgrößen der Q-Einheiten (§7), Ziel des längsten Long Runs = Anteilsgrenze × Peak-Woche (§7.1), Abnahme P2/P3 (§13), Review-Punkte 21, 29, 31, 32 (§14). Änderungen v0.7 (Schritt 6, Einheiten): Rennwoche mit allen Lauftagen (§5.4, §6), Mindest-Wochen-km (§5.1), Q-Budget und Verteilung (§6), Long-Run-Ziel, -Plateau und Taper-Long-Run (§7.1), Q-Typ-Regeln, Renntempo-Arten und Einsteiger nach Minuten (§7.2), Strides am Vortag (§8), Wortlaut I9/I11/I13 (§12), P4/P6 Long-Run-Peak (§13), Review-Punkte 19–29 (§14). Änderungen v0.6 (Schritt 5, Wochenschablonen; nach dem P1–P6-Review ergänzt: Rennwoche ohne Ruhetage-Lücke direkt vor dem Rennen und höchstens 2 Ruhetage am Stück, bei ≤ 3 Lauftagen alle Läufe, §5.4/§6/§8): Hart-Annahme der Platzierung, MLR nie zwischen zwei harten Tagen, Taper- und Rennwochen-Schablone (§6), Sperrfenster für den Long Run vor dem Rennen (§8), Ausnahmen bei I10/I13, Wortlaut I6/I16 (§12), Review-Punkte 16–18 (§14). Änderungen v0.5 (Schritt 4, Form und Pace): §14 Punkte 14–15 (VDOT-30-Abweichung des Rechners, Herkunft der Pace-Anteile). Änderungen v0.4 (Schritt 2, Phasen und Wochenumfang): Entlastung fest −20 % (§5.3), Peak-Position im Korridor (§5.2), Geltungsbereich von I3–I5 (§12), Zusatz-Taper-Woche bei kurzer Rennwoche (§4), P1 auf 13–15 km (§13). Abgeglichen mit `docs/plan-architecture-inventory.md` (963f99e) und `docs/plan-spec-gap.md` (c12c630). Wo Code und Spec abweichen, gilt die Spec; Ausnahmen sind in §16 begründet.
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
| `longRunDay` | nein | Wochentag aus `availableDays` (sonst Fehler `invalid-input`) | So, sonst Sa, sonst letzter verfügbarer Wochentag |
| `currentWeeklyKm` | ja | 0–150 (Ø letzte 4 Wochen) | – |
| `longestRecentRunKm` | nein | 0–45 (letzte 4 Wochen) | Onboarding: Standardwert nach Distanz und Lauftagen (Tabelle unten, immer > 0), ausdrücklich mitgeschickt. Kern ohne Angabe (alte Daten, Tests): 30 % von `currentWeeklyKm`, min. 5 |
| `recentRace` | nein | Distanz + Zeit + Datum | siehe §3 |
| `goalTime` | nein | – | kein Zielpace-Training, nur Formpace |
| `startYmd` | ja | heute bis `raceDate` − harte Untergrenze (§4) | heute (Onboarding: `planStartChoice`) |
| `freeText` | nein | – | MVP: nur in den Preferences gespeichert (nie im Plan, nicht in `meta.core`), Coach liest; später → Claude-Regeln (§10) |

**Onboarding-Scope (laut Gap neu):** Heute fragt der Wizard nur eine Umfangs-Spanne ab; Lauftage, verfügbare Tage, Wochen-km, längster Lauf und Rennergebnis fehlen, im Profil steht nur eine Marathon-Bestzeit ohne Datum. Neu abzufragen:

1. Lauftage pro Woche (3–6) – Pflicht
2. Verfügbare Tage + Long-Run-Tag – Pflicht (Default: alle Tage, LR So)
3. Aktuelle Wochen-km als Zahl (statt Spanne) – Pflicht
4. Letzter Wettkampf oder geschätzte 5k/10k-Zeit (Distanz, Zeit, Datum) – optional, sonst Einsteiger-Modus
5. Längster Lauf der letzten 4 Wochen – optional, Fallback siehe Tabelle

Bestehende Profile ohne diese Felder: beim nächsten Planerstellen nachfragen, nicht raten. Hat der letzte Plan die Felder schon, füllt der Wizard sie damit vor (Entscheidung 6.11.2026).

**Standardwert für den längsten Lauf** (Onboarding, wenn Frage 5 leer bleibt; `inputs.longestRecentRunDefaultKm`, [E], Review-Punkt 39), km:

| Distanz | 3 Tage | 4 Tage | 5 Tage | 6 Tage |
|---|---|---|---|---|
| 5k | 5 | 6 | 7 | 8 |
| 10k | 6 | 8 | 9 | 10 |
| HM | 8 | 10 | 12 | 14 |
| M | 10 | 12 | 14 | 16 |

**Weitere Regeln im Wizard (6.11.2026):** nur die vier Distanzen 5k, 10k, HM, M (keine freie Distanz); Renndatum unter der harten Untergrenze (§4) wird abgelehnt, die Meldung nennt das früheste mögliche Renndatum (Montag der Kalenderwoche, die `hardMinWeeks` ab der Startwoche zählt; `earliestRaceDate`).

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

[P für „empfohlen", E für Grenzen] Unter harter Untergrenze: keine Planerstellung, klare Fehlermeldung. Über Max: Plan startet erst `Max` Wochen vor dem Rennen (am Montag dieser Woche), davor „freie Wochen" ohne Plan.

„Wochen" sind Kalenderwochen Mo–So (§1); eine angebrochene Woche 1 zählt voll. Unter der Empfehlung gibt es keinen eigenen Abschlag auf den Peak: Es gelten die Steigerungsregeln (§5.3), dazu ein Hinweis.

**Phasen** (rückwärts vom Renntag gebaut):

1. **Taper**: M und HM 2 Wochen (inkl. Rennwoche), 10k und 5k 1 Woche (Rennwoche). [L: Bosquet 2007 – Optimum 8–14 Tage] Hat die Rennwoche weniger als 4 Tage (Rennen Mo–Mi), kommt eine Taper-Woche dazu. [E]
2. Restliche Wochen: **Basis 35 % / Aufbau 35 % / Spezifisch 30 %**, gerundet (Spezifisch und Aufbau werden gerundet, Basis bekommt den Rest; Spezifisch mindestens 1 Woche), jede Phase ≥ 1 Woche sobald ≥ 6 Restwochen. [E]
3. Die **Peak-Woche** ist die letzte Nicht-Taper-Woche.

## 5. Wochenumfang

### 5.1 Start
`startKm = clamp(currentWeeklyKm, minStart[distance], 150)` mit `minStart`: 5k 10 · 10k 15 · HM 20 · M 25. [E]
Liegt `currentWeeklyKm` unter `minStart`: Plan startet trotzdem bei `currentWeeklyKm`, Peak wird nach §5.2 begrenzt. `startKm` fließt nur in die Peak-Berechnung ein; Woche 1 ist `min(currentWeeklyKm, Peak-Obergrenze)`, mindestens 5 km (Schutz vor 0 km, sonst bliebe 1,3 × 0 = 0). [E]

**Mindest-Wochen-km** (v0.8, Review-Punkt 29): `Lauftage × E-Lauf von 25 min`, aufgerundet auf ganze km (E-Pace aus §3; E darf bis zur Länge des Long Runs gehen, §6). Woche 1, Entlastungswochen und der Peak-Korridor werden mindestens darauf angehoben (Hinweis `min-week-km-raised`): Der Peak darf dadurch über Tabellen-Max und 1,5 × Start liegen (I5), eine Entlastungswoche ist dann höchstens so groß wie `minWeekKm` statt −20 % (§5.3); Taper- und Rennwochen nicht (dort hebt oder kürzt die Verteilung mit Hinweis). Beispiel P1: 3 × 3,6 = 10,8 → 11 km statt 10. [E]

### 5.2 Peak

Der Peak liegt in einem Korridor [Untergrenze, Obergrenze] (ganze km):

- Obergrenze `cap = min( tableMax, startKm × 1.5 )`
- Untergrenze `floor = min( max(tableMin, startKm), cap )`
- Zielwert `peak = floor + peakPosition × (cap − floor)`, gerundet. `peakPosition` ∈ [0, 1], Standard **0,75** [E, Review-Punkt]. Der Planer leitet sie später aus der VDOT-Lücke zwischen Ziel und Form ab (schnelleres Ziel → höher).

Der Zielwert ist weich: Er wird zusätzlich durch die Steigerungsregeln (§5.3) begrenzt und kann dadurch darunter liegen (meist 1–2 km, bei kurzen Plänen deutlich mehr). Ein Hinweis (`peak-not-reached`) erscheint, sobald der erreichte Peak mehr als 10 % unter dem Zielwert liegt. [E]

Abweichung zum Code: Heute bestimmen Zielzeit und Umfangs-Spanne × 1,2 den Peak. Die Spec nimmt Lauftage und tatsächliche Wochen-km, weil die Zielzeit nichts über die Belastbarkeit aussagt. Die Zielzeit darf den Peak nur **innerhalb** des Korridors verschieben (`peakPosition`), nie darüber hinaus.

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
- Beide Regeln rechnen mit dem **Vollwochen-Äquivalent** (eine angebrochene Woche 1 wird auf 7 Tage hochgerechnet) und gelten bis zur Peak-Woche; Taper- und Rennwoche sind ausgenommen (§5.4). Der Verlauf vor Woche 1 zählt als Woche 1.
- Entlastungswoche: jede 4. Woche (Woche 4, 8, 12 …) in Basis/Aufbau/Spezifisch (3:1), **fest −20 %** zur Vorwoche; nie in Woche 1, nie in den letzten zwei Wochen vor dem Taper. Begründung: Bei −25 % oder −30 % lässt I3 (1,3 × Entlastungswoche) zwei Wochen später nur noch 0,975 bzw. 0,91 des alten Niveaus zu; −20 % (1,04) ist verträglich. Bei winzigen Umfängen (< 10 km) nicht tiefer, als I3 zulässt. Nach Entlastung wird höchstens auf das Niveau vor der Entlastung gesprungen, nicht darüber – der Code erlaubt heute +10 % darüber, das wird geändert. [P] v0.9: −20 % wird abgerundet (nie flacher), die I3-Untergrenze auf 0,1 km gerechnet; mit Tragfähigkeit liegt die gelieferte Entlastungswoche −20 bis −30 % unter der gelieferten Vorwoche (`recovery.maxReduction`, Review-Punkt 35), flacher nur, wenn `minWeekKm` sie anhebt.
- Kennzeichnung: `isRecoveryWeek = true` **und** `focus` enthält „Entlastung" (die App erkennt Entlastungswochen heute nur am Text). Die App soll auf das Flag umgestellt werden; bis dahin liefert der Kern beides.
- **Tragfähigkeit** (v0.8, Review-Punkt 32): `planVolume` plant je Woche höchstens, was die Einheiten liefern können (Long-Run-Verlauf §7.1, E-/REC-/MLR-Grenzen §7, Q-Größen). `planSessions` rechnet dazu jede Woche vorab; ist sie kleiner als geplant, gilt der lieferbare Wert (auf 0,1 km), und die Steigerungsregeln der Folgewochen rechnen damit. Der Wert vor der Tragfähigkeit bleibt als `curveKm` stehen; Bezug des Long-Run-Anteils ist seit v0.9 der Plan ohne Tragfähigkeit (§6). Eine angebrochene Woche 1 deckelt den Verlauf nicht. Bleibt der Peak dadurch mehr als 10 % unter dem Ziel, lautet der Hinweis `peak-not-reached` mit `reason: "run-days"`. **Monotoner Verlauf** (v0.9, freigegeben 5.11.2026): Nach dem Kappen läuft ein Rückwärtsdurchlauf von der Peak-Woche. Jede Aufbauwoche ist höchstens so groß wie die nächste (über eine Entlastung hinweg wie die Woche danach), die Woche vor einer Entlastung höchstens so groß, dass die gelieferte Entlastung nicht tiefer als −30 % liegt. Gesenkt werden nur frühere Wochen, nie spätere. Weil gesenkte Wochen den Long-Run-Verlauf und damit die Tragfähigkeit der Folgewochen ändern können, wird neu gerechnet, bis nichts mehr gesenkt werden muss. Ergebnis: keine Aufbauwoche kleiner als die Vorwoche, Peak = letzte Woche vor dem Taper, Entlastung im Band. **Keine Ausnahme im sichtbaren Plan** (freigegeben 5.11.2026): Wochen bis zur Peak-Woche (auch eine angebrochene Woche 1) werden nicht über den Plan angehoben; würden die Mindestdauern das verlangen, werden E/REC bis 15 min gekürzt (§6). Pläne ohne solche Woche bleiben unverändert. Vorher lag in 9 von 2 000 Plänen (5k unter `minWeekKm`) eine angehobene Woche ohne Q über einer späteren Woche mit Q. Der Property-Test prüft die Monotonie auch auf den sichtbaren Wochen (`totalKm`), ohne Ausnahme. I3, I4 und I5 (≤ max(Grenze, `minWeekKm`)) bleiben erhalten (Property-Test auf `planSessions(...).volume`). Folge von I3: Liegt eine gelieferte Entlastung tiefer als −23 %, lässt I3 zwei Wochen später weniger als das alte Niveau zu, und der Rückwärtsdurchlauf senkt die Wochen davor mit. Kosten in §14 Punkt 32.
- Peak wird in der Spezifisch-Phase erreicht, in der letzten Woche vor dem Taper (also höchstens 4 Wochen vor dem Rennen). [P]
- **Verlaufsform** von Woche 1 zur Peak-Woche [E, Review-Punkt 12]: Der Zielverlauf wird nacheinander mit vier Formen gerechnet: (1) S-Kurve (smoothstep), (2) linear, (3) schneller Anstieg am Anfang (1 − (1 − x)²), (4) so schnell wie die Regeln erlauben. Es gilt die erste Form, deren Verlauf den Zielwert (§5.2) in der Peak-Woche erreicht; erreicht keine ihn, gilt (4). Auf jede Woche wirken danach I3, I4, die Peak-Obergrenze und die Entlastung. Die Form bestimmt nur, wie früh der Aufbau passiert, nie den Peak.

### 5.4 Taper

- Volumen: insgesamt −41 bis −60 % gegenüber Peak über die Taper-Phase, progressiv. [L: Bosquet 2007]
  - M/HM Taper-Woche 1 (T−2): 65–75 % Peak (Kern: 70 %)
  - Rennwoche ohne Rennen: 35–50 % Peak (Kern: 42,5 %) → M/HM-Taper −43,75 %
  - 5k/10k Rennwoche ohne Rennen: 40–60 % Peak (Kern: 50 %; Code heute 40 %, liegt im Bereich)
  - „Ohne Rennen“: Das Rennen zählt zu den Wochen-km der Rennwoche, aber nicht zu diesem Anteil. Gilt für eine volle Rennwoche (Rennen am Sonntag); bei weniger Tagen vor dem Rennen wird der Anteil entsprechend kleiner (Tage vor dem Rennen / 6; bei 5k/10k mit Rennen Mo–Sa liegt die Reduktion dadurch außerhalb von −41 bis −60 %).
  - Bei mehr als der Standard-Anzahl an Taper-Wochen (kurze Rennwoche, §4) sinkt der Anteil linear von der ersten Taper-Woche (70 %; 5k/10k 65 %) zur Rennwoche.
- **Intensität bleibt:** pro Taper-Woche genau 1 verkürzte Qualitätseinheit im Renntempo/T. [L: Bosquet 2007]
- **Frequenz bleibt:** Lauftage ≥ `runDaysPerWeek − 1`. [L: Bosquet 2007] Seit v0.7 hat die Rennwoche alle `runDaysPerWeek` Läufe inklusive Rennen (Untergrenze bleibt eingehalten): Mit nur N − 1 Läufen passte das Rennwochen-Volumen nicht in die 30-min-Grenze der letzten zwei Tage (P3: 16 statt 26 km). Fehlt danach noch Volumen, wird die Woche kleiner (Hinweis `week-km-reduced`). [E, Review-Punkt 28]

## 6. Wochenschablonen

Slots pro Woche (Basis → Spezifisch). Q = Qualitätseinheit, LR = Long Run, MLR = mittellanger Lauf.

| Lauftage | Basis | Aufbau / Spezifisch |
|---|---|---|
| 3 | LR, E, E (+Strides) | LR, Q1, E |
| 4 | LR, Q1(leicht), E, E | LR, Q1, Q2*, E |
| 5 | LR, Q1, E, E, E | LR, Q1, Q2, E, E |
| 6 | LR, Q1, E, E, E, REC | LR, Q1, Q2, MLR**, E, REC |

\* Q2 bei 4 Tagen nur ab Aufbau und nur wenn nicht Einsteiger-Modus. ** MLR nur HM/M, sonst E.

Die Entlastungswoche (§5.3) hat dieselbe Wochenform wie die Wochen davor und danach; sie ändert nur die Größen (Review-Punkt 16).

**Platzierung (Algorithmus):** `src/planCore/placement.ts`, ein deterministischer Löser ohne Reparaturschritte.
1. LR auf `longRunDay`.
2. Q1 ≈ 3 Tage vor LR, Q2 ≈ 2 Tage nach LR (bzw. maximal verteilt).
3. Harte Einheiten nie an aufeinanderfolgenden Tagen, **auch nicht über die Wochengrenze** (So → Mo); zwischen zwei harten Einheiten ≥ 1 E-/REC-/Ruhetag. [P, ≈48 h] Dauer und km stehen bei der Platzierung noch nicht fest: **Long Run, jedes Q und das Rennen gelten dabei als hart.** Spätere Schritte machen eine Einheit nur weicher (Strides statt Q, kurzer LR), nie härter; so bleibt I6 für die fertigen Einheiten erhalten. [E, Review-Punkt 18]
4. Nicht in `availableDays` → Ruhetag. Lässt sich Regel 3 nicht erfüllen → Q2 entfällt, danach Q1 (nie verschieben auf Kollision). Die Lauftage bleiben: der Slot wird E, das Layout trägt einen Hinweis. Q hat Vorrang vor MLR.
5. Max. Q-Einheiten (ohne LR): 3 Tage 1 · 4 Tage 2 · 5 Tage 2 · 6 Tage 2.
6. **MLR** (6 Tage, HM/M): mindestens 2 Tage Abstand zum LR (Tagesdifferenz, zyklisch) und **nie zwischen zwei harten Tagen** (Tag davor und Tag danach hart), auch nicht über die Wochengrenze. Geht das nicht, wird der MLR zu E. Weiche Zielgrößen in dieser Reihenfolge, nach der Zahl der Q: MLR nicht direkt neben einem harten Tag, MLR möglichst weit vom LR, Q1/Q2 nahe ihren Soll-Tagen, wenige direkt aufeinanderfolgende Lauftage, wenige Ruhetage direkt nach einem harten Tag, REC direkt nach dem LR. [E, Review-Punkt 18]
7. **Woche 1** (angebrochen): die Form einer vollen Woche gleicher Art, gekürzt auf die Plantage (Zustand der Vorwoche wie im Dauerzustand). Liegt der Long-Run-Tag vor dem Planstart, hat Woche 1 keinen LR; er wird nicht verschoben. [E]

**Taper- und Rennwoche** [E, Review-Punkt 17]:
- Taper-Woche vor der Rennwoche (auch die Zusatzwoche, §4): wie Aufbau/Spezifisch, aber Q2 und MLR werden E. Genau 1 Q, Lauftage wie in der Schablone.
- Rennwoche (Mo … Renntag): RACE am `raceDate`, kein LR, höchstens 1 Q (spätestens Renntag−3, Marathon Renntag−4, §8), sonst E. Lauftage inklusive Rennen = alle Lauftage (seit v0.7, §5.4), bei weniger verfügbaren Tagen im Fenster entsprechend weniger. Höchstens 2 Ruhetage direkt vor dem Rennen und höchstens 2 Ruhetage am Stück (auch am Wochenanfang), soweit `availableDays` und das Q es zulassen; danach liegen die E-Läufe bevorzugt an Renntag−2, dann −1. Rangfolge: Q-Erhalt, Ruhetage direkt vor dem Rennen, Ruhetage am Stück, E-Bevorzugung, Q-Soll-Tag. Das Q kann dadurch vom spätesten zulässigen Tag früher rücken (10k/HM: Mi statt Do). Gibt es im Fenster keinen zulässigen Q-Tag (Rennen Mo–Mi), hat die Rennwoche kein Q; das Q der Vorwoche zählt.
- Rennen am Montag: Die Rennwoche besteht nur aus dem Rennen; der Sonntag davor hat keine harte Einheit.

**Verteilung der Wochen-km** (v0.8, `planSessions.ts`):
1. **Q-Budget:** Qualitäts-km je Woche höchstens 20 % der Wochen-km, bei 3–4 Lauftagen 15 %, in Taper- und Rennwochen × 0,6 (Review-Punkt 19). Reihenfolge: M-Block eines LR+M, Q1, Q2; folgt noch eine Einheit, bekommt die erste höchstens 70 % des Budgets. Jede Einheit höchstens ihr Limit (§7). Ist das Budget aufgebraucht, wird Q2 zu E + Strides; Q1 bekommt mindestens die Mindestgröße (§7), soweit Limit und 25 % es zulassen, sonst ebenfalls E + Strides. **Entlastungswoche** (v0.9, Review-Punkt 36): Q1 höchstens das Typ-Limit einer Woche mit den km der Vorwoche mal den Faktor der Woche (Wochen-km ÷ gelieferte Vorwoche, Hinweis `q1-scaled-recovery-week`). Anteilsgrenzen (T 10 %) ändern sich dadurch nicht, feste km-Grenzen schrumpfen mit (P5 W12: M-Block vor dem Long Run 10 km × 71/89 → 7,9 km).
2. **Long Run** nach §7.1, **nie über seine Grenzen** (Start, Steigerung, Entlastung, Taper, Anteil, 180 min). Sein Anteil bezieht sich auf den Plan ohne Tragfähigkeit (erster Durchlauf von `planVolume`, Vollwochen-Äquivalent; Review-Punkt 29, v0.9; vorher `curveKm`, das mit dem monotonen Verlauf die gesenkten Wochen nachzieht und Woche und Long Run gemeinsam schrumpfen ließe). Einzige Ausnahme von den Grenzen (v0.9, Review-Punkt 34): Liegen sie unter 15 min, ist der Long Run genau 15 min (Hinweis `long-run-raised-to-minimum`; nur bei sehr kurzem längstem Lauf, z. B. 0 km → Startgrenze 2 km).
3. **Rest** gewichtet auf E/REC/MLR (1 : 0,8 : 2, Review-Punkt 22), jede innerhalb ihrer Limits: Dauer; MLR ≤ 75 % des Long Runs; **E ≤ max(75 % des Long Runs, E-Mindestdauer), nie länger als der Long Run** (Hinweis `e-above-75-percent-long-run`); REC ≤ Long Run; in Wochen ohne Long Run gilt der letzte davor; letzte 2 Tage vor dem Rennen ≤ 30 min. Ist der Long Run selbst kürzer als die Mindestdauer von E/REC, werden diese auf seine Länge gekürzt (I11 vor I2, Hinweis `e-shortened-to-long-run`), nie unter 15 min (v0.9, freigegeben: E unter 25 min akzeptiert, harte Untergrenze 15 min). E bei 3 Lauftagen HM/M bis 90 min (v0.9, E übernimmt die MLR-Rolle, Review-Punkt 33). Passt der Rest nicht → Wochen-km werden reduziert (Hinweis `week-km-reduced`); Q-Limits und Q-Budget gelten dann für die kleinere Woche. Reichen die Wochen-km nicht für die Mindestdauern, wird die Woche schrittweise weicher (MLR → E, Q2 → E + Strides, Q1 → E + Strides), in Wochen bis zur Peak-Woche (ohne Taper und Rennwoche) danach E/REC bis 15 min statt 25/20 min, aber nur, wenn die Woche sonst angehoben würde; die E-Obergrenze bleibt max(75 % LR, 25 min) (Hinweis `e-shortened-to-fit-week`, freigegeben 5.11.2026). Zuletzt wird die Woche größer (Hinweis `week-km-raised`; in Wochen bis zur Peak-Woche nur, wenn auch 15 min nicht passen, der Verlauf bleibt dabei monoton).

**Intensitätsverteilung pro Woche:**
- Qualitäts-km ≤ 20 % der Wochen-km (Ziel), ≤ 25 % (hart). [L: Seiler 2010, Polarisierung ~80/20; Grenze E]

## 7. Einheiten-Bibliothek

Jede Einheit im Plan muss einem Typ aus dieser Tabelle entsprechen. Ein-/Auslaufen: je 1,5–3 km bei E, zählt zu Einheiten-km, nicht zu Qualitäts-km.

| Typ | Inhalt | Limits |
|---|---|---|
| REC | locker, REC-Pace | 20–45 min (v0.9: harte Untergrenze 15 min, §6) |
| E | locker, E-Pace, optional 4–8 × 20 s Strides | 25–75 min (6 Tage und v0.9 3 Tage HM/M: bis 90 min), max. 75 % des LR derselben Woche (v0.8: höchstens max(75 % LR, 25 min), nie länger als der LR, §6; v0.9: harte Untergrenze 15 min) |
| MLR | E-Pace, nur HM/M ab Aufbau, 5–6 Tage | 75–110 min, ≤ 75 % LR, ≥ 2 Tage Abstand zum LR [P: Pfitzinger] |
| LR | E-Pace | siehe 7.1 |
| LR+M | LR mit M-Pace-Block am Ende, nur M, Spezifisch | M-Anteil ≤ 50 % des LR [E] und ≤ min(29 km, 110 min) [L: Daniels] |
| M | Dauerlauf M-Pace | ≤ min(29 km, 110 min) [L: Daniels] |
| T | Tempodauerlauf ≤ 20 min oder Cruise-Intervalle (z. B. 3–5 × 1,6 km, 1 min Trab) | T-km pro Einheit ≤ 10 % Wochen-km [L: Daniels] |
| I | 3–5 min Wiederholungen, Trabpause ≈ gleich lang | I-km ≤ min(8 % Wochen-km, 10 km) [L: Daniels] |
| R | 200–400 m, volle Erholung | R-km ≤ min(5 % Wochen-km, 8 km) [L: Daniels]; nur 5k/10k |
| RACE | Wettkampf | genau einmal, am `raceDate` |

**Mindestgrößen** (v0.8, freigegeben 5.11.2026, Review-Punkt 31): M-Block ≥ 3 km (M-Lauf und LR+M), T-Block ≥ 10 min (auch HM-/10k-Renntempo), I ≥ 3 Wiederholungen (auch 5k-Renntempo, volle Länge), R ≥ 4 Wiederholungen. Darunter wird das Q zu E + Strides (Hinweis `q-softened-budget`/`-room`, I13-Ausnahme), der LR+M zum LR ohne M.

Beispiel 2:50-Profil bei 95 km: T ≤ 9,5 km, I ≤ 7,6 km. Die heutigen 19,9-km-Tempoblöcke wären damit strukturell unmöglich.

### 7.1 Long Run

| | Regel | Herkunft |
|---|---|---|
| Anteil an Wochen-km (hart) | 3 Tage ≤ 55 % · 4 Tage ≤ 50 % · 5 Tage ≤ 38 % · 6 Tage ≤ 33 % | [E] – Daniels empfiehlt 25–30 %; das ist für 3–4-Tage-Marathonpläne nicht umsetzbar → **Review-Punkt** |
| Zeit | ≤ 150 min Ziel [L: Daniels], ≤ 180 min hart [E] | |
| Steigerung | ≤ +2 km oder ≤ +15 % zur letzten LR (Größeres), max. +3 km | [E] |
| Startwert | ≤ `longestRecentRunKm` + 2 km | [E] |
| Peak-Ziel M | 5–6 Tage 30–34 km (2–3 Läufe ≥ 30 km); 3–4 Tage 26–30 km, begrenzt durch 180 min | [P] |
| Ziel des längsten LR | v0.8: Anteilsgrenze der Lauftage (55/50/38/33 %) × Peak-Wochenumfang, auf das Peak-Ziel der Distanz begrenzt, danach 180 min (P4/P6 liegen deshalb unter dem Peak-Ziel). Verlauf linear vom Startwert; Marathon hält das Ziel 2 normale Wochen (beginnt eine davon nach einer Entlastung, gehört die Woche davor dazu) | [E, Review-Punkt 21] |
| Entlastungswoche | LR −25 % (Mitte von −20–30 %), danach höchstens das Niveau vor der Entlastung (I9-Ausnahme wie I4) | [E] |
| Taper | LR in Taper-Wochen (bei HM/M 7 Tage vor dem Rennen) höchstens 60 % des längsten LR | [E, Review-Punkt 20] |
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

**Regeln der Q-Typ-Wahl** (v0.7, `qTypes.ts`):
- Basis: Woche 1–2 E + Strides, ab Woche 3 die zweite Art der Zeile (R bzw. T). Q1L (4 Tage) mit halbem Limit.
- Aufbau/Spezifisch: Q1 = erste, Q2 = zweite Art; mit nur einem Q wechseln die Arten wochenweise (Nicht-Entlastungswochen der Phase). HM Spezifisch: Q1 HM-Pace-Blöcke, Q2 wechselt wochenweise I / T (kein doppelter Schwellenreiz). Marathon Spezifisch: LR+M in jeder 2. Nicht-Entlastungswoche, dann Q1 = T statt M-Lauf.
- Renntempo-Blöcke zählen als T (HM, 10k) bzw. I (5k) mit deren Limits und Zonen (Review-Punkt 26). M-Block höchstens 10 km, wenn der Long Run höchstens 2 Tage später kommt (Review-Punkt 24).
- Weicher (nie härter): Q2 in der Entlastungswoche (Review-Punkt 16 bleibt offen) und bei Einsteigern mit 5–6 Tagen wird E + Strides, das Q der Einsteiger-Rennwoche ebenfalls.
- Einsteiger: T (höchstens 20 min) und M nach Minuten, die km folgen über die E-Pace; kein Pace-Ziel, die Beschreibung nennt die Minuten.

## 8. Rennwoche

- RACE am `raceDate`, Distanz exakt.
- Letzte Q-Einheit ≥ 4 Tage vor M, ≥ 3 Tage vor HM/10k/5k.
- Höchstens 2 Ruhetage direkt vor dem Rennen und höchstens 2 Ruhetage am Stück in der Rennwoche, soweit `availableDays` und das Q es zulassen (weiche Regeln). [E, Review-Punkt 17]
- Letzte 2 Tage vor dem Rennen: nur REC/E ≤ 30 min oder Ruhe, optional Strides (v0.7: E am Vortag mit 4 × 100 m Strides). (Code heute bis 6 bzw. 10 km vor dem Marathon – wird auf die Zeitgrenze umgestellt; 30 min ≈ 6–7 km bei schnellen Läufern, 4–5 km bei langsamen.)
- Kein LR in den 7 Tagen bis zum Rennen (Renntag−6 … Renntag), nicht nur in der Kalenderwoche. Fällt der Long-Run-Tag der Vorwoche in dieses Fenster (Rennen Mo–Sa), entfällt der LR dieser Woche; er wird nicht verschoben. [E, Review-Punkt 17]
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
| I2 | Jede Einheit hat einen Typ aus §7 und liegt in dessen Limits. Ausnahme (v0.8): E/REC unter der Mindestdauer, wenn der Long Run kürzer ist (Hinweis `e-shortened-to-long-run`, §6) oder die Woche sonst angehoben würde (Hinweis `e-shortened-to-fit-week`, nur Wochen bis zur Peak-Woche ohne Taper/Rennwoche), nie unter 15 min (v0.9) |
| I3 | `km(w) ≤ 1.30 × km(w−2)` für alle w ≥ 3 bis zur Peak-Woche (Vollwochen-Äquivalent; Taper- und Rennwochen ausgenommen) |
| I4 | `km(w) ≤ max(1.10 × km(w−1), km(w−1) + 4)` bis zur Peak-Woche (Vollwochen-Äquivalent), außer erste Woche nach Entlastung (dann ≤ Niveau vor Entlastung). Mit Tragfähigkeit (v0.9): keine Aufbauwoche kleiner als die letzte Aufbauwoche davor, Peak = letzte Woche vor dem Taper |
| I5 | Peak (höchster Wochenumfang bis zur Peak-Woche, ohne Taper- und Rennwoche) ≤ Tabellen-Max (§5.2) und ≤ `startKm × 1.5`; das gilt für jede Woche bis zur Peak-Woche. Mit Mindest-Wochen-km (§5.1): ≤ max(Grenze, `minWeekKm`); Entlastungswoche < Vorwoche oder = `minWeekKm`, mit Tragfähigkeit (§5.3) −20 bis −30 % zur gelieferten Vorwoche (v0.9; flacher nur bis `minWeekKm`) |
| I6 | Keine zwei harten Einheiten an aufeinanderfolgenden Tagen – **auch über die Wochengrenze** (So → Mo). In der Platzierung zählen LR, Q und Rennen als hart (§6). Der MLR liegt nie zwischen zwei harten Tagen |
| I7 | Q-Einheiten pro Woche ≤ Max nach Lauftagen |
| I8 | Qualitäts-km ≤ 25 % der Wochen-km |
| I9 | LR-Anteil (am Plan ohne Tragfähigkeit, Vollwochen-Äquivalent; v0.9), LR-Zeit, LR-Steigerung nach §7.1; erste Woche nach Entlastung höchstens das Niveau davor; Taper höchstens 60 % des längsten LR. Einzige Ausnahme (v0.9): Liegen die Grenzen unter 15 min, ist der LR genau 15 min (Hinweis `long-run-raised-to-minimum`) |
| I10 | HM/M: genau 1 LR pro Woche außer Rennwoche. Ausnahmen: Woche 1, wenn der Long-Run-Tag vor dem Planstart liegt; Wochen, deren Long-Run-Tag in den 7 Tagen vor dem Rennen liegt (§8) |
| I11 | Kein E/REC/MLR länger als der LR derselben Woche; in Wochen ohne LR als der letzte LR davor. E höchstens max(75 % des LR, E-Mindestdauer) |
| I12 | T ≤ 10 %, I ≤ min(8 %, 10 km), R ≤ min(5 %, 8 km), M ≤ min(29 km, 110 min); Q1 der Entlastungswoche: feste km-Grenzen × Faktor der Woche (v0.9) |
| I13 | Taper-Volumen nach §5.4 als Mittel der Taper-Phase (−41 bis −60 %, geprüft bei Rennen am Sonntag und Standard-Taper); Einzelwochen und Abweichungen durch Limits, Mindestdauern oder die Tragfähigkeit (Hinweis `week-km-reduced`/`-raised` an einer Taper-Woche oder `curveKm` > geliefert) sind Warnungen. Genau 1 Qualitätseinheit pro Taper-Woche. Ausnahmen (§6): Rennwoche ohne zulässigen Q-Tag hat keine; lässt sich das Q einer Taper-Woche nicht platzieren (zu wenige nicht benachbarte Tage), entfällt es mit Hinweis; Einsteiger-Rennwoche E + Strides; zu kleine Woche (Hinweis `q-softened-budget`/`-room`) |
| I14 | Genau ein RACE, am `raceDate`, letzte Einheit des Plans |
| I15 | Regeln aus §8 (Abstände vor dem Rennen) |
| I16 | Lauftage ⊆ verfügbare Tage (das Rennen ausgenommen), Anzahl = `runDaysPerWeek`; angebrochene Woche 1: höchstens so viele; Taper- und Rennwoche: mindestens min(`runDaysPerWeek` − 1, verfügbare Tage im Fenster) |
| I17 | Pace-Reihenfolge nach §3 |
| I18 | Zielpace nur, wenn VDOT-Lücke ≤ 2 |
| I19 | Fingerprint unverändert nach Claude-Text-Schritt |
| I20 | Determinismus: gleiche Inputs → identischer Plan (Snapshot) |
| I21 | Jede Woche hat `focus` und `dates`, auch eine angebrochene Woche 1 |
| I22 | Entlastungswochen: `isRecoveryWeek` und „Entlastung" im `focus` stimmen überein |

Zusätzlich: Property-Tests über zufällige gültige Inputs (alle Distanzen × 3–6 Tage × Planlängen × Startumfänge), alle Invarianten müssen halten.

**Prüfer** (Schritt 7, `src/planCore/invariants.ts`): `checkPlan` (I1–I18, ohne I19/I20) und `checkAssembledPlan` (fertiger Plan: I1, I14, I21, I22, eindeutige IDs). Jede Regel hat eine Schwere:
- **error:** Sicherheitsgrenze, Vorgabe des Nutzers oder kaputter Plan. Der Server liefert den Plan dann nicht aus.
- **warning:** Zielwert, Qualitätsregel, Mittelwert.
- **Toleranz:** Jede error-Grenze auf Zahlen hat eine (0,1 km, 0,5 Prozentpunkte, 1 min); eine Überschreitung innerhalb davon ist warning.
- **Begründete Abweichungen** (ein Hinweis des Kerns erklärt sie) sind warnings mit eigener Regel.
- I19 gilt erst mit dem Claude-Text-Schritt (§11), I20 prüft der Property-Test.

Einteilung und Häufigkeiten: `docs/plan-core-plan.md`, Schritt 7.

## 13. Referenzprofile (Abnahmekriterien)

| # | Profil | Inputs | Erwartung |
|---|---|---|---|
| P1 | 5k Anfänger | 3 Tage, 10 km/Wo, kein Rennen, 8 Wo | Einsteiger-Modus, Peak 13–15 km (I5: ≤ 1,5 × Start), LR-Peak 7–8 km, keine I/R |
| P2 | 10k Finisher | 4 Tage, 20 km/Wo, 10k-Schätzung 62:00, 10 Wo | Peak 28–35 km, LR-Peak 10–15 km (v0.8: 50 % × Peak 30 = 15, vorher 10–13; bestätigt 5.11.2026), max. 1 Q in Basis |
| P3 | HM 1:35 | 5 Tage, 45 km/Wo, 10k 43:30 vor 4 Wo, 12 Wo | Peak 55–65 km, LR-Peak 18–22 km (v0.8: 38 % × 61 → Peak-Ziel HM 22, vorher 18–21; bestätigt 5.11.2026), T-Einheit ≤ 6,5 km |
| P4 | M 4:00 | 4 Tage, 35 km/Wo, HM 1:55 vor 6 Wo, 16 Wo | Peak 50–55 km, LR-Peak 24–25 km (50-%-Anteil bei Peak 50; v0.7), ≥ 2 LR ≥ 24 km |
| P5 | M 2:50 | 6 Tage, 70 km/Wo, HM 1:21 vor 8 Wo, 18 Wo | Peak 95–105 km, LR-Peak 30–34 km, 2–3 LR ≥ 30 km, T ≤ 10 km, nie > 110 km |
| P6 | M 3 Tage | 3 Tage, 30 km/Wo, HM 2:05 vor 8 Wo, 18 Wo | Peak 40–45 km, LR-Peak 23–24 km (55-%-Anteil bei Peak 43; v0.7), bewusster Grenzfall für LR-Anteil |

Pro Profil zusätzlich: Vergleichsspalte mit einem passenden Literaturplan (Daniels, Pfitzinger, Hansons): Peak-km, LR-Max, Anzahl LR ≥ 30 km, Q-Einheiten/Woche, Taper-Volumen. Abweichung > 15 % → begründen oder Regel anpassen.

## 14. Offene Fragen für das Spoho-Review

1. LR-Anteil bei 3–4 Lauftagen (55 % / 50 %) – vertretbar oder lieber kürzere LR akzeptieren?
2. 180 min als harte LR-Grenze für langsame Marathonläufer (statt Daniels' 150 min)?
3. Steigerung 10 %/Woche als Zielwert und 30 %/2 Wochen als harte Grenze – reicht die Evidenz (Nielsen: Anfänger, Assoziation)?
4. Entlastungsrhythmus 3:1 für alle Niveaus oder 2:1 für Anfänger/Ältere?
5. VDOT-Abschlag für alte Rennergebnisse (−1 je 6 Wo).
6. Peak-Tabelle §5.2 – realistisch für die Zielgruppe?
7. Taper-Verteilung innerhalb der −41–60 %.
8. MLR bei 5 Lauftagen: §7 erlaubt „5–6 Tage“, die Schablone in §6 hat MLR nur bei 6. Bis zur Klärung gilt §6 (`planCore/config.ts`, `library.mlr.runDays`).
9. Peak-Position im Korridor (§5.2): Standard 0,75 – reicht das für P3–P6, und wie stark soll ein schnelleres Ziel den Peak anheben?
10. Entlastung fest −20 % statt −20 bis −30 % (§5.3) – Verträglichkeit mit I3 gegen etwas weniger Erholung.
11. Zusatz-Taper-Woche bei Rennwoche < 4 Tage (§4) und linearer Verlauf des Tapers dabei.
12. Verlaufsform des Wochenumfangs (§5.3): erste von vier Formen, die den Peak erreicht – früher oder später Aufbau gewünscht?
13. HFmax-Bänder für M (Zone 3 = 76–82 %) und T (Zone 4 = 82–88 %) in `src/trainingIntelligence/hrZones.ts`: vorläufig aus dem bisherigen Band „Zone 3–4“ geteilt; Daniels setzt M/T eher bei ~80–90 % bzw. 88–92 % HFmax an.
14. VDOT-30-Zeile im VDOT-Rechner (§3): Der Rechner (vdoto2.com, 4.11.2026) zeigt bei VDOT 30,0 E 7:05–7:46, T 6:09, I 5:28, R 5:13; die Daniels-Gilbert-Gleichungen mit den Anteilen aus `config.ts` ergeben E (Mitte) 8:00, T 6:24, I 5:55, R 5:40. Die Werte entsprechen etwa VDOT 32–33. Der Rechner weicht bei niedrigem VDOT offenbar bewusst von der Formel ab. Der Kern rechnet nach Formel und prüft bei VDOT 30 nur Rennzeiten und M (`__fixtures__/danielsReference.ts`). Fragen: Welche Pace-Werte sollen Läufer im unteren VDOT-Bereich (< 35) bekommen, und gilt die Abweichung auch zwischen 30 und 35?
15. Anteile der Pace-Arten (§3): E 0,66 (Mitte von 0,62–0,70), T 0,88, I 0,974, R = I − 15 s/km sind aus dem Rechner für VDOT 40–70 abgeleitet (`form.eShare` … `form.rOffsetSecPerKm`), nicht aus der Literatur. Bestätigen oder durch das Buch ersetzen.
16. Entfällt Q2 in der Entlastungswoche? Die Entlastungswoche ist im Layout neutral (§5.3, §6): gleiche Wochenform, nur kleinere Größen. Offen ist, ob Q2 (und der MLR) dort zu E werden sollen.
17. Long-Run-Sperrfenster und Rennwoche (§5.4, §6, §8): Höchstens 2 Ruhetage direkt vor dem Rennen und höchstens 2 am Stück (auch am Wochenanfang), E bevorzugt an Renntag−2/−1 (Folge: das Q rückt bei 5k/10k/HM oft auf Mi/Renntag−4; steht der Q-Soll-Tag im Rang vor der E-Bevorzugung, bleibt das Q auf Do, dafür liegt E am Montag); bei höchstens 3 Lauftagen alle Läufe in der Rennwoche (statt Lauftage − 1). Kein LR in den 7 Tagen bis zum Rennen statt in der Kalenderwoche (bei Rennen Mo–Sa entfällt der LR der Vorwoche); Rennwoche mit Lauftage − 1 Läufen inklusive Rennen (bei höchstens 3 Lauftagen alle Lauftage) und höchstens 1 Q; Taper-Woche ohne Q2 und MLR.
18. Platzierung (§6): Long Run, Q und Rennen gelten als hart, bevor Dauer und km feststehen (etwas strenger als §1); MLR nie zwischen zwei harten Tagen; Rangfolge der weichen Zielgrößen (Q vor MLR, MLR nicht neben hartem Tag, MLR weit vom LR, Q-Soll-Tage).
19. Q-Budget (§6): 20 % der Wochen-km, 15 % bei 3–4 Lauftagen (`fewRunDaysUpTo` 4), 25 % hart; erste Einheit höchstens 70 %, wenn noch eine folgt; Taper- und Rennwoche × 0,6 (`intensity.*`, `taper.qualityKmFactor`).
20. Taper-Long-Run (§5.4, §7.1): höchstens 60 % des längsten Long Runs (Folgepunkt b).
21. Ziel des längsten Long Runs (§7.1, v0.8): Anteilsgrenze der Lauftage × Peak-Wochenumfang innerhalb der Peak-Ziele (vorher 30 %); Plateau von 2 Wochen beim Marathon. Ergebnis P1 7 (Ziel 8,2, Steigerung begrenzt), P2 14,6, P3 22, P4 25, P5 31,6, P6 23,6 km. P2 und P3 liegen über der bisherigen Abnahme (10–13 bzw. 18–21); neue Abnahme 10–15 bzw. 18–22 bestätigt 5.11.2026.
22. Gewichte der Verteilung (§6): E 1, REC 0,8, MLR 2.
23. Ein-/Auslaufen nach Wochen-km (§7): bis 40 km 1,5/1,5, bis 70 km 2/1,5, darüber 2,5/2.
24. M-Block höchstens 10 km, wenn der Long Run höchstens 2 Tage später kommt (§7).
25. Strides (§7): 6 × 100 m (≈ 20 s), in der Rennwoche 4; zählen nicht zu den Wochen-km.
26. Renntempo-Blöcke (§7.2): HM 2 km / 120 s, 10k 1 km / 90 s, 5k 600 m / 90 s, mindestens 2; HM und 10k als T, 5k als I. I-Wiederholungen ≈ 4 min (3–5), Pause gleich lang, mindestens 3; R 400 m ab 6 Wiederholungen, sonst 200 m, Pause 2 × Dauer, mindestens 4; Cruise 3–5 × höchstens 1,6 km; Blöcke unter 5 min entfallen.
27. Pace-Bänder im `pace`-Feld (§3): E aus 0,70/0,62 VO2max, REC E + 20…40 s, M/T/I/R/Renntempo ± 5 s; Einsteiger E 7:00–7:30.
28. Rennwoche mit allen Lauftagen inklusive Rennen (§5.4, §6) statt N − 1. Folge: Q1 bei HM 5 Tage wieder Renntag−3 (Do).
29. Mindest-Wochen-km (§5.1) und Bezug des Long-Run-Anteils auf den geplanten Verlauf (`curveKm`, §6). **v0.9, bestätigt 5.11.2026:** Bezug ist der Plan ohne Tragfähigkeit (erster Durchlauf); `curveKm` (v0.8) zöge mit dem monotonen Verlauf die gesenkten Wochen nach. Mit E bis 90 min bei 3 Tagen (Punkt 33): P6 Peak 41,4 km (v0.8: 38,8), Long Run 23,6 km = 57 % der gelieferten Woche (v0.8: 61 %). Über alle 2 000 Property-Pläne liegt der Long Run in 1 949 von 20 456 Nicht-Taper-Wochen über der Anteilsgrenze der gelieferten Woche. Gegen die gelieferte Woche schrumpften Woche und Long Run gemeinsam (v0.8 gemessen: P6 ≈ 33 km, LR-Peak 20,7). Befund vor v0.8: bei 3–4 Lauftagen waren viele Wochen ≥ 10 % unter dem Ziel (3 Tage 59 %, 4 Tage 44 %); mit der Tragfähigkeit (Punkt 32) liegen die gelieferten Wochen stattdessen schon im Volumenplan niedriger (Zahlen dort).
30. Strukturzahlen ohne eigenen Punkt (§6, §7, §7.1, §7.2): Q1L mit halbem Limit (`lightQualityFactor` 0,5); Trabpausen mit 5:00/km wie der App-Parser (`restJogSecPerKm` 300); Long Run der Entlastungswoche −25 % (`recoveryReductionUsed`, Mitte von −20–30 %); LR+M in jeder 2. Nicht-Entlastungswoche der Marathon-Spezifisch-Phase (`longRunPlusMEveryNthWeek`); HM Spezifisch Q2 wechselt I / T (`hmSpecificQ2`); Einsteiger-Q2 → E + Strides (`beginnerQ2AsE`).
31. Mindestdauern und Mindestgrößen (§6, §7, v0.8): (a) Der Long Run wird nie über seine Grenzen angehoben; E darf dafür bis zur Länge des Long Runs gehen (E ≤ max(75 % LR, 25 min)). Property-Test (2 000 Pläne, v0.9 nach Runde 3): 8 130 von 58 492 E-Läufen (14 %, in 603 Plänen) liegen über 75 % des Long Runs. Ist der Long Run kürzer als 25 min E (kleine Umfänge, langsame Pace, Entlastung/Taper, sehr kurzer längster Lauf), werden E/REC auf seine Länge gekürzt: 1 352 Läufe in 218 Plänen (E unter 25 min freigegeben 5.11.2026, nie unter 15 min, Punkt 34). (b) Mindestgrößen der Q-Einheiten: M ≥ 3 km, T ≥ 10 min, I ≥ 3, R ≥ 4 Wiederholungen; Q1 bekommt mindestens diese Größe, soweit Limit und 25 % es zulassen (kann das 20-%-Ziel überschreiten), sonst E + Strides.
32. Tragfähigkeit und monotoner Verlauf (§5.3, v0.9, Monotonie freigegeben 5.11.2026). Messmethode: Property-Fälle (Seed 20261107, 2 000 Pläne); Volumenfolgen über alle Pläne bis zur Peak-Woche auf `planSessions(...).volume`; Kosten nur für Pläne mit Standardwert für den längsten Lauf und volle Nicht-Taper-Wochen, Vergleich `totalKm` aus `planSessions` gegen `fullWeekKm` aus `planVolume` mit `minWeekKm`, aber ohne Tragfähigkeit. Vorher (v0.8) → nachher (v0.9): Peak nicht in der letzten Woche vor dem Taper 773 → 0 Pläne; Aufbauwoche kleiner als die Vorwoche 962 Pläne / 1 553 Wochen → 0; Entlastung tiefer als −30 % 9 → 0 Wochen; Entlastung flacher als −20 % (ohne `minWeekKm`) 580 Pläne / 775 Wochen → 0; Entlastung zwischen −20 und −30 % 1 498 → 2 327 von 3 572 Entlastungswochen. Kosten (Stand nach Runde 3): gelieferte km 95,4 → 92,3 %; Wochen ≥ 10 % unter dem Plan ohne Tragfähigkeit bei 3 Tagen 15,7 → 25,5 % (852/3 342), 4 Tage 13,8 → 24,6 % (856/3 479), 5 Tage 13,4 → 20,5 % (715/3 493), 6 Tage 19,1 → 24,6 % (843/3 427); Peak ≥ 10 % unter dem Plan ohne Tragfähigkeit in 16 → 75 von 341, 6 → 70 von 362, 18 → 67 von 353, 19 → 85 von 351 Plänen. Die Kosten kommen aus der Monotonie (die schwächste spätere Woche bestimmt die früheren; bei 3 Tagen schwanken Wochen mit T- und mit M-Q1 um mehrere km) und aus I3 nach tiefen Entlastungen; das −30-%-Band allein kostet nichts (vor Runde 3 gemessen: mit und ohne Band 92,5 %). Sichtbarer Plan (`totalKm`, alle Wochen bis zur Peak-Woche), Runde 3: 0 nicht monotone Pläne (vorher 9, alle 5k unter `minWeekKm`); dafür E/REC unter ihrer Mindestdauer (≥ 15 min, `e-shortened-to-fit-week`) in 2 253 Läufen in 213 Plänen; geändert sind nur Pläne, die vorher eine angehobene Woche bis zur Peak-Woche hatten. Taper-Mittel: 232 von 277 geprüften Plänen im Bereich, 44 mit weniger als 41 % Reduktion, 1 mit mehr als 60 % (alle durch Tragfähigkeit, Limits oder Mindestdauern).
33. E bei 3 Lauftagen HM/M bis 90 min (§7, v0.9, freigegeben 5.11.2026; `library.e.minutesMaxFewDays`): E übernimmt die Rolle des MLR, der bei 3 Tagen fehlt. Wirkung P6: Peak 38,8 → 41,4 km, Long Run 61 → 57 % der gelieferten Woche.
34. Harte Untergrenze 15 min für E, REC und Long Run (§6, §7, v0.9, freigegeben 5.11.2026; `library.easyHardMinMinutes`): E/REC dürfen unter 25 bzw. 20 min fallen, wenn der Long Run kürzer ist, nie unter 15 min. Damit E nie länger als der Long Run wird, gilt die Untergrenze auch für ihn: Liegen seine Grenzen darunter, ist er genau 15 min (Hinweis `long-run-raised-to-minimum`, einzige I9-Ausnahme). Property-Test: 38 Long Runs in 33 Plänen (Hinweis nur, wenn die Grenzen selbst unter 15 min liegen, Schritt 7), alle mit sehr kurzem längstem Lauf (Startgrenze 2 km) oder daraus folgendem Taper-Long-Run. Anheben des Long Runs statt E > LR bestätigt 5.11.2026; E unter 25 min in Aufbauwochen statt Anheben der Woche ebenfalls (Runde 3).
35. Entlastungsband (§5.3, v0.9, freigegeben 5.11.2026; `volume.recovery.maxReduction` 0,3): geplant −20 % (abgerundet), geliefert −20 bis −30 % zur gelieferten Vorwoche. Wegen I3 senkt jede gelieferte Entlastung tiefer als −23 % das Niveau zwei Wochen später.
36. Q1 der Entlastungswoche mit dem Faktor der Woche (§6, v0.9, freigegeben 5.11.2026; `intensity.recoveryWeekQ1ScalesWithWeek`): Typ-Limit wie bei den km der Vorwoche × (Wochen-km ÷ Vorwoche). Freigegeben mit der Erwartung „M-Block dann ≤ 7,5 km“; mit dem Faktor der Woche sind es bei P5 10 × 71/89 = 7,9 km (7,5 entspräche dem Long-Run-Faktor 0,75). Wochenfaktor (7,9 km) bestätigt 5.11.2026. Property-Test: 655 gekürzte Q1 in 458 Plänen.
37. Kosten des monotonen Verlaufs (§5.3, Spoho-Review, angenommen 5.11.2026): Der Peak liegt in rund 20 % der Pläne ≥ 10 % unter dem Plan ohne Tragfähigkeit (67–85 von je ~350 Plänen je Lauftage-Klasse, v0.8: 6–19), geliefert werden 92,3 % statt 95,4 % der km (Zahlen in Punkt 32). Frage ans Review: Ist ein früher abgesenkter, dafür gleichmäßiger Aufbau besser als ein schwankender mit höherem Peak, oder sollen schwache Wochen (bei 3 Tagen Wochen mit T-Q1) mehr tragen, z. B. durch längeres Ein-/Auslaufen?
38. Q-Budget zu knapp? (§6, Spoho-Review, eingetragen 6.11.2026). Property-Test (2 000 Pläne, Seed 20261107, v0.9): In 1 203 Plänen (60 %) wird mindestens eine Q-Einheit zu E + Strides abgeschwächt (`q-softened-budget`, `q-softened-room`).
    - Q1/Q1L: 1 083 Pläne (54 %); 4 063 von 21 549 Einheiten (19 %), davon 2 481 wegen des Budgets. Das passiert trotz der Regel „Q1 entfällt nicht wegen des Budgets“, weil der Mindestblock das Typ-Limit oder die harte 25-%-Grenze überschreitet. Am häufigsten bei 3–4 Tagen, 5k/10k, Aufbau und Spitze.
    - Q2: 460 Pläne (23 % aller Pläne, 35 % der 1 298 Pläne mit Q2); 1 489 von 8 796 Einheiten (17 %), überwiegend wegen des Budgets (383 Pläne, 104 wegen Platz). Am häufigsten in der Spitze bei M mit 4–6 Tagen.
    - Frage ans Review: Q-Budget (15 % bei 3–4 Tagen, 20 % sonst) oder Q-Mindestgrößen anpassen, oder ist die Abschwächung bei kleinen Wochen gewollt?
39. Standardwert für den längsten Lauf (§2, [E], eingetragen 6.11.2026; `inputs.longestRecentRunDefaultKm`): Wenn das Onboarding keine Angabe bekommt, gilt eine Tabelle nach Distanz und Lauftagen (5k 5–8, 10k 6–10, HM 8–14, M 10–16 km), nicht mehr 30 % der Wochen-km. Der Wert setzt nur die Startgrenze des ersten Long Runs (längster Lauf + 2 km, §7.1); Anteil an der Woche, 180 min und Steigerung begrenzen weiter. Bei hohem Umfang (z. B. 70 km/Woche, M, 5 Tage: 14 statt 21 km) baut der Long Run dadurch langsamer auf, bei sehr kleinem Umfang liegt der Wert über 30 % der Woche. Frage ans Review: Tabelle so lassen, oder Wochen-km einbeziehen (z. B. Minimum aus Tabelle und 30 % der Woche, mindestens 5 km)?

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
| Entlastung | −28 %, danach +10 % über altes Niveau | fest −20 %, danach max. altes Niveau | klein |
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
