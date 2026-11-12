# MyRace – Readiness-Spec v0.1 (Entwurf)

> Zweck: Single Source of Truth für das Readiness-System. Jede Regel ist eine Zahl und damit ein Test.
> Herkunft jeder Zahl: **[L]** Literatur · **[P]** Praxis-Konsens / Expertenmeinung · **[E]** eigene Setzung → muss ins Spoho-Review. Belege und Evidenzstärke stehen in `docs/readiness-research.md` (Verweise als „Recherche B1–B7“).
> Status: Entwurf v0.2, 12.11.2026, entstanden ohne Rückfragen. v0.2 arbeitet die unabhängige Prüfung ein (Änderungs-Prüfung statt `checkPlan`, Kennenlernphase, HRV-Deckel, Grenzen für R, Taper ohne Verschieben, Lastdruck-Start, Datenmodell; neue Szenarien S11b, S13, Invarianten R25, R26, Entscheidungen A22–A25). Alles Wesentliche, dem Anton widersprechen können soll, steht in §18. Umsetzung: `docs/readiness-plan.md`. Kein App-Code geändert.

---

## Kurzfassung für Anton

**Was wir bauen.** Jeden Morgen sagt MyRace in einem Satz, wie belastbar du heute bist, zeigt die zwei bis vier Gründe dafür und macht einen konkreten Vorschlag für die heutige Einheit. Dahinter steht kein geheimer Score, sondern eine offene Rechnung aus fünf Bausteinen: dein Befinden (vier Fragen, 10 Sekunden), deine Körpersignale aus der Uhr (Puls im Schlaf und HRV, die Schwankung des Herzschlags), dein Schlaf, dein Training der letzten Tage und dein Kalender. Jeder Wert wird mit *deinem* Normalbereich verglichen, nicht mit dem anderer Leute.

**Warum das besser ist als Whoop, Garmin und Runna.**
- Whoop, Oura, Garmin und Apple zeigen eine Zahl, deren Formel niemand kennt und die nach heutiger Studienlage weder Leistung noch gefühlte Erholung zuverlässig vorhersagt. Sie schauen vor allem zurück (letzte Nacht). Wo ein Plan darauf reagiert (z. B. Garmin Run Coach), sind die Regeln nicht offengelegt.
- Runna passt den Plan nach den geprüften Quellen an gelaufene Zeiten und eigene Eingaben an, nicht an Erholung oder Alltag.
- MyRace schaut **voraus**: Es sieht die Klausur am Donnerstag und die Spätschicht am Mittwoch und legt die Intervalle so, dass sie nicht in ein Schlafloch fallen. Und es **erklärt** jede Änderung mit der Regel dahinter.
- Ehrlich bleiben: Eine andere App (athletedata.health) liest ebenfalls einen Kalender. „Als Einzige“ dürft ihr nicht sagen. Sagen könnt ihr: MyRace verbindet Kalender, Befinden und Uhr zu einer regelgebundenen, erklärten Anpassung eines Laufplans, ohne neue Hardware und auch ohne Uhr.

**Was die Recherche an deiner Idee geändert hat.**
- „Readiness genau benennen“ geht nicht. Kein System der Welt kann das belegen. Deshalb gibt es vier Stufen statt einer scheingenauen Zahl, und die App sagt dazu, wie gut ihre Datenbasis heute ist.
- Der Kalender taugt nicht als „Stress-Punkte pro Termin“ (dafür gibt es keine Belege). Er taugt als Vorhersage für **Schlaf und Zeitfenster** und für wenige klare Stressoren (Prüfung, körperliche Schicht, Reise), die du einmal bestätigst. Wie belastend dein Alltag wirklich ist, misst die tägliche Frage „Wie geht es dir im Kopf?“ besser als jeder Kalender.
- HRV aus der Apple Watch ist ungenau (rund 29 % Fehler). Sie zählt mit, aber gedämpft und nie allein.

**Was der Nutzer sieht.** Morgens eine Karte: „Etwas unter deinem Normal · kurze Nacht nach der Schicht, Beine schwer, Puls im Schlaf erhöht · morgen Klausur → Intervalle auf Freitag (übermorgen), heute 40 min locker“. Ein Tipp bestätigt. Nach einigen Wochen Einsichten wie „Nach Spätschichten schläfst du im Schnitt 1:10 h kürzer“. Nichts ändert sich am Plan ohne Bestätigung, und nichts erhöht die Belastung.

**Was wir dafür brauchen.** Einen Morgen-Check-in (vier Fragen), eine neue Frage nach jeder Einheit („Wie anstrengend?“ 0–10), bessere Auswertung der Uhr-Daten (Nachtwerte statt Tagesmittel), Termin-Etiketten, die du einmal je Terminart vergibst, fünf kleine Erweiterungen der Datenbank und einen neuen Rechenkern nach dem Vorbild des Plan-Kerns. Keine KI im Kern.

**Wie lange.** Rund 33–40 Agent-Arbeitstage für die Version für den Freundes-Test, mit paralleler Arbeit etwa drei Wochen Kalenderzeit. Die persönlichen Einsichten brauchen danach sechs bis acht Wochen echte Daten, die genau der Freundes-Test liefert.

**Was du freigeben musst** (Details §18): keine Zahl auf der Hauptkarte; Vorschlag statt Automatik ohne Ausnahme; nie Belastung erhöhen; neue Frage nach der Einheit; die bestehende Recovery-Zahl wird ersetzt, nicht repariert.

---

## 0. Scope

**MVP (vor dem Freundes-Test):** Tages-Readiness mit Gründen und Vorschlag für heute; Check-in; Session-RPE; Termin-Etiketten mit Rückfrage; Wochenvorschau aus dem Kalender; Sicherheitsstufen; Betrieb mit und ohne Uhr; Schalter `off|shadow|on`.

**Später:** persönliche Einsichten (braucht Daten), individuelle Sensitivitäten, rMSSD aus Schlag-zu-Schlag-Daten, optionale KI-Einordnung von Terminen (nur mit Einwilligung), Coach-Kontext, Strava/Garmin/Oura/Whoop, Wochenplanung „Woche für Woche“, Zyklus-Tracking.

**Nicht im Scope:** Diagnosen, Leistungsversprechen, Belastung erhöhen, automatische Planänderungen.

## 1. Begriffe

| Begriff | Definition |
|---|---|
| Readiness (in der App: „Tagesform“) | Geschätzte Abweichung vom persönlichen Normalzustand, in Einheiten der eigenen Streuung. 0 = wie üblich, negativ = weniger belastbar |
| Marker | Einzelner Messwert oder eine Antwort (z. B. Schlafdauer, „Beine“) |
| z-Wert | Abweichung eines Markers von der persönlichen Baseline, geteilt durch die persönliche Streuung; Vorzeichen immer so, dass positiv = besser |
| Baseline | Rollierender persönlicher Bezugswert eines Markers (§4.2) |
| Totband | Bereich um die Baseline, in dem eine Abweichung als Rauschen gilt und 0 zählt (kleinste relevante Änderung, engl. smallest worthwhile change) |
| Block | Gruppe verwandter Marker, die als ein Signal zählt: **A** Befinden, **B** Körpersignale, **C** Schlaf |
| Erwartung | Vorhersage der heutigen Tagesform aus gestern, Trainingslast und Kalender, bevor heutige Messungen eingehen |
| Stufe | Eine von vier verbalen Einordnungen (§4.7) |
| Datenbasis | hoch / mittel / niedrig: wie viel die heutige Einschätzung trägt (§4.7) |
| Lastdruck | Wie weit die Trainingslast der letzten Woche über dem Gewohnten liegt (§5) |
| Lebensdruck | Punkte aus Kalendermerkmalen für die Erwartung (§7.4) |
| Tageseignung | Vorausschau je Kalendertag für harte Einheiten: frei / eingeschränkt / ungeeignet (§7.5) |
| Harte Einheit | Definition des Plan-Kerns (`isHardSession`, `docs/plan-spec.md` §1). Für Verschiebungen gilt die strengere Platzierungs-Annahme: Long Run, jedes Q und das Rennen sind hart |
| Schlüsseleinheit | Long Run (HM/M) und Q1 der Woche |
| Sicherheitsflag | Krankheits-, Schmerz- oder Dauerbelastungs-Hinweis; überstimmt die Stufe (§9) |
| AU | Arbitrary Units, Einheit der Trainingslast (RPE × Minuten) |

## 2. Ist-Zustand (am Code geprüft, Commit `8f565ed`)

Die Zusammenfassung im Auftrag stimmt im Kern. Ergänzungen und Korrekturen:

1. **HRV wird als Tagesmittel aller SDNN-Werte gespeichert** (`src/recovery/aggregateRecoverySamples.ts:145-146, 221`), nicht als Nachtwert. Das mischt Messungen zu beliebigen Tageszeiten und ist die wichtigste fachliche Schwäche der heutigen Pipeline (Recherche B1).
2. **„Gefühl 1–5“ ist gegenläufig zu einer Anstrengungsskala beschriftet:** 1 = „Sehr schwer“, 5 = „Sehr leicht“ (`src/features/session/SessionEntrySheet.tsx:122`). Es misst Befinden, nicht Anstrengung, und ist nicht in RPE umrechenbar.
3. **`recovery_daily` speichert nur fünf Felder** (Schlafstunden, HRV, Ruhepuls, `energy_level` immer `null`, `signal_meta`; `src/lib/supabase/services/recoveryDailyService.ts:36-40`). Schlaf-Fenster, Atemfrequenz, Temperatur-Delta und Phasenanteile existieren nur lokal im Typ `RecoveryDailyRow`.
4. **Die heutigen Gewichte** (Schlaf 0,40 · HRV 0,25 · Ruhepuls 0,15 · Atmung 0,10 · Last 0,10; `src/recovery/recoveryTypes.ts:64-70`) und Dutzende Konstanten in `recoveryScoringEngine.ts`, `latentRecoveryState.ts` und `homeRecoveryScore.ts` haben keine Herkunft. REM-/Tiefschlafanteil und Aktivenergie fließen ein.
5. **Die Recovery-Achse im Chat-Swap ist rechnerisch wirkungslos** (`docs/calendar-system-analysis.md` §3.3): Sie erreicht die Warnschwelle praktisch nie, und der am stärksten ermüdete Athlet bekommt den niedrigsten Wert.
6. **Trainingslast** = km × Faktor nach Typ (Intervall/Tempo/Rennen 1,38 · Long Run 1,12; `src/recovery/trainingDailyLoad.ts:13-19`), ohne Dauer und ohne Anstrengung.
7. **Kalender-Konflikt** = belegter Zeitanteil > 65 % oder Sport-Stichwort im Titel (`src/scheduling/capacityScore.ts`). Die Kategorie aus `src/calendar/eventClassifier.ts` hat keine Wirkung in der Engine. Ganztagstermine werden beim Import verworfen (`src/calendar/eventToScheduleBlocks.ts:54`), also auch ein Prüfungstag oder eine Reise.
8. **Die Validatoren nutzen seit Schritt 14 des Plan-Kern-Umbaus `isHardSession`** (`src/ai/validation/hardWorkout.ts`, `validateMicroStructure.ts`) und prüfen über die Wochengrenze. Der „Samstag-Bug“ aus der Kalender-Analyse ist damit in `main` an der Wurzel behoben.
9. **Die drei unfertigen Branches** (`fix/load-class-ssot`, `fix/microstructure-delta`, `feat/event-load-semantics`) zweigen alle von `d1f0b4a` ab, also vor dem Plan-Kern. Sie bringen eine eigene Belastungsklasse (`src/core/loadClass.ts`) mit, die der Kern-Definition in `main` widerspricht (§14).
10. **Migration 013 fehlt in `main`** (Lücke 012 → 014); sie war für die Termin-Etiketten reserviert und liegt nur im Branch. Neue Migrationen zählen ab 016.
11. **Der Wert `fatiguePressure`** in `src/ai/validation/validatePhaseSwap.ts` und die Regel „drei harte in vier Tagen“ wurden bei Schritt 14 bewusst bis zur Readiness-Engine stehen gelassen; diese Spec ersetzt sie (§14).
12. Ob das Health-Plugin `@capgo/capacitor-health` Schlaf-Herzfrequenz, Schlag-zu-Schlag-Serien, Handgelenkstemperatur im Schlaf und `workoutEffortScore` liefern kann, ist **nicht geprüft** (Abhängigkeiten waren in der Sitzung nicht installiert). Gerätepunkt in §19.

## 3. Eingaben

Alle optional außer Plan und Datum. Der Kern bekommt sie als reine Daten; er hat keine Uhr und kein Netz.

| Eingabe | Quelle | Feld / Tabelle | Stufe (§12) |
|---|---|---|---|
| `todayYmd` | `src/core/time/timeSystem.ts` | – | alle |
| Plan (Einheiten mit `dateIso`, `kind`, km, Pace, Phase, `isRecoveryWeek`) | `TrainingPlanV2` | `training_plans` | alle |
| Erledigte Einheiten: Ist-km, Dauer, RPE 0–10 (neu), Gefühl 1–5 | Session-Eintrag, Health | `session_logs` (+ `rpe`, `duration_min`), `health_workouts` | alle |
| Check-in: Schlaf, Energie, Beine, Kopf (je 1–5), optionale Schlafdauer, Gesundheits-Chips | neu | `daily_checkins` (neu) | a–c |
| Schlafdauer, Schlaffenster | Apple Health | `recovery_daily.sleep_hours`, lokal Fenster | a |
| Herzfrequenz im Schlaf (bevorzugt) oder Ruhepuls | Apple Health | `recovery_daily.resting_hr` (+ neu `sleep_hr`) | a, b |
| HRV als **Nacht-Median** der SDNN-Werte im Schlaffenster | Apple Health | `recovery_daily.hrv_night_ms` (neu, §15); `hrv_ms` bleibt Tagesmittel für die alte Pipeline | a |
| Atemfrequenz im Schlaf, Temperatur-Delta | Apple Health | lokal, nur für §9 | a |
| Termine (Titel, Start, Ende) | EventKit-Import, Presets, manuell | `weekly_schedule_blocks` | a–c |
| Termin-Etiketten je Titel-Cluster | Nutzer | `event_load_labels` (neu) | a–c |

Plausibilitätsgrenzen (Wert außerhalb → verworfen, nicht geklammert): Schlaf 2–14 h [E]; Ruhe-/Schlafpuls 30–110 [E; zum Vergleich: individuelle Mittel 40–109 bei Quer 2020]; SDNN 5–300 ms [E]; Atemfrequenz 6–30 [E]; RPE 0–10; Dauer 5–600 min [E].

## 4. Modell

### 4.1 Überblick

```
Marker ──► z-Wert gegen eigene Baseline (Totband) ──► Blöcke A / B / C
                                                           │
gestern R, Lastdruck, Lebensdruck ──► Erwartung R⁻ ────────┤
                                                           ▼
                              gewichtetes Mittel nach Verlässlichkeit ──► R, P
                                                           │
                           Stufe · Gründe (Beiträge) · Datenbasis · Sicherheitsflags
                                                           │
                    + Plan, Tageseignung der nächsten Tage ──► Vorschlag (§8)
```

Begründung der Bauart (Recherche B6): Es gibt keine validierte Gesamtformel. Für kleine, lückenhafte Datenreihen pro Person sind gleiche Gewichte auf richtig gepolten, individualisierten Markern robuster als geschätzte Gewichte [L: Dawes 1979; Einhorn & Hogarth 1975]. Verwandte Marker werden zu einem Block gemittelt, damit dasselbe Signal nicht doppelt zählt. Ein lokales Niveau-Modell (einfachste Form eines Kalman-Filters) glättet über Tage, trägt Tage ohne Messung und führt die Unsicherheit ehrlich mit.

### 4.2 Baselines

Für jeden objektiven Marker m am Tag t:

- Fenster: die **28 Tage vor t**, der Tag t selbst ausgeschlossen. [L: Vesterinen 2016, Nuuttila 2022 nutzen 4 Wochen; deckt einen Zyklus ab]
- Lage: **Median**. Streuung: **1,4826 × MAD** (mittlere absolute Abweichung vom Median; robust gegen Ausreißer). [L: Alavi 2022 nutzt Median; MAD ist Statistik-Standard]
- Gültig ab **14 Werten** im Fenster. Darunter gibt es für diesen Marker keinen z-Wert („lerne deinen Normalbereich“). [E; Apple Vitals nutzt 7 Nächte, die Studien 4 Wochen]
- Mindest-Streuung (gegen Überempfindlichkeit bei sehr gleichmäßigen Werten): Schlaf-/Ruhepuls 2,0 Schläge [L: typische Tagesstreuung 3,0; Quer 2020] · ln(HRV) 0,10 [E; Buchheits 10–20 % gelten für Ln rMSSD und sind nicht übertragbar] · Schlafdauer 0,75 h [E].
- Tage mit aktivem Krankheitsflag (§9) zählen nicht in die Baseline. [E]
- z-Wert: `z = Vorzeichen × (Wert − Median) / Streuung`, begrenzt auf [−3, +3]. [E]

Bevölkerungswerte dienen nur als Plausibilitätsgrenzen (§3), nie als Mittelwert-Prior: Zwischen Personen ist die Streuung viel größer als innerhalb einer Person, ein solcher Prior wäre nach wenigen Tagen wirkungslos und davor falsch (Recherche B6 §2).

### 4.3 Block B – Körpersignale

**Herzfrequenz (HF).** Bevorzugt die mittlere Herzfrequenz im Schlaffenster, sonst Apples Ruhepuls. Bewertet wird das **Mittel der letzten 3 Tage** (mind. 2 Werte) gegen die 28-Tage-Baseline. [L: Einzeltage sind zu verrauscht, Buchheit 2014; Fenster 3 Tage E]
`z_HF = −(Mittel3 − Median28) / Streuung`, Totband 0,5. [P: 0,5 SD als kleinste relevante Änderung]
**Totband heißt überall:** Liegt |z| unter dem Band, wird z auf 0 gesetzt; außerhalb zählt z in voller Höhe. [E]

**HRV.** Je Nacht der **Median aller SDNN-Werte im Schlaffenster**, nur wenn mindestens 3 Werte vorliegen, sonst gibt es an diesem Tag keine HRV. [E; begründet durch Tageszeit- und Schlafphaseneffekt, Recherche B1 §2] Davon der natürliche Logarithmus. Bewertet wird das **7-Tage-Mittel** (mind. 4 Werte) gegen die 28-Tage-Baseline. [L: Plews 2014, Vesterinen 2016]
`z_HRV = (Mittel7 − Median28) / Streuung`, Totband **1,0** bei SDNN aus Hintergrundmessungen [E; doppelt so breit wie die Studien-Konvention ±0,5 SD wegen ~29 % Messfehler, O'Grady 2024], 0,5 bei rMSSD aus durchgehender Nachtmessung (später). Werte **über** dem Band zählen 0, nie positiv. Der HRV-Anteil geht mit **höchstens −1,0** in den Blockwert ein (`z_HRV` wird dafür auf [−1, 0] begrenzt) [E; damit die ungenaueste Messung nie allein eine Stufe kippt, R7]. [L: Le Meur 2013 – steigende HRV bei Überlastung; Vesterinen 2016 behandelt beide Richtungen als Stopp]

**Blockwert.** `B = Mittel der vorhandenen z_HF, z_HRV`. Verlässlichkeit `r_B = 1` mit Schlaf-Herzfrequenz, `r_B = 1,5` nur mit Apples Tages-Ruhepuls (Uhr ohne Nachtdaten), `r_B = 2` nur mit SDNN-HRV. [E] Ohne Nachtdaten und ohne Ruhepuls gibt es keinen Block B.

Atemfrequenz und Temperatur gehen **nicht** in den Blockwert ein. Sie sind sehr stabil und nur als Abweichungssignal für §9 sinnvoll; die Temperatur schwankt zudem mit dem Zyklus um etwa 0,3 °C (Recherche B2).

### 4.4 Block C – Schlaf

- **Dauer** (Uhr oder selbst angegeben): `z_letzte = (h − Median28) / Streuung`; `z_3 = (Mittel der letzten 3 Nächte − Median28) / Streuung`.
  `z_Dauer = min(0, 0,5 × z_letzte + 0,5 × z_3)`, danach Totband 0,5. Mehr Schlaf als üblich zählt 0. [E; einseitig, weil ein Überschuss kein belegter Bonus ist]
- `z_3` braucht mindestens 2 der letzten 3 Nächte, sonst gilt nur `z_letzte`. [E]
- Absolute Untergrenzen, unabhängig von der Baseline: letzte Nacht < 6 h → `z_Dauer ≤ −1`; 3-Nächte-Mittel < 6 h → `z_Dauer ≤ −2`. Ohne gültige Baseline ist `z_Dauer` genau −1 bzw. −2 bei Unterschreitung und entfällt sonst. [L: mehrere Nächte ~5 h kosten ~3 % (Roberts 2019, in der Recherche nur über eine Pressemitteilung geprüft); eine Nacht wirkt uneinheitlich (Craven 2022); Schwellen E]
- **Qualität** = Check-in-Frage „Wie hast du geschlafen?“, z-Wert nach §4.5.
- `C = Mittel der vorhandenen z_Dauer, z_Qualität`. `r_C = 1`, wenn `z_Dauer` existiert (gemessen oder angegeben), sonst `1,5`. [E]
- **Schlafphasen, Fragmentierung und Schlafmittelpunkt gehen nicht ein.** [L: Phasen unzuverlässig, Recherche B2 §6; Regelmäßigkeit ohne Evidenz für Erholung]

### 4.5 Block A – Befinden

Drei Check-in-Antworten: Energie, Beine, Kopf (je 1–5, höher = besser). Die Schlaf-Antwort gehört zu Block C.

Für jede Antwort x mit n bisherigen Antworten im 28-Tage-Fenster:

```
Lage     m = (n × Mittel28 + 7 × 3) / (n + 7)        # startet bei der Skalenmitte 3 (n = 0 → m = 3) und wandert zum eigenen Mittel
Streuung s = max(SD28, 0,7)   für n ≥ 7;   s = 1,0 für n < 7
z        = (x − m) / s,  begrenzt auf [−3, +3],  kein Totband
```

[E: Pseudozahl 7 und Mindest-Streuung 0,7. Zweck: funktioniert ab dem ersten Tag mit absolutem Anker und verhindert, dass bei fünf Stufen ein einziger Punkt Abweichung zum Extremwert wird (Recherche B4 „Was für MyRace folgt“ Punkt 2).]

`A = Mittel der drei z-Werte`, `r_A = 1`. Fehlt eine Antwort, zählen die übrigen.

Dass die Items getrennt bleiben und nicht zu einer Summe verschmelzen, ist Absicht: In der Anzeige nennt die App das einzelne Item („Beine schwer“), nicht den Blockwert [L: Gesamtscores weniger sensitiv, Saw 2016].

### 4.6 Zustand: Erwartung und Update

Zustand R (Tagesform) und Varianz P (Unsicherheit), fortgeschrieben je Kalendertag.

```
Erwartung   R⁻ = φ × R_gestern − β_L × Lastdruck − β_S × Lebensdruck
            P⁻ = φ² × P_gestern + Q

Update      R = ( R⁻/P⁻ + Σ_b  z_b / r_b ) / ( 1/P⁻ + Σ_b 1/r_b )        b = vorhandene Blöcke A, B, C
            P = 1 / ( 1/P⁻ + Σ_b 1/r_b )

Beitrag     Beitrag_b = (z_b / r_b) / ( 1/P⁻ + Σ 1/r_b );   Beitrag_Erwartung = (R⁻/P⁻) / ( … )
            Σ Beiträge = R
```

| Parameter | Start | Herkunft |
|---|---|---|
| φ (Trägheit von Tag zu Tag) | 0,7 | [E] |
| Q (wie stark sich die Tagesform über Nacht ändern darf) | 1,0 | [E] |
| β_L | 0,3 je Punkt Lastdruck | [E]; Richtung belegt (harte Belastung senkt HRV; Altini & Plews 2021, zitiert in Recherche B6), Größe nicht |
| β_S | 0,2 je Punkt Lebensdruck | [E] |
| Startwerte | R₀ = 0, P₀ = 1 | [E] |
| Lücke | > 3 Tage ohne jeden Block → R = 0, P = P₀ beim nächsten Block | [E] |
| Grenzen | R wird nach jedem Schritt auf [−3, +3] begrenzt | [E] |

Was die Zahlen bewirken (gerechnet, `docs/readiness-plan.md` Schritt 7 macht daraus Tests):

- Mit drei Blöcken täglich pendelt sich P bei 0,26 ein; die Erwartung trägt dann 23 % zum Ergebnis, jeder Block rund 26 %.
- Ohne Uhr (A und C aus dem Check-in) liegt P bei 0,40; die Erwartung trägt 33 %, das Befinden 40 %, der Schlaf 27 %.
- Ohne jede Eingabe wächst P auf rund 2 und R wandert mit Faktor 0,7 je Tag zurück zu 0.
- Training und Kalender wirken **nur über die Erwartung**. Sie tragen Tage ohne Messung, werden aber von echten Messungen überstimmt. Damit wird gestrige Belastung nicht automatisch als Malus gewertet, wenn Körper und Befinden heute normal sind (Kritik an Hersteller-Scores, Recherche B7 §6.3).
- **Keine Doppelzählung:** Schlafbezogene Kalendermerkmale (§7.4) entfallen aus dem Lebensdruck, sobald für die Nacht eine Schlafdauer oder eine Schlaf-Antwort vorliegt.

Abweichung vom Recherche-Vorschlag (B6 §8): Q = 1,0 statt 0,5. Mit 0,5 hätte die Erwartung bei Nutzern ohne Uhr mehr Gewicht als ihr eigenes Befinden; das widerspräche der Zusage, dass das Befinden den Ausschlag geben kann. Sensitivitätsanalyse in §13.

### 4.7 Ausgabe: Stufe, Datenbasis, Index

**Stufe**

| R | Stufe (interner Code) | Text in der App |
|---|---|---|
| ≥ +0,5 | `above` | Über deinem Normal |
| −0,5 < R < +0,5 | `normal` | In deinem Normalbereich |
| −1,25 ≤ R ≤ −0,5 | `below` | Etwas unter deinem Normal |
| < −1,25 | `low` | Deutlich unter deinem Normal |

[P: ±0,5 als kleinste relevante Änderung; −1,25 E. Die Grenze ist so gewählt, dass `low` nur erreicht wird, wenn mehrere Blöcke deutlich abweichen: alle drei bei −2 ergeben eingeschwungen −1,54 (am allerersten Tag mit P₀ = 1: −1,63); alle drei bei −1,5 erst am zweiten Tag −1,34.]

- **Hysterese:** Ein Stufenwechsel gegenüber gestern gilt erst, wenn R die Grenze um 0,1 überschreitet. [E; gegen Flackern]
- **„Eher“-Formulierung:** Liegt R näher als 0,15 an einer Grenze, lautet der Text „eher …“ (Wortlaut §10.7). [E]
- **Kennenlernphase:** In den ersten 14 Tagen mit Check-in oder Uhr-Daten gibt es aus der Stufe nur Hinweise (H0) und Verschieben (H2); kein Streichen (H3), kein „Diese Woche ruhiger“ (§8.4), kein §9.4. Die Sicherheits-Chips (§9.2, §9.3) gelten ab Tag 1. [E; Grund: Bis die eigene Lage gelernt ist, zählt der Anker 3. Wer gewohnheitsmäßig „2“ antwortet, läge sonst zwei Wochen lang täglich unter „Normal“ (gerechnet: −0,71 / −0,83 / −0,86).]
- **Ohne Messung nie „deutlich“:** Bei Datenbasis „niedrig“ wird keine Stufe schlechter als `below` gezeigt. [E; ohne diese Regel ergäben Lebensdruck 2 und Lastdruck 1 allein am dritten Tag `low`.]

**Datenbasis**

| Datenbasis | Bedingung |
|---|---|
| hoch | heute ≥ 2 Blöcke, davon mindestens einer objektiv mit gültiger Baseline (≥ 14 Werte), und ≥ 14 Check-ins im Fenster |
| mittel | heute ≥ 1 Block (auch nur Check-in, auch in der ersten Woche) |
| niedrig | heute kein Block: reine Erwartung |
| keine | > 3 Tage ohne Block: keine Stufe, nur Fakten aus Plan und Kalender |

[E] Planändernde Vorschläge **aus der Stufe** gibt es nur bei „mittel“ oder „hoch“ (§8.1); Vorschläge aus der Tageseignung (§8.3a, §8.4) und aus §9 brauchen keine Datenbasis. In den ersten 14 Tagen trägt jede Ausgabe den Zusatz „Ich lerne dich noch kennen“.

**Index.** `Index = 50 + 20 × R`, begrenzt auf 0–100, gerundet auf 5. [E] Nur für Verlaufskurven und den Export. Die Hauptkarte zeigt ihn nicht (§10, §18 A1).

## 5. Trainingslast

Zweck: Buchhaltung für die Erwartung und für Einsichten. Kein Lastmaß ist als „Dosis“ validiert (Recherche B3); die Last ist deshalb kein eigener Block, sondern wirkt nur über die Erwartung.

**Last je Einheit (AU), erste verfügbare Stufe gilt:**

1. `Last = RPE (0–10) × Dauer in Minuten` [L: Foster 2001; bei Läufern r ≈ 0,74–0,89 gegen HF-Maße, Mann 2019]
2. ohne RPE: `Last = Σ Minuten je Abschnitt × Gewicht` mit Gewichten in RPE-Einheiten [E, kein validiertes Set existiert]:

| Art | REC | E, Ein-/Auslaufen, Trabpause | LR, MLR | M | T | I | R | Rennen | Rad | Kraft | Schwimmen |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Gewicht | 1,5 | 2 | 3 | 4 | 6 | 8 | 8 | 9 | 2,5 | 3 | 2,5 |

   Dauer aus Ist-Dauer, sonst aus km × geplanter Pace, sonst km × 6:30 min/km [E]. Kraft, Rad und Schwimmen ohne Ist-Dauer: 45 min [E].
3. Sobald **10 Einheiten** einer Art mit RPE vorliegen, ersetzt der persönliche RPE-Median dieser Art das Tabellengewicht. [E]

Banister-TRIMP aus dem Durchschnittspuls wird **nicht** verwendet: Er unterschätzt Intervalle, braucht HFmax und Ruhepuls und darf nicht mit sRPE gemischt werden (Recherche B3 §2). Geplante, noch nicht erledigte Einheiten zählen nicht.

**Tageslast** = Summe der Einheiten des Tages. **ATL** und **CTL** = exponentiell gewichtete Mittel der Tageslast mit Zeitkonstanten 7 und 42 Tagen [P: Coggan; Heuristik]. Bis 28 Tage Daten vorliegen, wird die Vorgeschichte mit der Planlast der jeweiligen Wochen vorbelegt. Vor dem Planstart gilt je Tag `currentWeeklyKm ÷ 7 × E-Pace (min/km, sonst 6:30) × 2` AU; fehlt `currentWeeklyKm` (Altpläne ohne `meta.core.inputs`), gilt das Tagesmittel der ersten Planwoche. Solange weniger als 14 Tage echte Last vorliegen, ist der Lastdruck höchstens 1. [E]

**Lastdruck** (für §4.6):

```
Lastdruck = begrenze( (ATL − CTL) / max(CTL, 50 AU) / 0,25 ,  0 … 3 )
```

Ein Punkt entspricht einer Wochenlast 25 % über dem Gewohnten. Unterdurchschnittliche Last gibt **keinen Bonus** (kein negativer Lastdruck). [E] In geplanten Aufbauwochen erwarten wir einen Lastdruck unter 1 (Annahme, nicht gemessen; Schritt 6 des Plans prüft das an P1–P6), der die Erwartung um höchstens 0,3 senkt; das ist gewollt klein.

Nicht verwendet: ACWR-Schwellen, Monotonie/Strain-Schwellen, TSB als Readiness (Recherche B3, Teil C Zeilen 16–18).

**Abweichungssignal** (nur Hinweis, nie planändernd) [E]: RPE ≥ 2 Punkte über dem persönlichen Median dieser Art bei erreichter Zielpace, an zwei Einheiten in Folge → Grund „Einheiten fallen dir gerade schwerer als sonst“.

## 6. Check-in

### 6.1 Morgen-Check-in

Vier Pflichtfragen, je fünf Stufen, höher = besser, ein Tipp je Frage, Reihenfolge von konkret zu allgemein. Eigene Formulierungen (die KEB der Ruhr-Uni Bochum ist ein geschütztes Verfahren). Begründung je Frage: Recherche B4 §8.

| # | Frage | 1 · 2 · 3 · 4 · 5 | Block |
|---|---|---|---|
| 1 | Wie hast du geschlafen? | sehr schlecht · schlecht · okay · gut · sehr gut | C |
| 2 | Wie viel Energie hast du heute? | völlig platt · müde · normal · frisch · voller Energie | A |
| 3 | Wie fühlen sich deine Beine an? | sehr schwer · schwer · normal · locker · sehr locker | A |
| 4 | Wie geht es dir im Kopf? | sehr gestresst · angespannt · okay · entspannt · sehr entspannt | A |

**Nur ohne Schlafdaten aus der Uhr:** ein fünftes Feld „Wie lange hast du geschlafen?“ als Stepper in 15-Minuten-Schritten, vorbelegt mit dem eigenen Median (am ersten Tag 7:30 [E]). Kein Pflichtfeld. [L, schwach: Bei Sportlern mit täglicher Abfrage wich die Selbstauskunft nur ~20 min ab (r = 0,85; Sekundärquelle, Rugby-Profis). In der Allgemeinbevölkerung überschätzen Kurzschläfer ihre Dauer dagegen um rund 1,2 h (Lauderdale 2008). Das trifft genau die 6-h-Schwelle aus §4.4: Ohne Uhr ist sie unsicherer, deshalb zählt dort die Schlaf-Antwort gleich viel wie die Dauer. Recherche B2 §7]

**Optionale Chips darunter** (Standard: nichts gewählt; Gatekeeper-Prinzip nach OSTRC-H2, Clarsen 2020):

- **„Etwas zwickt“** → Wo? (Fuß/Sprunggelenk · Wade/Achillessehne · Schienbein · Knie · Oberschenkel · Hüfte/Leiste · Rücken · anderes) → „Wie stark beim Gehen oder Laufen?“ 0–10 → „Läufst du deshalb anders als sonst?“ Ja/Nein.
- **„Fühle mich krank“** → Was trifft zu? nur Hals/Nase · Husten, Brust · Fieber, Gliederschmerzen · Magen-Darm.

Ein gesetzter Chip ist am Folgetag vorausgewählt („Zwickt es noch?“). Wirkung: §9.

**Bewusst keine Pflichtfrage** „Wie bereit fühlst du dich?“: gute Evidenz (ten Haaf 2017), aber am stärksten strategisch verzerrbar, sobald die Antwort die Einheit steuert. [P]

**Zeitpunkt:** morgens; gültig für den Kalendertag, änderbar bis zum Start der ersten Einheit oder 14:00, je nachdem, was früher ist; danach nur noch nachtragbar ohne Wirkung auf den heutigen Vorschlag. [E] Eine Erinnerung zur vom Nutzer gewählten Zeit (Standard 07:30 [E]), abschaltbar; keine zweite, keine Mahnung. Der Text der Erinnerung ist neutral („Wie geht es dir heute?“) und nennt nie Stufe, Gründe oder Gesundheitsangaben (Sperrbildschirm).

### 6.2 Nach der Einheit

- **Neu, Standardfrage beim Abhaken, mit „Später“ überspringbar** (automatisch synchronisierte Einheiten haben ohnehin keinen Abhak-Moment; fehlende RPE → Fallback-Last, §5 Stufe 2)**:** „Wie anstrengend war die Einheit?“ 0–10 mit Ankern: 0 gar nicht · 1 sehr leicht · 2 leicht · 3 mäßig · 5 anstrengend · 7 sehr anstrengend · 10 maximal. [L: Skala Foster 2001; deutsche Anker eigene Formulierung, nicht validiert → Review-Punkt 6] Abfrage beim Abhaken; der Zeitpunkt muss nur konstant sein (Christen 2016).
- **Bleibt:** „Wie hat es sich angefühlt?“ 1–5 als Befinden nach der Einheit, wird nicht in die Last eingerechnet. Bestandswerte werden nicht umgerechnet.
- Ist ein Apple-`workoutEffortScore` lesbar (Gerätepunkt), wird er als Vorschlag vorbelegt, nicht still übernommen. [E]

### 6.3 Wie der Check-in in die Rechnung eingeht

Schlaf-Antwort → Block C (§4.4); Energie, Beine, Kopf → Block A (§4.5). Ohne Uhr sind A und C die einzigen Messblöcke. Die Chips gehen nicht in R ein, sondern setzen Sicherheitsflags.

### 6.4 Kurz und motivierend halten

- **Sofortige Wirkung:** Direkt nach der vierten Antwort erscheint die Tageskarte mit Gründen und Vorschlag. Das ist der am besten belegte Hebel für dauerhafte Nutzung (Saw 2015a/b; Neupert 2019/2022; Barboza 2017).
- **Kein Streak, keine Abzeichen, keine Mahnungen.** [L: Silverman & Barasch 2023 – gebrochene Streaks demotivieren] Ein Streak belohnt außerdem das Ausfüllen, nicht die ehrliche Antwort. Stattdessen eine Wochenleiste mit sieben Punkten ohne Zähler und ohne Abriss-Meldung.
- **Auslassen hat keine Folgen** außer dem ehrlichen Satz „Heute ohne Check-in: Einschätzung nur aus Training und Kalender.“
- **Ehrlichkeit schützen:** Befinden allein führt nie zu einer automatischen Änderung. Stammen alle Signale aus dem Check-in, wird „streichen“ (H3) nur bei `low` an zwei Tagen in Folge vorgeschlagen, sonst höchstens „leichter“ oder „verschieben“ (§8.3); so lohnt strategisches Antworten nicht (Neupert 2019).
- Zielzeit unter 15 Sekunden: vier Tipps, keine Texteingabe, kein Bestätigen-Button (die vierte Antwort schließt ab, „Zurück“ bleibt möglich).

## 7. Kalender und Leben

### 7.1 Grundsatz

Die Recherche (B5) trägt Antons Idee nur in veränderter Form:

- **Messen** lässt sich Lebensbelastung am besten mit der täglichen Frage „Wie geht es dir im Kopf?“ plus Schlaf. Das ist die Grundwahrheit.
- **Der Kalender sieht voraus und erklärt.** Er sagt, wann Schlaf knapp wird, wann kein Zeitfenster da ist und wann ein vom Nutzer bestätigter Stressor ansteht.
- **Unetikettierte Termine wirken nur über Zeit und Dauer**, nie über einen vermuteten Stressgehalt. Es gibt keine Belege für Belastungspunkte je Terminart.
- Kein Kalendertitel verlässt das Gerät bzw. die eigene Supabase-Zeile in Richtung eines Sprachmodells ohne KI-Einwilligung.

### 7.2 Merkmale aus Terminen (ohne den Titel zu deuten)

Berechnet je Kalendertag aus `weekly_schedule_blocks` (alle Quellen: EventKit, Preset, manuell). Ganztagstermine werden künftig importiert und zählen nur für Etiketten (§7.3), nicht für Zeiten.

| Merkmal | Definition | Herkunft |
|---|---|---|
| Schlafgelegenheit der Nacht d−1 → d | Zeit zwischen (Ende des letzten Termins am Vortag, der nach 18:00 endet, + 60 min) und (Beginn des ersten Termins am Tag d − 60 min). Gibt es keinen solchen Abendtermin oder keinen Termin vor 12:00, ist das Merkmal **unbekannt** (nicht „gut“). Ebenfalls **unbekannt**: Termine über Nacht (Beginn vor und Ende nach Mitternacht mit mehr als 2 h im neuen Tag, z. B. Nachtschicht 22–6 Uhr) – tagsüber schlafen kann der Kalender nicht sehen; hier zählt nur das Etikett | Definition [E], Puffer [E]; Wirkung [L: Vedaa 2015 – Schlaf 5,0–6,5 h bei kurzer Ruhezeit] |
| Kurze Ruhezeit | < 11 h zwischen Terminende und nächstem Terminbeginn | [L: Definition „quick return“, Vedaa 2015] |
| Gebundene Stunden | Summe der Termindauern am Tag (Überlappungen einfach gezählt) | [L: lange Arbeitstage → kürzerer Schlaf, weniger Abschalten; Virtanen 2009, Wendsche 2017; Schwelle E] |
| Trainingsfenster | größte freie Lücke zwischen 06:00 und 22:00 [E]; ausreichend, wenn ≥ geplante Dauer + 45 min (Umziehen, Duschen, Weg) [E] | [E] |
| Spätes Training | das einzige ausreichende Trainingsfenster des Tages endet nach 21:00 (der Plan kennt keine Uhrzeit einer Einheit und ohne Uhr keine Schlafenszeit; deshalb diese Näherung) | [L: Abstand < 2 h zum Schlaf ungünstig, Frimpong 2021, Stutz 2019; 21:00 E] |

### 7.3 Terminarten erkennen und etikettieren (ohne KI)

**Cluster-Schlüssel.** Titel kleinschreiben; ä/ö/ü/ß zu ae/oe/ue/ss; Ziffern, Datumsteile, Satzzeichen und **alle Leerzeichen** entfernen; Ergebnis ist der Schlüssel. „Sprint Prüfung“, „Sprint-Prüfung“ und „Sprintprüfung“ ergeben denselben Schlüssel `sprintpruefung`. Zwei Schlüssel gehören zum selben Cluster, wenn die Jaccard-Ähnlichkeit ihrer Zeichen-Trigramme ≥ 0,6 ist [E]; der zuerst etikettierte Schlüssel ist der Cluster-Name. Wiederkehrende Termine mit gleichem Schlüssel sind automatisch ein Cluster.

**Etikett je Cluster** (Tabelle `event_load_labels`, §15):

| Feld | Werte |
|---|---|
| Art | Arbeit (sitzend) · Arbeit (körperlich) · Uni/Lernen · Prüfung/Abgabe · Sport · Reise · Privat · Zählt nicht |
| Anstrengung | leicht · mittel · fordernd |
| Herkunft | `user` (bestätigt) · `suggested` (Vorschlag aus Stichwort, wirkt noch nicht) |

**Vorschläge aus Stichwörtern** (nur als vorausgewählte Antwort in der Rückfrage, nie als stille Wirkung): `pruefung, klausur, examen, abgabe, deadline, referat, praesentation, kolloquium` → Prüfung/Abgabe; `schicht, dienst, spaetschicht, nachtschicht, kellnern, service` → Arbeit (körperlich)?; `flug, bahn, reise, zug` → Reise; die Sportliste aus `PHYSICAL_LOAD_TITLE_KEYWORDS` → Sport, mit der Ausschlussliste Schach/Skat/Poker/Quiz/E-Sport aus `feat/event-load-semantics`. [E]

**Rückfrage-Flow** [E; Obergrenzen ohne Literatur, Eisele 2022: Länge belastet mehr als Häufigkeit]:

- Höchstens **eine Rückfrage pro Tag und drei pro Woche**, nur in der App, im Anschluss an den Check-in oder beim Öffnen am Abend, nie als Push.
- Gefragt wird **nach** dem Termin: „Gestern stand ›Schicht Augustiner‹ in deinem Kalender (17:00–00:30). Wie war das für dich?“ → drei Chips *entspannt · normal · fordernd* und darunter klein *Was ist das für ein Termin?* mit der vorausgewählten Art. Ein Tipp genügt; die Art wird mit übernommen, wenn sie vorgeschlagen war.
- Reihenfolge: zuerst Cluster mit Wiederholung, dann nach `Häufigkeit × Dauer × Nähe zu einer Schlüsseleinheit`. Cluster mit „Zählt nicht“ oder dreimal übersprungen werden nicht mehr gefragt. Ein beantworteter Cluster wird ebenfalls nicht erneut gefragt (eine Antwort genügt); nur wenn der Nutzer das Etikett in den Einstellungen löscht, beginnt es neu.
- Ein Etikett gilt für den ganzen Cluster, rückwirkend und künftig, und ist in Einstellungen → Training → „Meine Termine“ änderbar.
- Vor dem ersten Etikett funktioniert alles über §7.2.

**KI-Einordnung** (später, optional): Mit KI-Einwilligung darf ein Sprachmodell für unetikettierte Cluster einen *Vorschlag* für Art liefern. Der Vorschlag wirkt erst nach Bestätigung. Ohne Einwilligung geht kein Titel an ein Modell (R18).

### 7.4 Lebensdruck (rückblickend, für die Erwartung)

Punkte für den Tag d, Summe begrenzt auf 3 [alle E; Rangfolge folgt der Evidenz: Schlaf > etikettierte Stressoren > Dauer]:

| Merkmal | Punkte | Bedingung |
|---|---|---|
| Schlafgelegenheit d−1 → d unter 6 h | 2 | nur wenn für die Nacht weder Schlafdauer noch Schlaf-Antwort vorliegt |
| Schlafgelegenheit 6–7 h | 1 | wie oben |
| Kurze Ruhezeit (< 11 h) | +0,5 | wie oben |
| Gebundene Stunden gestern > 10 h | 1 | – |
| Arbeit (körperlich) gestern ≥ 6 h | 1 | Etikett `user` |
| Prüfung/Abgabe heute | 1 | Etikett `user` |
| Prüfung/Abgabe gestern | 0,5 | Etikett `user` |
| Reise (Etikett) in den letzten 2 Tagen, vom Nutzer als „fordernd“ markiert | 1,5 | Etikett `user`. Zeitzonen kennt der Kern nicht (weder im Kalender-Import noch in §3); „fordernd“ steht deshalb für Fernreisen. [P: ab 3 Zeitzonen relevant, Janse van Rensburg 2021] |
| Cluster mit Anstrengung „fordernd“ gestern | 1 | Etikett `user`, nicht zusätzlich zu den Zeilen darüber für denselben Termin |
| Cluster mit Anstrengung „mittel“ gestern | 0,5 | wie oben |

Wirkung auf R: je Tag höchstens −0,6 in der Erwartung, die bei vorhandenen Messungen nur 23–33 % zählt. Über mehrere Tage ohne jede Messung kann sich das über die Trägheit φ auf bis zu −2,0 aufsummieren; deshalb zeigt die App ohne Messung nie eine Stufe schlechter als `below` (§4.7). Der Kalender allein kann die Stufe also nur an Tagen ohne Check-in und ohne Uhr verschieben. Das ist Absicht.

### 7.5 Tageseignung (vorausschauend, für die Planung)

Je Kalendertag der nächsten 14 Tage [E; halbes Import-Fenster von 28 Tagen], für **harte Einheiten**:

| Eignung | Bedingung (eine genügt) | Herkunft |
|---|---|---|
| **ungeeignet** | Prüfung/Abgabe an diesem Tag (Etikett) · Schlafgelegenheit der Nacht davor < 6 h · kein ausreichendes Trainingsfenster · Reisetag mit Etikett „fordernd“ und die 2 Tage danach · einziges Trainingsfenster liegt nach einer körperlichen Schicht ≥ 6 h | [E], gestützt auf B5 §8.2 |
| **eingeschränkt** | Vortag einer Prüfung/Abgabe · Schlafgelegenheit 6–7 h · gebundene Stunden > 10 h · Tag nach körperlicher Schicht ≥ 6 h · „Spätes Training“ (§7.2) · Sport-Termin „fordernd“ am selben Tag oder am Vortag | [E] |
| **frei** | sonst | – |

Für **lockere Einheiten** gilt nur: kein ausreichendes Trainingsfenster → „passt zeitlich nicht“ (Kürzen oder Verschieben anbieten). Eine körperliche Schicht zählt nie als Training.

Die Tageseignung ersetzt die heutige 65-%-Regel und die Stichwort-Deckelung in `capacityScore.ts` (§14).

**Prüfungsphase:** ≥ 2 Prüfungen/Abgaben (Etikett) in 7 Tagen → in dieser Woche entfällt Q2 (wird E + Strides), Q1 und Long Run bleiben, sofern sie auf freie oder eingeschränkte Tage passen. [E]

## 8. Von Readiness zur Handlung

### 8.1 Grundregeln

1. Readiness darf Belastung **senken, verschieben oder tauschen, nie erhöhen**. Auch bei „Über deinem Normal“ bleibt der Plan, wie er ist. [E; Nuuttila 2022 erhöhte um 5 %, aber in einem überwachten Studienaufbau mit rMSSD-Nachtmessung – nicht übertragbar]
2. Jeder Vorschlag wird vor der Anzeige geprüft. Geprüft wird die **Änderung**, nicht der ganze Plan: An den betroffenen Tagen und ihren Nachbarn dürfen I6 (harte Tage, auch über die Wochengrenze, MLR), I7, I8, I15 und I16 (nur: Lauf an einem verfügbaren Tag) keinen neuen Verstoß bekommen. Regeln, die ein **Minimum oder einen Verlauf** verlangen (I3–I5, I10, I13, Anzahl der Lauftage in I16), gelten für Vorschläge nicht: Readiness senkt nur, und ein Plan-Prüfer, der „zu wenig“ als Fehler wertet, würde sonst genau die schützenden Vorschläge blockieren. `checkPlan` selbst ist dafür nicht nutzbar (es prüft das Zwischenformat `SessionPlan`, nicht den gespeicherten Plan); der Readiness-Kern bekommt eigene Wächter mit Paritätstest (`planGuards`, Plan Schritt 10). Altpläne ohne `meta.core.inputs`: zusätzlich `validateMicroStructure`/`validateSwap`, und kein Tausch auf einen bisherigen Ruhetag (verfügbare Tage unbekannt).
   Fällt ein Vorschlag durch, rückt immer der mit **weniger** Belastung nach (H2 → H3; H1 nur für Schlüsseleinheiten), nie einer mit mehr. Vorschläge aus §9 werden nie durch die Plan-Prüfung unterdrückt.
3. **Vorschlag statt Automatik, ohne Ausnahme** (§8.8).
4. Sicherheitsflags (§9) gehen vor: Ist eines aktiv, gilt nur §9.
5. Vorschläge **aus der Stufe** nur bei Datenbasis ≥ mittel und nach der Kennenlernphase nur eingeschränkt (§4.7). Vorschläge aus der Tageseignung (§8.3a, §8.4) und aus §9 brauchen keine Datenbasis.
6. Wie die Steigerung nach einer gekürzten oder pausierten Woche weiterläuft, regelt der Readiness-Kern nicht: Die Folgewochen bleiben, wie sie sind. Nach einer Pause von ≥ 7 Tagen verweist die App auf die Plananpassung (§9.2). Ob eine einzelne gekürzte Woche eine sanftere Folgewoche braucht (I3 rechnet mit geplanten km), ist Review-Punkt 13.

### 8.2 Handlungsstufen

| Code | Bedeutung | Umsetzung |
|---|---|---|
| H0 | Wie geplant | keine Änderung, höchstens ein Hinweis |
| H1 | Leichter | harte Einheit: Qualitätsumfang −25 % (Wiederholungen bzw. Blocklänge), Mindestgrößen der Plan-Spec §7 beachten, darunter H3. Lockere Einheit: Dauer −25 %, mindestens 20 min [E; liegt bewusst unter der E-Mindestdauer 25 min des Plan-Kerns, dort nur Warnung, harte Untergrenze 15 min]. Long Run: −25 % [L: −25 % wie Nuuttila 2022 „senken“; identisch zur Long-Run-Entlastung im Plan-Kern] |
| H2 | Verschieben | harte Einheit tauscht den Tag mit einer lockeren Einheit oder einem Ruhetag im Fenster heute+1 … heute+3 |
| H3 | Locker statt hart | Q wird E (gleiche Dauer, höchstens 60 min [E]) + optional Strides; Qualität entfällt ersatzlos |
| H4 | Pause | Ruhetag; nur aus §9 oder auf Wunsch des Nutzers |

### 8.3 Entscheidung für heute

„Zwei Signale“ heißt: mindestens zwei Blöcke mit z ≤ −0,5 **oder** dieselbe Stufe (oder schlechter) schon gestern. Block B zählt dabei nur als Signal, wenn die Herzfrequenz mitträgt (`z_HF ≤ −0,5`); HRV allein ist kein Signal. „Dieselbe Stufe gestern“ zählt nur, wenn an einem der beiden Tage ein Block außer HRV bei ≤ −0,5 lag. Stammen alle Signale aus dem Check-in (kein Block B), gibt es H3 nur bei `low` an zwei Tagen in Folge; davor H2, sonst H1. [E] Diese Bedingung ist die Antwort auf die schwache Verlässlichkeit einzelner Tageswerte (Ryan 2019; Le Meur 2013).

| Stufe | Heute hart (`isHardSession`: Q, Rennen ausgenommen, Long Run ≥ 90 min) | Heute locker | Ruhetag |
|---|---|---|---|
| `above` | H0, Text ohne Aufforderung zu mehr | H0 | H0 |
| `normal` | H0; bei einem einzelnen auffälligen Marker Hinweis (z. B. kurze Nacht → „wenn möglich früher am Tag laufen“ [L: Craven 2022]) | H0 | H0 |
| `below`, ein Signal | H0 mit Hinweis: „Lauf dich 10–15 min ein. Fühlt es sich dann nicht richtig an, mach einen lockeren Lauf daraus.“ [P] | H0 | H0 |
| `below`, zwei Signale | **H2**, wenn ein zulässiger Tag existiert (§8.5); sonst Q2 → **H3**, Schlüsseleinheit → **H1** | H0 mit Hinweis „ruhig bleiben, REC-Tempo reicht“ | H0 |
| `low` | **H2**, wenn zulässig; sonst **H3** (Long Run: H1) | **H1**, Ruhetag als zweite Option | H0 |

### 8.3a Vorschlag aus dem Kalender

Unabhängig von Stufe und Datenbasis (gilt also auch ganz ohne Check-in und Uhr): Liegt eine harte Einheit **heute** auf einem „ungeeigneten“ Tag, gilt die Zeile „`below`, zwei Signale“; auf einem „eingeschränkten“ Tag die Zeile „`below`, ein Signal“.

Der Nutzer sieht immer den Vorschlag **und** „Wie geplant laufen“ als gleichwertige zweite Schaltfläche. Wählt er „wie geplant“, wird das ohne Kommentar akzeptiert.

### 8.4 Die Woche

**Wochenvorschau** (Sonntagabend bzw. beim ersten Öffnen der Woche, und sobald sich Termine der nächsten 7 Tage ändern): Für jede harte Einheit auf einem „ungeeigneten“ Tag sucht die bestehende Engine (`proposeWeekCalendarReassignments`, `validateWeekReassignmentBatch`) einen Tausch innerhalb der Woche (über die Wochengrenze nur nach §8.5 Nr. 1), jetzt mit der Tageseignung statt des Zeitanteils als Eingang. Ergebnis ist **ein** gesammelter Vorschlag mit Vorher/Nachher (Roadmap-Schritt 6). „Eingeschränkte“ Tage werden nur getauscht, wenn ein „freier“ Tag ohne Regelverstoß zur Verfügung steht. Wochenvorschläge („Wochenvorschau“ und „Diese Woche ruhiger“ zusammen) erscheinen höchstens zweimal je Kalenderwoche (R25) [L: Nuuttila 2022 entschied zweimal wöchentlich]; Tagesvorschläge sind davon nicht betroffen.

**Mehrere schlechte Tage:**

| Auslöser (Datenbasis ≥ mittel) | Vorschlag |
|---|---|
| 3 Tage in Folge `below` oder schlechter, oder 2 Tage `low` | **„Diese Woche ruhiger“**: verbleibendes Q2 → E; offenes Q1 → H1 (−25 %); verbleibende lockere Einheiten −20 %, Long Run −25 %. Entspricht einer vorgezogenen Entlastung (Plan-Spec §5.3: −20 bis −30 %). Nicht in Taper- und Rennwoche. In einer geplanten Entlastungswoche nur Q → E, keine weitere Umfangskürzung. Nicht in der Kennenlernphase (§4.7). [E] |
| Liegt die nächste geplante Entlastungswoche in der Folgewoche | zusätzlich Hinweis „deine Entlastungswoche kommt nächste Woche ohnehin“; kein Tausch der Wochen im MVP [E] |
| 7 von 10 Tagen `below` oder schlechter [E] | Sicherheitsstufe „anhaltend“ (§9.4) |
| Zwei Wochen in Folge mindestens ein Q gestrichen (H3) | Hinweis an den Nutzer und an den Coach-Kontext: „Dein Plan passt gerade schlecht zu deinem Alltag“ mit Link zu Planeinstellungen (Lauftage, Ziel). Keine weitere automatische Kürzung. [E] |

### 8.5 Verschieben oder streichen

Ein Zieltag für H2 ist zulässig, wenn alle Punkte gelten:

1. Er liegt in heute+1 … heute+3. Über die Wochengrenze nur, wenn die Zielwoche danach nicht mehr km und nicht mehr Qualitäts-km hat als geplant (praktisch: Tausch gegen eine dort liegende Einheit gleicher oder größerer Länge, und die Zielwoche hat ihr Q-Maximum noch nicht erreicht). [E]
2. Tageseignung des Zieltags ist „frei“ (bei `low`: mindestens „eingeschränkt“ ist nicht genug, es muss „frei“ sein; gibt es keinen, greift die Alternative). [E]
3. Die dort liegende Einheit ist locker oder ein Ruhetag und nicht gesperrt (`src/ai/mutations/lockedSessions.ts`: erledigt, übersprungen, vergangen, Rennen).
4. Nach dem Tausch gilt I6 (keine zwei harten Tage hintereinander, mit Platzierungs-Annahme und über die Wochengrenze), der MLR liegt nicht zwischen zwei harten Tagen, I7 (höchstens die erlaubte Zahl Q je Kalenderwoche), I15/I16.
5. Die Einheit landet nicht in einer Taper- oder Rennwoche, wenn sie aus einer früheren Woche stammt.
6. Für einen Long Run: höchstens ±1 Tag, **immer innerhalb seiner Kalenderwoche** (sonst hätte eine Woche keinen und die nächste zwei), nie in die 7 Tage vor dem Rennen (I9/§8 der Plan-Spec).

Rangfolge, wenn kein Tag zulässig ist: **Q2 wird gestrichen (H3) vor Q1; Q1 wird verkleinert (H1) vor gestrichen; der Long Run wird verkleinert, nie gestrichen**, außer bei Sicherheitsflags. Begründung: Schlüsseleinheiten tragen die spezifische Anpassung; ein verpasstes Q2 kostet am wenigsten. [P]

### 8.6 Schutzregeln für jeden Vorschlag

- **Kein Nachholen.** Eine gestrichene Qualität wird nie später zusätzlich eingeplant. Keine Woche bekommt durch Vorschläge mehr Q als I7 erlaubt, mehr Qualitäts-km als I8 oder mehr Wochen-km als geplant. (R3, R10)
- **Kein längerer Einzellauf.** Kein Vorschlag macht eine Einheit länger, als dieselbe Einheit (gleiche `id`) im Plan ist, und kein Vorschlag erzeugt eine zusätzliche Einheit. [L: Einzellauf-Spitze > 110 % des längsten Laufs der letzten 30 Tage, Frandsen 2025]
- **Zwei Long Runs** liegen nach einem Vorschlag nie näher als 6 Tage beieinander. [E]
- Eine verschobene Einheit behält Art, Umfang und Pace; nur der Tag ändert sich.

### 8.7 Taper, Rennwoche, Renntag

| Phase | Regel |
|---|---|
| Taper (vor der Rennwoche) | Aus der Stufe nur H0, H1, H3; **kein H2** (das Fenster heute+1…+3 läge immer näher am Rennen). Die Wochenvorschau darf im Taper eine harte Einheit nur auf einen **früheren** Tag derselben Woche legen; die Abstände zum Rennen bleiben (letzte Q ≥ 4 Tage vor M, ≥ 3 Tage vor HM/10k/5k). Nichts rückt näher ans Rennen (R16). Genau 1 Q je Taper-Woche bleibt Ziel; H3 ist erlaubt (Warnung I13). [E, gestützt auf Plan-Spec §5.4, §8] |
| Rennwoche | Keine planändernden Vorschläge außer aus §9. Die Karte zeigt die Gründe, aber statt eines Vorschlags den festen Text: „In der Rennwoche sind Nervosität und unruhiger Schlaf normal. Eine einzelne unruhige Nacht ist vor einem Rennen üblich und meist kein Problem.“ [L: Craven 2022 – Morgenleistung kaum betroffen; bewusst ohne Leistungsversprechen formuliert] |
| Tag vor dem Rennen und Renntag | Keine Stufe, nur Fakten und der Text oben. Krankheits- und Schmerzflags gelten weiter und führen zu §9. Das Rennen wird nie verschoben oder entfernt. [E] |

### 8.8 Automatik?

Geprüft: Wäre eine kleine automatische Anpassung gerechtfertigt (z. B. lockerer Lauf −10 min bei `low`)? **Nein, im MVP nichts.** Gründe: (1) Das Maß ist nicht validiert (§13). (2) Eine stille Änderung widerspricht dem Vertrauensargument gegenüber Wettbewerbern (Recherche B7 §6.1 Punkt 5). (3) Der Aufwand für den Nutzer ist ein Tipp. Ausgenommen sind reine Texte (Hinweise, Tempo-Empfehlung „REC reicht“), die den gespeicherten Plan nicht ändern. Nach dem Freundes-Test kann neu bewertet werden, ob Nutzer eine Einstellung „kleine Kürzungen automatisch übernehmen“ wünschen.

## 9. Sicherheit

Grundsatz: MyRace ist kein Medizinprodukt, stellt keine Diagnosen und gibt keine Heilversprechen (App-Store-Regel 1.4.1). Krankheits- und Verletzungssignale führen zu Pause und Abklärung, nie zu Trainingsoptimierung. Jeder Text dieser Stufen endet mit: „MyRace ersetzt keine ärztliche Einschätzung.“

### 9.1 Auffällige Körpersignale (nur mit Uhr)

Einzelsignale gegen die 28-Tage-Baseline (§4.2), jeweils für die letzte Nacht:

| Signal | „erhöht“ | „deutlich erhöht“ | Herkunft |
|---|---|---|---|
| Schlaf-Herzfrequenz (sonst Ruhepuls) | +3 Schläge oder +1,5 Streuungen (das Größere) | +5 Schläge oder +2 Streuungen (das Größere) | [L: Alavi 2022 +3/+4; Mishra 2020 median +7; Quer 2021 2 SD] |
| Atemfrequenz im Schlaf | +1,0 pro Minute | +1,5 pro Minute | [L: Streuung 0,51/min, Miller 2020] |
| Handgelenkstemperatur | +0,5 °C | +0,8 °C | [L: Zykluseffekt 0,30 °C, Maijala 2019; Krankheit im Mittel +0,63 °C, Smarr 2020] |

**Hinweis „Deine Werte weichen ab“** wird ausgelöst, wenn:

- **A:** Herzfrequenz „deutlich erhöht“ an zwei Nächten in Folge **und** in mindestens einer davon Atemfrequenz oder Temperatur „erhöht“; oder
- **B:** alle drei Signale in derselben Nacht mindestens „erhöht“, eines davon „deutlich“.

Temperatur allein löst nie aus. Zyklusdaten werden nicht erhoben. Die Regel ist aus COVID-Studien abgeleitet und **nicht validiert** [E, Review-Punkt 9]; erwartet wird, dass sie viele leichte Infekte nicht vorab erkennt (bei 95 % Spezifität werden < 50 % erkannt, Natarajan 2020) und gelegentlich falsch anschlägt (Ziel: höchstens etwa einmal pro Monat und Person, im Freundes-Test zählen).

Reaktion: **Die App fragt, sie behauptet nichts.** Text: „Dein Puls im Schlaf lag die letzten zwei Nächte deutlich über deinem üblichen Bereich. Das kann viele Gründe haben. Wie fühlst du dich?“ → Antworten *Gut, wie immer* · *Etwas angeschlagen* · *Krank*. „Gut“ → harte Einheit heute wird zu H2/H3 vorgeschlagen, morgen neu bewertet. Die anderen Antworten öffnen die Symptom-Chips (§9.2).

### 9.2 Krankheit (Chip „Fühle mich krank“ oder Antwort aus §9.1; funktioniert ohne Uhr)

| Angabe | Wirkung | Herkunft |
|---|---|---|
| nur Hals/Nase | Harte Einheiten heute und morgen → H3; lockere Einheit optional, höchstens 30 min [E]. Text nennt das ausdrücklich eine Erfahrungsregel | [P: „Neck Check“, laut IOC-Konsens 2022 nicht validiert] |
| Husten/Brust, Fieber/Gliederschmerzen, Magen-Darm | **Pause** (H4) für heute und jeden weiteren Tag, an dem der Chip gesetzt bleibt. Keine Stufe, keine Trainingsvorschläge | [P: IOC-Konsens 2022, Schwellnus et al.] |
| Rückkehr | Erster Tag ohne Chip: 10–20 min sehr locker als Test, **nur anstelle einer geplanten Einheit** (fällt der Tag auf einen Ruhetag, bleibt er Ruhetag und der Test rückt auf den nächsten Lauftag). Geht das gut, zwei weitere lockere Tage; frühestens danach wieder eine harte Einheit. Erst Umfang, dann Intensität | [P: IOC 2022; Tageszahlen E] |
| Chip länger als 7 Tage gesetzt | Text: „Das dauert jetzt über eine Woche. Lass das bitte ärztlich abklären, bevor du wieder trainierst.“ | [L: Symptome dauern im Mittel 7,1 Tage, Snyders 2022] |
| Zusatzfrage bei Brust-Angabe: Brustschmerz, Atemnot oder Herzrasen? → Ja | „Bitte trainiere nicht und lass das ärztlich abklären. Bei starken oder plötzlichen Beschwerden: Notruf 112.“ Keine weiteren Vorschläge | [P] |

Nach einer Pause von ≥ 7 Tagen [E] weist die App darauf hin, dass der Plan danach womöglich nicht mehr passt, und verlinkt auf die bestehende Coach-Aktion `adjust_plan_for_illness` bzw. die Planeinstellungen. Der Readiness-Kern baut den Plan nicht selbst um.

### 9.3 Schmerz (Chip „Etwas zwickt“)

| Angabe | Wirkung | Herkunft |
|---|---|---|
| Stärke ≥ 4/10 **oder** „laufe anders als sonst“ | Heute kein Lauf (H4), Vorschlag: Ruhe oder schmerzfreie Alternative (Rad/Schwimmen, falls im Plan). Als Vorsichtsregel bezeichnet | [P: Klinikermeinung; Silbernagel 2007 erlaubt bei Sehnenbeschwerden bis 5/10 – Review-Punkt 10] |
| Stärke 1–3 und normales Laufbild | Keine harte Einheit heute (H3), lockerer Lauf erlaubt mit Hinweis „abbrechen, wenn es stärker wird“ | [P] |
| Chip an 3 Tagen in Folge mit Stärke ≥ 4 oder an 7 Tagen in Folge überhaupt | „Lass das bitte ärztlich oder physiotherapeutisch abklären.“ | [E] |

Die App nennt keine Verletzungsnamen und macht keine Übungsvorschläge.

### 9.4 Anhaltend unter dem Normal

7 von 10 Tagen `below` oder schlechter bei Datenbasis ≥ mittel, obwohl in dieser Zeit mindestens ein Vorschlag angenommen wurde: Text „Du liegst seit über einer Woche unter deinem Normal, obwohl wir schon reduziert haben. Gönn dir ein paar wirklich ruhige Tage. Wenn dazu deine Leistung nachlässt, du schlecht schläfst oder dich niedergeschlagen fühlst, sprich mit einer Ärztin oder einem Sportmediziner.“ Vorschlag: 3 Tage nur locker oder Ruhe, danach neu bewerten. Das Wort „Übertraining“ kommt in App-Texten nicht vor: Die Diagnose ist klinisch und per Ausschluss zu stellen (Meeusen 2013). [P]

### 9.5 Was nie passiert

- Kein Vorschlag, mit Krankheits- oder Schmerzflag eine harte Einheit zu laufen, auch nicht „verkürzt“.
- Keine Stufe „Über deinem Normal“ an einem Tag mit Flag.
- Keine Aussage über Ursachen („du wirst krank“, „du bist übertrainiert“, „deine HRV zeigt Stress“).
- Die Chips werden nie an ein Sprachmodell geschickt, außer der Nutzer hat der KI-Verarbeitung zugestimmt und öffnet selbst den Coach.

## 10. UX und Wow-Moment

Ziel: App öffnen, in drei Sekunden wissen, wie es einem geht, warum, und was heute sinnvoll ist.

### 10.1 Variante A – „Ein Satz, drei Gründe, ein Vorschlag“ (Empfehlung)

```
┌──────────────────────────────────────────────┐
│ HEUTE · Mi, 11. Nov                          │
│                                              │
│ Etwas unter deinem Normal                    │
│ ▁▁▁▁▁▁▁▁●▁▁▁▁│▁▁▁▁▁▁▁▁▁▁▁                    │   ← Skala: dein Normalbereich in der Mitte,
│          dein Normal                         │     Punkt = heute, ohne Zahl
│                                              │
│ Warum                                        │
│ ↓ Schlaf      5:40 h · 1:50 h unter deinem Schnitt │
│ ↓ Puls        im Schlaf +4 über üblich       │
│ ↓ Beine       schwer                         │
│ ○ Gestern     Schicht bis 0:30               │
│ → Morgen      Klausur                        │
│                                              │
│ Vorschlag                                    │
│ Intervalle auf Freitag.                      │
│ Heute 40 min locker.                         │
│                                              │
│ [ Vorschlag übernehmen ]  [ Wie geplant ]    │
│                                              │
│ Datenbasis: hoch · Wie rechnet MyRace? ›     │
└──────────────────────────────────────────────┘
```

Regeln für die Karte:

- Zeile 1: Stufe im Wortlaut aus §4.7, bei Grenznähe mit „eher“.
- „Warum“: höchstens fünf Zeilen, sortiert nach Betrag des Beitrags. ↓ = zieht runter, ↑ = zieht hoch, ○ = Kontext aus dem Kalender (wirkt nur über die Erwartung), → = Vorausschau. Jede Zeile nennt den Rohwert in der Einheit des Nutzers und den Vergleich zum eigenen Schnitt, nie einen z-Wert.
- HRV erscheint nur, wenn sie außerhalb des Bandes liegt, und dann als „HRV diese Woche unter deinem üblichen Bereich“, ohne Prozentzahl auf Tagesbasis.
- „Vorschlag“: höchstens zwei kurze Sätze. Beide Schaltflächen gleich groß.
- „Wie rechnet MyRace?“ öffnet die Detailansicht: alle Marker mit eigenem Normalband, die Beiträge als Balken, die angewandte Regel im Klartext („Zwei Signale unter deinem Normal und eine harte Einheit heute → verschieben, wenn ein passender Tag frei ist“), der Verlauf der letzten 28 Tage.

### 10.2 Variante B – „Coach-Satz“

```
Guten Morgen, Anton.

Kurze Nacht nach der Schicht, und deine Beine sind schwer.
Dazu morgen die Klausur.

Ich würde die Intervalle auf Freitag legen und heute
40 Minuten locker laufen.

[ Machen wir so ]   [ Ich laufe wie geplant ]

Mehr dazu ›
```

Fließtext aus festen Bausteinen (kein Sprachmodell), wärmer, aber weniger überprüfbar auf einen Blick. Geeignet als Kopf der Karte in Variante A. Nicht als Benachrichtigung: Vor dem Check-in steht der Satz noch nicht fest, und Gesundheitsinhalte gehören nicht auf den Sperrbildschirm (§6.1).

### 10.3 Variante C – „Zahl im Ring“

```
        ( 25 )        Etwas unter deinem Normal
   Schlaf −  Puls −  Beine −  Kalender ○
   → Intervalle auf Freitag, heute 40 min locker
```

Nahe an Whoop/Garmin und am Beispiel aus dem Auftrag („Readiness 54“). **Nicht empfohlen** als Hauptansicht: Eine Zahl lädt zum Vergleichen und Jagen ein (Orthosomnie, Baron 2017), täuscht Genauigkeit vor (Unsicherheit rund ±10 Punkte: √P ≈ 0,5 mal 20 Punkte je Einheit) und ist genau das, was die Wettbewerber schon haben. Der Index bleibt in der Detailansicht und in Verlaufskurven verfügbar.

**Empfehlung:** Variante A als Karte auf Home (ersetzt die heutige Recovery-Kachel), der erste Satz von Variante B als Überschrift.

### 10.4 Der erste Wow-Moment (Tag 1, ohne jede Vorgeschichte)

Direkt nach dem ersten Check-in und mit verbundenem Kalender:

```
Deine Woche, wie MyRace sie sieht

Mi   Schicht 17:00–0:30
Do   Vorlesung ab 8:15  →  nur 5:45 h Zeit zum Schlafen
     Tempolauf war für Do geplant
Fr   Vormittag frei

Vorschlag: Tempolauf auf Freitag früh, Donnerstag 35 min locker.

[ Übernehmen ]   [ So lassen ]
```

Das ist der Moment, den keine Uhr liefern kann: Die App erkennt ein Problem, **bevor** es im Körper messbar ist, und löst es regelkonform.

### 10.5 Kalender-Rückfrage als Coach, der zuhört

- Ton: eine Frage, kein Formular. „Gestern stand ›Schicht Augustiner‹ bis 0:30 in deinem Kalender. Wie war das für dich?“
- Ein Tipp reicht (*entspannt · normal · fordernd*). Danach ein Satz, der zeigt, dass es ankam: „Danke. Nach solchen Schichten schlage ich dir künftig vor, harte Einheiten zu verlegen.“
- Nie mehr als eine Frage am Tag; „Nicht mehr fragen“ ist immer sichtbar.
- Nach der Antwort fragt die App für diesen Cluster nicht mehr (§7.3) und sagt einmalig: „›Schicht Augustiner‹ habe ich jetzt als fordernd gespeichert. Ändern kannst du das unter Meine Termine.“

### 10.6 Was ausdrücklich vermieden wird

| Vermeiden | Stattdessen |
|---|---|
| Score-Angst: Zahl als Urteil, rote Farbe, „schlecht“ | Stufen relativ zum eigenen Normal; ruhige Farben (kein Rot außer bei Sicherheitsstufen); Vorschlag statt Urteil |
| Scheingenauigkeit: „Readiness 54 %“, „HRV −8 %“ auf Tagesbasis | Stufe, Band, „Datenbasis“; Rohwerte nur dort, wo sie genau sind (Schlafdauer, Puls) |
| Moralisieren: „Du hast zu wenig geschlafen“, „Du solltest …“ | Beschreiben: „5:40 h, 1:50 h unter deinem Schnitt“; Vorschlag als Angebot |
| Schuld bei Auslassen: Streaks, „Du hast 3 Tage nicht eingecheckt“ | „Heute ohne Check-in“ |
| Kausalbehauptungen: „Spätschichten senken deine HRV“ | „bisher“, „im Schnitt“, „Zusammenhang, kein Beweis“ |
| Belohnung für hohe Werte: „Top-Form, gib Gas!“ | „Über deinem Normal. Der Plan passt.“ |
| Medizinische Sprache: Diagnose, Übertraining, Infekt als Feststellung | Fragen und Abklärung empfehlen |
| Falsche Autorität: „wissenschaftlich validiert“ | „So rechnet MyRace“ mit offenen Regeln |

### 10.7 Texte (Deutsch, Du-Form)

**Stufen und Standardvorschläge**

| Fall | Text |
|---|---|
| `above` | „Über deinem Normal. Der Plan passt, lauf ihn wie vorgesehen.“ |
| `normal` | „In deinem Normalbereich. Alles wie geplant.“ |
| „eher“ (R näher als 0,15 an einer Grenze) | „Eher über deinem Normal.“ · „Im Normalbereich, eher an der unteren Grenze.“ · „Eher etwas unter deinem Normal.“ · „Eher deutlich unter deinem Normal.“ |
| `normal` + kurze Nacht | „In deinem Normalbereich, trotz kurzer Nacht. Wenn es geht, lauf die Einheit eher früher am Tag.“ |
| `below`, ein Signal, hart | „Etwas unter deinem Normal. Lauf dich 10–15 Minuten ein. Fühlt es sich dann nicht gut an, mach einen lockeren Lauf daraus.“ |
| `below`, zwei Signale, H2 | „Etwas unter deinem Normal. {Einheit} passt besser auf {Tag}. Heute {Ersatz}.“ |
| `below`, zwei Signale, H1 | „Etwas unter deinem Normal und kein besserer Tag frei. Vorschlag: {Einheit} um ein Viertel kürzer.“ |
| `low`, H3 | „Deutlich unter deinem Normal. Heute lieber locker statt {Einheit}. Die Qualität dieser Einheit fällt diese Woche weg, das ist in Ordnung.“ |
| Woche ruhiger | „Drei Tage unter deinem Normal. Vorschlag: Der Rest der Woche wird ruhiger, {Details}. Nächste Woche geht es normal weiter.“ |
| Datenbasis niedrig | „Heute ohne Check-in: Einschätzung nur aus Training und Kalender.“ |
| Keine Datenbasis | „Keine Einschätzung heute. Dein Check-in dauert keine 15 Sekunden.“ |
| Erste 14 Tage | „Ich lerne dich noch kennen. In etwa zwei Wochen kenne ich deinen Normalbereich.“ |
| Ohne Uhr | „Basiert auf deinem Check-in, deinem Training und deinem Kalender. Körpersignale wie Puls im Schlaf sehe ich ohne Uhr nicht.“ |
| Uhr ohne Nachtdaten | „Deine Uhr liefert nachts keine Daten. Trägst du sie im Schlaf, sehe ich Puls und Schlafdauer.“ (einmalig, dann nur in der Detailansicht) |
| Vorschlag abgelehnt | (kein Text; die Karte zeigt „Wie geplant“) |

**Gründe-Bausteine** (Auswahl): „Schlaf {h:mm} h · {Δ} unter deinem Schnitt“ · „Drei kurze Nächte in Folge“ · „Puls im Schlaf +{n} über üblich“ · „HRV diese Woche unter deinem üblichen Bereich“ · „Energie niedrig“ · „Beine schwer“ · „Kopf angespannt“ · „Viel Training in den letzten 7 Tagen“ · „Gestern {Termin} bis {Uhrzeit}“ · „Nur {h:mm} h Zeit zum Schlafen vor {Termin}“ · „Morgen {Termin}“ · „Heute {Termin}: kein Zeitfenster für {Einheit}“.

## 11. Lernen über Zeit

| Was | Ab wann | Wie | Schutz |
|---|---|---|---|
| Baselines aller Marker | Check-in ab Tag 1 (mit Anker), objektiv ab 14 Werten, voll ab 28 Tagen | rollierend (§4.2, §4.5) | Median/MAD, Mindest-Streuung, Kranktage ausgeschlossen |
| Persönliche RPE je Einheiten-Art | ab 10 Einheiten der Art | Median ersetzt Tabellengewicht (§5) | begrenzt auf 0,5–2× Tabellenwert [E] |
| Termin-Etiketten | ab der ersten Antwort | je Cluster (§7.3) | wirken nur mit Herkunft `user` |
| **Einsichten** zu Terminarten und Verhalten | ab ≥ 10 Tagen mit und ≥ 10 Tagen ohne in 120 Tagen | siehe unten | siehe unten |
| Individuelle Sensitivität (β_L, β_S, Blockgewichte) | frühestens ab 90 gepaarten Tagen, nach dem MVP | geschrumpfte Schätzung, Gewicht n/(n+60) [E] | begrenzt auf 0,5–2× Startwert; als „Tendenz“ gezeigt; Overfitting-Risiko belegt (Rothschild 2024) |

**Regeln für Einsichten** (Recherche B5 §5, §8.3; alle Schwellen [E], Methode [L]):

1. **Mindestdaten:** ≥ 10 Tage nach der Terminart und ≥ 10 Vergleichstage innerhalb von 120 Tagen. Darunter: „Noch zu wenig Daten“. (Whoop zeigt ab 5/5; damit lässt sich nur ein riesiger Effekt von d ≈ 2 nachweisen. Mit 10/10 immer noch nur d ≈ 1,3 – deshalb die weiteren Regeln.)
2. **Zielgrößen:** höchstens vier – Schlafdauer, Puls im Schlaf, HRV (Nacht), Befinden (Block A) am Folgetag.
3. **Vergleichsgröße:** Abweichung vom eigenen 28-Tage-Median, nie der Rohwert.
4. **Effektmaß:** Median-Differenz mit 90-%-Intervall aus blockweisem Bootstrap (Blöcke von 3 Tagen wegen Autokorrelation, fester Seed für Determinismus). Anzeige nur, wenn das Intervall 0 ausschließt **und** der Effekt mindestens die halbe eigene Tagesstreuung beträgt.
5. **Mehrfachtests:** Benjamini-Hochberg über alle gleichzeitig geprüften Paare, Zielquote 10 %.
6. **Störgrößen:** Schlafdauer und Trainingslast des Vortags herausrechnen (Vergleich innerhalb ähnlicher Tage). Verschwindet der Effekt, lautet die Einsicht „läuft über kürzeren Schlaf“.
7. **Schrumpfung:** angezeigter Effekt = geschätzter Effekt × n/(n+15).
8. **Wirkung auf den Plan:** Eine Einsicht ändert nie von selbst etwas. Sie kann dem Nutzer anbieten, ein Etikett zu ändern (z. B. Anstrengung auf „fordernd“). Verfällt nach 90 Tagen ohne Bestätigung durch neue Daten.
9. **Sprache:** „An Tagen nach einer Spätschicht hast du bisher im Schnitt 1:10 h kürzer geschlafen (12 von 14 Fällen). Dein Puls im Schlaf lag dann meist höher. Das ist ein Zusammenhang, kein Beweis.“ Nie „Spätschichten senken deine HRV um 9 %“.

Beispiele zulässiger Einsichten: Schlaf nach Terminart · Befinden am Tag nach harten Einheiten (wie lange brauchst du?) · Befinden nach kurzen Nächten · „Montags liegst du meist unter deinem Normal“ (Wochentagsmuster ab 8 Wochen).

## 12. Datenstufen

| Stufe | Vorhanden | Blöcke | Datenbasis (typisch) | Was die App sagt |
|---|---|---|---|---|
| **a** Uhr mit Nachtdaten | Schlaf, Schlaf-HF, HRV, Check-in, Plan, Kalender | A, B, C + Erwartung | hoch (nach 14 Tagen) | volle Karte |
| **b** Uhr ohne Nacht | Ruhepuls (Tag), Workouts mit Puls, Check-in | A, B (nur HF, `r_B = 1,5`), C aus Check-in | mittel bis hoch | volle Karte, einmaliger Hinweis zu Nachtdaten |
| **c** ohne Uhr | Check-in, Plan, Kalender | A, C aus Check-in | mittel | volle Karte mit dem Satz „Körpersignale sehe ich ohne Uhr nicht“ |
| **d** keine Eingaben | Plan, evtl. Kalender | keine | niedrig → keine | Tag 1–3: „Einschätzung nur aus Training und Kalender“; danach keine Stufe. Kalender-Vorausschau (§7.5, §8.4) funktioniert weiter, weil sie keine Stufe braucht |

In jeder Stufe funktionieren: Wochenvorschau aus dem Kalender, Sicherheits-Chips (über den Check-in), Session-RPE. Ehrlichkeitsregel: Die App zeigt nie eine Stufe, deren Datenbasis „keine“ ist, und nie einen Marker, für den keine Baseline existiert.

In Stufe b ist HRV nicht verwendbar: Ohne Schlaffenster gibt es keinen Nacht-Median, und Tageswerte sind nicht vergleichbar.

## 13. Validierung

Es gibt keine eigene Studie. Was sich trotzdem prüfen lässt, in dieser Reihenfolge:

1. **Regeltests:** Invarianten R1–R26 (§16) als Unit- und Property-Tests; Referenzszenarien S1–S13 (§17) als Snapshot- und Bereichstests.
2. **Sensitivitätsanalyse:** φ ∈ {0,5; 0,7; 0,85}, Q ∈ {0,5; 1; 2}, Grenze `low` ∈ {−1,0; −1,25; −1,5}, Totbänder × {0,5; 1; 1,5}. Bericht `docs/readiness-sensitivity.md`: Wie oft ändern sich Stufe und Vorschlag in den Szenarien und in 1 000 simulierten Nutzer-Monaten? Erwartung: Vorschläge sind robust gegen ±50 % der [E]-Parameter; wo nicht, kommt der Parameter ins Review.
3. **Trockenlauf auf offenen Daten:** PMData (Fitbit + tägliche Wellness inkl. subjektiver Readiness 0–10 + sRPE; CC BY 4.0) und LifeSnaps (nächtliche HRV-Reihen; CC BY 4.0). Geprüft wird nur Plausibilität: Sinkt R nach belegten Stressoren (kurze Nacht, hohe Last)? Korreliert R mit der dort erhobenen subjektiven Readiness? Kein Training eines Modells.
4. **Expertenreview an der DSHS:** Spec, Config und die Szenarien S1–S13; offene Punkte §19.
5. **Freundes-Test (10–20 Personen × 6 Wochen):** (a) Fehlalarmrate der Krankheitsregel; (b) Anteil angenommener Vorschläge je Handlungsstufe; (c) Compliance des Check-ins je Woche; (d) sagt die Stufe am Morgen die Abweichung der Session-RPE vom persönlichen Median derselben Einheiten-Art vorher?; (e) zwei Fragen pro Woche: „Hat die Einschätzung heute gepasst?“ Ja/Nein. Was das zeigen kann: Brauchbarkeit, grobe Fehler, Richtung der Zusammenhänge. Was nicht: Leistungs- oder Verletzungseffekte.
6. **Zirkularität benennen:** Ein Vergleich von R mit dem Befinden ist teilweise zirkulär, weil das Befinden eingeht. Aussagekräftig sind nur Vergleiche mit Größen, die **nicht** eingehen: Session-RPE der Einheit danach, Pace bei gleicher Herzfrequenz, „Hat es gepasst?“.

Bis mindestens Punkt 5 ausgewertet ist, heißt es in App und Pitch nicht „validiert“, sondern „nach offen gelegten, sportwissenschaftlich begründeten Regeln“.

## 14. Bestand: behalten, umbauen, wegwerfen

| Baustein | Urteil | Begründung |
|---|---|---|
| `src/recovery/aggregateRecoverySamples.ts`, `finalizeRecoveryDailyRows.ts`, `recoveryStorage.ts` | **behalten, erweitern** | Rohdaten-Aggregation ist solide; ergänzen um Nacht-Median der HRV, Schlaf-Herzfrequenz, Anzahl HRV-Werte je Nacht |
| `recovery_daily`, `recoveryDailyService.ts` | **behalten, erweitern** | um `sleep_hr`, `hrv_night_ms`, `hrv_samples`; `energy_level` bleibt ungenutzt (Check-in bekommt eine eigene Tabelle) |
| `recoveryScoringEngine.ts`, `latentRecoveryState.ts`, `homeRecoveryScore.ts`, `loadOnlyHomeRecoveryScore.ts`, `recoveryFallback7d.ts` | **ersetzen** durch `src/readinessCore`, danach löschen | Zahlen ohne Herkunft, Schlafphasen und Aktivenergie im Score, Glättung über mehrere Schichten (EMA + Rollmittel + Trägheit 0,7/0,3 + Blend 0,72/0,28) macht den Wert unerklärbar. Die Idee des latenten Zustands bleibt (§4.6), jetzt mit expliziter Varianz |
| Konfidenz-, Semantik-, Interpretationsschicht (`recoveryConfidence…`, `recoverySemanticLayer.ts`, `recoveryInterpretationLayer.ts`, `aiInsightGenerator.ts`) | **wegwerfen** | ersetzt durch „Datenbasis“ (§4.7) und feste Textbausteine (§10.7) |
| `recoveryPresentation.ts`, `recoveryDisplayState.ts`, `useRecoveryDomainRuntime.ts`, `legacyRecoveryReadModelBoundaries.ts` | **umbauen** | Verdrahtung in die App bleibt der Einstieg; liest künftig das Ergebnis des Kerns |
| `trainingDailyLoad.ts`, `planTrainingLoad.ts` | **ersetzen** | km × Faktor → sRPE/Minuten × Gewicht (§5) |
| `src/lib/ai/recoverySummary.ts`, `getRecoveryInfluence.ts`, Recovery-Achse in `validateSwap.ts`, `fatiguePressure` in `validatePhaseSwap.ts` | **ersetzen** | Die Achse ist rechnerisch wirkungslos; Validatoren bekommen Stufe und Flags statt eines 0–100-Werts |
| Kalender-Import (`src/calendar/calendarImportService.ts`, `calendarSyncService.ts`, `eventToScheduleBlocks.ts`), `weekly_schedule_blocks`, Presets | **behalten**, kleine Änderung | Ganztagstermine nicht mehr verwerfen (für Etiketten Prüfung/Reise) |
| `src/calendar/eventClassifier.ts` | **umbauen** | Stichwörter werden Vorschläge für Etiketten (§7.3), keine stille Kategorie mehr |
| `src/scheduling/capacityScore.ts` | **umbauen** | Zeitanteil-Regel (65 %) und Stichwort-Deckel → Merkmale und Tageseignung (§7.2, §7.5). Die Schnittstelle `computeSessionDayFitScore` bleibt als Adapter für die Mutations-Engine |
| `src/ai/mutations/**` (Scan, Greedy-Umverteilung, Batch-Validierung, `assignSessionToBestCapacityDay.ts`, `lockedSessions.ts`) | **behalten, erweitern** | funktionierende, getestete Tausch-Mechanik; neu: Verschieben über die Wochengrenze (+3 Tage), Handlungen H1/H3 (Inhalt ändern statt Tag) |
| `src/ai/validation/**` | **behalten** | seit Schritt 14 auf `isHardSession` |
| Branch `fix/load-class-ssot` | **nicht mergen, schließen** | Zweck in `main` anders gelöst (Kern-Definition); `src/core/loadClass.ts` würde eine zweite Definition einführen |
| Branch `fix/microstructure-delta` | **nicht mergen; Idee portieren** | „Änderung bewerten statt ganzen Plan“ und Hinweise in der `AiActionCard` sind wertvoll, müssen aber auf dem heutigen Validator neu gebaut werden (Plan Schritt 10) |
| Branch `feat/event-load-semantics` | **nicht mergen; Teile portieren** | `src/scheduling/eventLoad.ts` (Belastungsmerkmal, Ausschlussliste, Nachbarregel) wird Grundlage der Etikett-Vorschläge und der Tageseignung; die stille Stichwort-Wirkung entfällt zugunsten bestätigter Etiketten |
| Geplante Tabelle `event_load_labels` | **bauen** (Migration 018) | wie geplant, aber Schlüssel = Cluster statt exakter Titel |
| Notiz „Plan Woche für Woche erzeugen“ | **nicht jetzt** | Der Plan-Kern erzeugt deterministisch den ganzen Plan; Readiness passt die laufende und die nächste Woche an. Das liefert den Nutzen ohne zweiten Generator. Später neu bewerten |

## 15. Datenmodell und Datenschutz

**Neue bzw. geänderte Tabellen** (alle mit RLS `user_own_data`, `ON DELETE CASCADE`, Aufnahme in `USER_DATA_TABLES` in `api/_lib/deleteAccount.js`; Details und Reihenfolge im Umsetzungsplan):

| Migration | Inhalt |
|---|---|
| 016 `session_logs_rpe` | `session_logs.rpe smallint` (0–10, nullable), `session_logs.duration_min integer` (nullable) |
| 017 `daily_checkins` | `user_id`, `calendar_day`, `sleep_quality`, `energy`, `legs`, `mind` (je 1–5), `sleep_hours_self numeric`, `pain jsonb`, `illness jsonb`, `created_at`, `updated_at`; eindeutig je `(user_id, calendar_day)`. Dazu `profiles.health_consent_at timestamptz`, `profiles.health_consent_version text` (Zustimmung zu Gesundheitsangaben, analog zu Migration 015; beide gesetzt oder beide NULL) |
| 018 `event_load_labels` | `user_id`, `cluster_key text`, `display_title text`, `kind`, `effort`, `source` (`user`/`suggested`), `skip_count`, `updated_at`; eindeutig je `(user_id, cluster_key)` |
| 019 `recovery_daily_night` | `recovery_daily` + `sleep_hr numeric`, `hrv_night_ms numeric`, `hrv_samples smallint`. `hrv_ms` bleibt als Altfeld (Tagesmittel) und wird vom neuen Kern nicht gelesen |
| 020 `readiness_daily` | `user_id`, `calendar_day`, `r numeric`, `p numeric`, `level`, `data_basis`, `contributions jsonb`, `flags jsonb`, `proposal jsonb`, `decision` (`accepted`/`declined`/`none`), `fit_feedback smallint NULL` (Antwort auf „Hat die Einschätzung heute gepasst?“), `config_version`, `created_at`, `updated_at`; für Verlauf, Einsichten und Auswertung des Freundes-Tests. `contributions` und `proposal` enthalten nur Codes, Zahlen und `cluster_key`, **nie Termintitel** |

**Wo gerechnet wird:** auf dem Gerät, im reinen TS-Modul `src/readinessCore/**` (keine Imports aus React, Node, Supabase, keine Uhr; `todayYmd` ist Eingabe). Der Server kann dasselbe Modul für den Coach-Kontext importieren (Variante A wie beim Plan-Kern).

**Datenschutz:**

- Check-in, Chips und Körpersignale sind **Gesundheitsdaten** (Art. 9 DSGVO, App-Store-Regel 5.1.3). Erhebung nur nach ausdrücklicher Zustimmung beim ersten Check-in („MyRace speichert deine Antworten in deinem Konto, um deine Tagesform zu berechnen. Sie werden nicht für Werbung genutzt und nicht verkauft. An den KI-Coach gehen sie nur, wenn du dem gesondert zugestimmt hast.“). Die Datenschutzerklärung und „Welche Daten MyRace nutzt“ (`src/features/settings/dataUsage.ts`) werden ergänzt. Rechtliche Prüfung durch Anton (Review-Punkt 15).
- **Kein Sprachmodell im Kern.** Der Coach bekommt Stufe, Gründe-Codes und den Vorschlag nur mit KI-Einwilligung; Kalendertitel und Cluster-Schlüssel nur, wenn die Einwilligung das ausdrücklich abdeckt. Sobald Stufe, Gründe, Flags oder Check-in-Werte an den Coach gehen (Plan Schritt 15), **muss** `AI_CONSENT_VERSION` erhöht und neu gefragt werden: Die bestehende Einwilligung wurde vor diesen Daten erteilt. Im MVP geht nichts davon an den Coach (Test in Plan Schritt 13).
- Apple-Health-Daten bleiben wie bisher: nur Lesen, nur mit Erlaubnis, keine Weitergabe (5.1.3).
- Datenexport und Konto-Löschung umfassen die neuen Tabellen.
- `display_title` in `event_load_labels` ist ein Kalendertitel und damit personenbezogen; er liegt wie die Titel in `weekly_schedule_blocks` nur in der eigenen, per RLS geschützten Zeile.

## 16. Invarianten (= Testsuite)

| ID | Invariante | Schwere |
|---|---|---|
| R1 | Determinismus: gleiche Eingaben (inkl. `todayYmd`, Config-Version) → identische Ausgabe (Snapshot) | error |
| R2 | Reinheit: `src/readinessCore` importiert nichts außerhalb des Ordners außer `src/planCore` (Typen, `isHardSession`, Datumshelfer); kein `Date.now`/`new Date()`, kein Netzwerk, kein Sprachmodell | error |
| R3 | Kein Vorschlag erhöht Belastung: Wochen-km, Qualitäts-km, Zahl der Q und Dauer jeder einzelnen Einheit sind nach dem Vorschlag ≤ vorher; keine Einheit wird in eine härtere Art umgewandelt (Rangfolge in der Config: Ruhe < REC < E < MLR < LR < M < T < I = R < Rennen) | error |
| R4 | Jeder Vorschlag besteht die Änderungs-Prüfung aus §8.1 Nr. 2 (I6, I7, I8, I15, I16-Tage: kein neuer Verstoß an den betroffenen Tagen und Nachbarn); neue Warnungen werden im Vorschlag genannt. Fällt ein Vorschlag durch, hat der nachrückende nie mehr Belastung. Vorschläge aus §9 werden nie unterdrückt | error |
| R5 | Der Kern gibt nur Vorschläge zurück; keine Funktion des Kerns schreibt in Plan, Patches oder Speicher | error |
| R6 | Ist ein Krankheits- oder Schmerzflag aktiv, folgt die Handlung der Tabelle in §9 (nichts anderes), die Stufe ist nicht `above`, und an keinem Tag mit Flag steht nach dem Vorschlag eine harte Einheit | error |
| R7 | Ein planändernder Vorschlag aus §8.3 setzt „zwei Signale“ nach der Definition dort voraus oder Stufe `low`; aus §8.3a Tageseignung „ungeeignet“. HRV allein ist nie ein Signal und löst nie einen planändernden Vorschlag aus, auch nicht über mehrere Tage und ohne Check-in. Der HRV-Anteil in Block B liegt in [−1, 0] | error |
| R8 | Fehlende Daten zählen nie negativ: Ohne Blöcke gilt \|R\| ≤ φ × \|R_gestern\| + β_L × Lastdruck + β_S × Lebensdruck, und P steigt | error |
| R9 | Monotonie: Wird der **heutige** Wert eines einzelnen Markers schlechter (bei sonst gleichen Eingaben und gleicher Vorgeschichte), steigt R nicht | error |
| R10 | Kein Nachholen: Nach jedem Vorschlag hat keine Kalenderwoche mehr Q als I7 erlaubt, liegen zwei Long Runs ≥ 6 Tage auseinander, bleibt jeder Long Run in seiner Kalenderwoche, ist keine Einheit länger als vor dem Vorschlag, und es gibt keine zusätzliche Einheit | error |
| R11 | Bei Datenbasis „niedrig“ oder „keine“ gibt es keinen planändernden Vorschlag aus der Stufe (§8.3) und keine Stufe schlechter als `below`; Kalender-Vorschläge (§8.3a, §8.4) und Sicherheitsstufen bleiben. In der Kennenlernphase (§4.7) gibt es aus der Stufe nur H0 und H2 | error |
| R12 | Baselines schließen den bewerteten Tag und Tage mit Krankheitsflag aus | error |
| R13 | Schlafphasen, Fragmentierung, Aktivenergie, Atemfrequenz und Temperatur stehen nicht im Eingabetyp der Blockrechnung (Typ-Test) | error |
| R14 | Der HRV-Beitrag zu Block B ist ≤ 0 | error |
| R15 | Schlafbezogene Lebensdruck-Punkte sind 0, sobald für die Nacht Schlafdauer oder Schlaf-Antwort vorliegt | error |
| R16 | Taper: kein Vorschlag verringert den Abstand einer harten Einheit zum Rennen (also kein H2 aus der Stufe); kein „Diese Woche ruhiger“ in Taper- und Rennwoche. Rennwoche: nur Vorschläge aus §9. Das Rennen ist nie Quelle oder Ziel eines Vorschlags | error |
| R17 | Texte: Kein Textbaustein enthält ein Wort der Sperrliste. Die Liste steht vollständig in der Config (`texts.blocklist`); Startbestand: „Diagnose“, „Übertraining“, „übertrainiert“, „du bist krank“, „du wirst krank“, „Infekt“, „validiert“, „solltest“, „musst“ (Antwortoptionen des Check-ins sind keine Textbausteine im Sinn dieser Regel); jeder Sicherheitstext endet mit dem Hinweis aus §9 | error |
| R18 | Ohne KI-Einwilligung enthält kein Payload an `/api/ai` Kalendertitel, Cluster-Schlüssel, Check-in-Werte oder Flags | error |
| R19 | Termine ohne Etikett mit Herkunft `user` tragen zu Lebensdruck und Tageseignung nur über die Merkmale aus §7.2 bei | error |
| R20 | Eine Einsicht wird nur ausgegeben, wenn die Bedingungen 1, 4 und 5 aus §11 erfüllt sind; ihr Text enthält „bisher“ und „Zusammenhang, kein Beweis“ | error |
| R21 | Erklärbarkeit: Die Summe der Beiträge ist R (±0,01); jeder Vorschlag trägt mindestens einen Grund-Code und den Code der angewandten Regel | error |
| R22 | Hysterese: Ein Stufenwechsel gegenüber dem Vortag erfolgt nur bei Überschreiten der Grenze um ≥ 0,1 | error |
| R23 | Jeder Eintrag in `src/readinessCore/config.ts` hat Herkunft (L/P/E) und Spec-Abschnitt; Config-Snapshot. (Dass keine Zahl außerhalb der Config steht, prüft das Code-Review, kein Test) | error |
| R24 | Kalendertage kommen aus `todayYmd` und `dateIso` (`sessionYmd`), nie aus Label + Jahr | error |
| R25 | Je Kalenderwoche werden höchstens zwei Wochenvorschläge erzeugt (Wochenvorschau und „Diese Woche ruhiger“ zusammen gezählt) | error |
| R26 | R liegt immer in [−3, +3]; jede Formel ist für jede Datenstufe definiert (keine Division durch null, kein undefinierter Marker) | error |

Zusätzlich Property-Tests über zufällige gültige Eingaben (Seed im Testnamen): alle Invarianten halten für 2 000 simulierte Nutzer-Tage je Datenstufe a–d.

## 17. Referenzszenarien (Abnahmekriterien)

Alle Zahlen sind mit den Startparametern aus §4 gerechnet (eingeschwungener Zustand, R_gestern = 0, sofern nicht anders angegeben). Blockwerte sind als z angegeben; der Umsetzungsplan macht aus jedem Szenario eine Fixture mit Rohwerten.

| # | Szenario | Eingaben | Erwartete Ausgabe |
|---|---|---|---|
| **S1** | **Prüfungswoche** (Studentin, 5 Lauftage, Uhr) | Etiketten: „Klausur Statistik“ Do, „Abgabe Hausarbeit“ Fr (beide Prüfung/Abgabe). Plan: Di I (Q1), Do T (Q2), So LR. Werte normal | Wochenvorschau am Sonntag: Do und Fr „ungeeignet“, Mi „eingeschränkt“ (Vortag). T am Do findet keinen zulässigen Tag (Mi neben Di hart; Fr ungeeignet; Sa neben So LR) → **Q2 wird E + Strides** (zugleich Regel „Prüfungsphase“). Q1 und LR bleiben. Text nennt beide Termine. Keine Stufe nötig |
| **S2** | **Zwei Spätschichten** (Anton, 6 Lauftage, Uhr) | „Schicht Augustiner“ Mi und Fr 17:00–00:30, Etikett Arbeit (körperlich)/fordernd. Do Vorlesung 8:15. Plan: Di I, Do T, Sa E, So LR | Schlafgelegenheit Mi → Do = 01:30 bis 07:15 = 5:45 h → Do „ungeeignet“. Vorschlag: **T von Do auf Fr (Vormittag)**, Do bekommt den lockeren Lauf vom Fr. Prüfung: Di hart, Fr hart, So LR → I6 erfüllt. Sa „eingeschränkt“ (Tag nach Schicht), dort liegt nur E → bleibt. Am Do-Morgen mit gemessenen 5:40 h Schlaf: Lebensdruck-Punkte für Schlaf entfallen (R15), Schicht zählt 1 Punkt |
| **S3** | **Schlechte Nacht vor Intervallen** | A = −0,3 · B = 0 · C = −1,4 (5:40 h statt 7:30 h) | R = −0,44 → `normal` („eher“-Formulierung wegen Grenznähe). Ein Signal → **H0** mit Hinweis „wenn möglich früher am Tag; nach dem Einlaufen entscheiden“. Keine Planänderung |
| **S4** | **Krankheitsbeginn** | Streuung der Schlaf-HF 2,5 Schläge (Schwelle „deutlich“ also +5). Nacht 1 und 2: Schlaf-HF +6, Nacht 2: Atemfrequenz +1,2. Tag 2: Antwort „Etwas angeschlagen“ → nur Hals/Nase. Tag 3: Chip „Fieber, Gliederschmerzen“ | Tag 2: Hinweis „Deine Werte weichen ab“ (Regel A), Frage statt Aussage; nach Antwort: harte Einheit → H3, locker ≤ 30 min, Text „Erfahrungsregel“. Tag 3: **H4 Pause**, keine Stufe, keine Trainingsvorschläge. Erster Lauftag ohne Chip: Testlauf 10–20 min anstelle der geplanten Einheit, zwei weitere lockere Tage. Tage 2–n zählen nicht in die Baseline |
| **S5** | **Läufer ohne Uhr**, zwei mäßige Tage | Tag 1: A = −1,0 · C (nur Antwort, r = 1,5) = −1,2. Tag 2: A = −1,2 · C = −1,2. Heute (Tag 2) Tempolauf | Tag 1: R = −0,72 → `below`, zwei Signale → nach der Kennenlernphase Vorschlag **H2**, ohne zulässigen Tag **H1** (kein H3: alle Signale stammen aus dem Check-in und die Stufe ist nicht zweimal `low`). Tag 2: R = −0,97 → `below`, gleiche Regel. Datenbasis „mittel“. Text enthält „Körpersignale sehe ich ohne Uhr nicht“ |
| **S6** | **Kaltstart, allererster Check-in** | Check-in 4/3/3/3 (Schlaf gut, Rest normal), keine Baseline, P₀ = 1 | A = 0, C = +1,0 → R = +0,29 → `normal`. Datenbasis „mittel“, Zusatz „Ich lerne dich noch kennen“. Objektive Marker werden gesammelt, aber nicht bewertet. (Am dritten Tag mit zwei gleichen Vortagen: P ≈ 0,40, R = +0,27, gleiche Stufe) |
| **S7** | **Taper mit Stress** (Marathon in 9 Tagen) | Zwei Tage A = −1,3 · B = −0,6 · C = −1,0, Lebensdruck 1. Heute M-Pace-Einheit (einziges Q der Taper-Woche) | R = −0,79, dann −0,92 → `below`, zwei Signale. Verschieben ist im Taper aus der Stufe nicht erlaubt (R16: nichts rückt näher ans Rennen) → **H1: M-Block −25 %**. Zusatzsatz zur Gelassenheit im Taper |
| **S8** | **Sehr gute Werte** | Zwei Tage A = +1,2/+1,5 · B = +0,6/+0,9 · C = 0 | R = +0,46 (`normal`, „eher über“), dann +0,69 → `above`. **H0, keine Erhöhung**, Text „Der Plan passt“ |
| **S9** | **Keine Eingaben** | R_gestern = −1,0, vier Tage kein Block | R: −0,70 · −0,49 · −0,34, P wächst auf 1,1 · 1,6 · 1,8. Tag 1–3: Datenbasis „niedrig“, kein planändernder Vorschlag. Ab Tag 4: „Keine Einschätzung heute“ |
| **S10** | **Vier schlechte Tage** | Täglich A = −1,0 · B = −0,8 · C = −0,6, Lastdruck 1 | R: −0,69 · −0,80 · −0,81 · −0,82 → viermal `below`. Tag 1–2: Vorschläge nach §8.3. **Tag 3: „Diese Woche ruhiger“** (Q2 → E, offenes Q1 −25 %, lockere Einheiten −20 %, LR −25 %) |
| **S11** | **HRV allein tief** | A = 0 · C = 0 · HRV z = −2,5, keine Herzfrequenz → B = −1,0 (Deckel), r = 2 | R = −0,15 → `normal`. Grund „HRV diese Woche unter deinem üblichen Bereich“ wird gezeigt, **keine Planänderung** (R7) |
| **S11b** | **HRV tief, kein Check-in**, mehrere Tage | täglich nur B = −1,0 (HRV, r = 2), sonst nichts | R: −0,41 · −0,58 · −0,65 → ab Tag 3 `below` (Hysterese). An allen Tagen **H0 mit Hinweis**, keine Planänderung: HRV allein ist kein Signal (R7). Text bittet um den Check-in |
| **S13** | **Kaltstart mit niedrigen Antworten** | Tage 1–3 ohne Uhr: Check-in 2/2/2/2 | R: −0,71 · −0,83 · −0,86 → `below`. Kennenlernphase: nur H0-Hinweis bzw. H2, **kein** H3, **kein** „Diese Woche ruhiger“, kein §9.4. Zusatz „Ich lerne dich noch kennen“. Mit jedem Tag wandert die eigene Lage weiter von 3 zu 2, die z-Werte gehen gegen 0 |
| **S12** | **Schmerz** | Chip „Etwas zwickt“: Achillessehne, 5/10, „laufe anders“: nein. Heute Long Run | **H4** für heute (kein Lauf), Vorsichtsregel benannt; morgen Chip vorausgewählt. Nach 3 Tagen ≥ 4/10: Empfehlung zur Abklärung. Stufe wird nicht gezeigt |

Wireframe-Beispiel aus §10.1 zur Kontrolle: A = −1,1 · B = −1,6 · C = −1,5, Lebensdruck 1 (Schicht) → R = −1,13 → `below`, Beiträge: Erwartung −0,05 · Befinden −0,28 · Körpersignale −0,41 · Schlaf −0,39.

## 18. Annahmen und Entscheidungen (zum gezielten Widersprechen)

| # | Entscheidung | Begründung | Alternative |
|---|---|---|---|
| A1 | **Keine Zahl auf der Hauptkarte**, vier Stufen + Skala ohne Ziffern; Index 0–100 nur in Details | Scheingenauigkeit, Score-Angst, Abgrenzung von Whoop/Garmin | Variante C (Zahl im Ring) – weicht von Antons Beispiel „Readiness 54“ ab, deshalb hier ganz oben |
| A2 | **Vorschlag statt Automatik ohne Ausnahme** im MVP | unvalidiertes Maß, Vertrauen | Einstellung „kleine Kürzungen automatisch“ nach dem Freundes-Test |
| A3 | **Nie Belastung erhöhen**, auch nicht bei `above` | Auftrag §3.6; kein übertragbarer Beleg | +5 % wie Nuuttila 2022, frühestens mit rMSSD-Nachtmessung |
| A4 | **Neue Standardfrage nach der Einheit** (RPE 0–10, überspringbar) zusätzlich zum Gefühl 1–5 | Lastmaß ohne Uhr; Gefühl ist kein RPE | nur Gefühl behalten → Last bleibt grob |
| A5 | **Vier Morgenfragen**, nicht zwei oder fünf | je eine für Schlaf, Last-Reaktion (Energie, Beine) und Leben (Kopf) | zwei Fragen (Energie, Kopf) – kürzer, aber Beine ist das zuverlässigste Item |
| A6 | **Kein Streak** | belegt demotivierend bei Abriss | Wochenleiste (gewählt) |
| A7 | **Kalender wirkt über Schlaf/Zeitfenster und bestätigte Etiketten**, nicht über Stress-Punkte je Termin | keine Evidenz für Punkte | Antons ursprüngliche Idee (Belastungswert je Termin, gelernt) – bleibt als „Einsicht“ erhalten, aber ohne direkte Planwirkung |
| A8 | **Stichwörter wirken nicht mehr still**, nur als Vorschlag in der Rückfrage | „Sprint Prüfung“-Fall; falsche stille Treffer (Schachturnier) | stille Wirkung mit Korrekturmöglichkeit (Stand `feat/event-load-semantics`) |
| A9 | **Bestehende Recovery-Pipeline wird ersetzt, nicht repariert**; Rohdaten-Aggregation bleibt | Zahlen ohne Herkunft, unerklärbare Glättung | schrittweise Reparatur – teurer und nie belegbar |
| A10 | **Die drei alten Kalender-Branches werden nicht gemergt**, Teile portiert | Basis vor dem Plan-Kern, widersprüchliche Belastungsklasse | mergen mit Konfliktlösung |
| A11 | **HRV mit Totband 1,0 und Verlässlichkeit r = 2**, Schlaf-HF gleichwertig | Apple-SDNN-Messfehler | HRV ganz weglassen, bis rMSSD verfügbar ist |
| A12 | **Q = 1,0** (Befinden kann Erwartung überstimmen) statt 0,5 | Nutzer ohne Uhr | 0,5 – trägerer Wert |
| A13 | **Grenze `low` bei −1,25** | nur bei mehreren deutlichen Signalen erreichbar | −1,5 (strenger) oder −1,0 |
| A14 | **Verschieben bis +3 Tage, über die Wochengrenze nur ohne Mehrbelastung der Zielwoche; Long Run bleibt in seiner Woche** | sonst wird zu oft gestrichen | nur innerhalb der Woche (Stand heute) |
| A15 | **Prüfungsphase streicht Q2**, kürzt nicht pauschal den Umfang | weniger willkürlich als „−10–20 %“ | Umfang −15 % |
| A16 | **Rennwoche ohne planändernde Vorschläge** | eine schlechte Nacht kostet kaum; Verunsicherung vermeiden | Vorschläge wie im Taper |
| A17 | **Rechnen auf dem Gerät**, Verlauf in `readiness_daily` | Datenschutz, offline, wie Plan-Kern | Server-Rechnung |
| A18 | **Name in der App: „Tagesform“**, nicht „Readiness“ oder „Recovery“ | deutsch, kein Fachwort, kein Score-Klang | „Belastbarkeit“, „Readiness“ |
| A19 | **„Woche für Woche planen“ wird nicht gebaut**; Readiness passt laufende und nächste Woche an | ein Generator, kein zweiter | eigener Wochen-Generator später |
| A20 | **Schmerzgrenze 4/10** | zwischen Praxisregel 3/10 und Silbernagel 5/10 | 3 oder 5 |
| A21 | **Kein eigener Abzug für „Kopfarbeit“/Termindichte** über die Merkmale hinaus | mentale Ermüdung: Effekt nach Bias-Korrektur ≈ 0 | Punkte für lange Lerntage |
| A22 | **Kennenlernphase 14 Tage:** aus der Stufe nur Hinweise und Verschieben | wer gewohnheitsmäßig tief antwortet, bekäme sonst zwei Wochen lang Kürzungen | 7 Tage, oder gar keine Schonfrist |
| A23 | **Nur aus dem Check-in wird nicht gestrichen**, außer bei „deutlich unter Normal“ an zwei Tagen in Folge | Ehrlichkeit schützen; ohne Uhr stammen alle Signale aus derselben Quelle | Check-in zählt wie zwei unabhängige Signale (mehr Streichungen ohne Uhr) |
| A24 | **HRV-Anteil gedeckelt auf −1,0 und allein nie ein Signal** | Apple-SDNN ist die ungenaueste Messung | volle Wirkung bis −3 |
| A25 | **Vorschläge werden an der Änderung geprüft, nicht am ganzen Plan**; Mindest- und Verlaufsregeln des Plan-Kerns (I3–I5, I10, I13, Zahl der Lauftage) gelten für Kürzungen nicht | sonst würde der Plan-Prüfer Pausen und Kürzungen blockieren | Folgewochen nach einer Kürzung automatisch mitsenken (Review-Punkt 13) |

## 19. Offene Punkte fürs Spoho-Review

1. **Blockbildung und gleiche Gewichte** (§4.3–4.6): Befinden, Körpersignale, Schlaf je ein Block mit gleicher Verlässlichkeit. Vertretbar, oder soll das Befinden mehr zählen (Saw 2016)?
2. **Stufengrenzen** ±0,5 und −1,25 (§4.7) sowie die Bedingung „zwei Signale“ (§8.3).
3. **HRV aus Apple-SDNN** (§4.3): Nacht-Median, mind. 3 Werte, Totband 1,0, nie positiv. Ganz weglassen, bis rMSSD verfügbar ist?
4. **Herzfrequenz:** 3-Tage-Mittel gegen 28-Tage-Median, Mindest-Streuung 2 Schläge.
5. **Schlaf** (§4.4): einseitige Wertung, Untergrenzen 6 h (eine Nacht → −1; drei Nächte → −2), Gewichtung letzte Nacht zu 3-Nächte-Mittel 50/50.
6. **Anstrengungsskala 0–10:** deutsche Anker (§6.2). Gibt es eine an der DSHS gebräuchliche Fassung?
7. **Check-in-Items** (§6.1): Auswahl und Wortlaut; ist „Kopf“ als Sammel-Item für Stress und Stimmung brauchbar? Das Set ist als Ganzes nicht validiert.
8. **Fallback-Lastgewichte** (§5): E 2 · LR 3 · M 4 · T 6 · I/R 8 und Zeitkonstanten 7/42.
9. **Krankheitsregel** (§9.1): Schwellen und Zwei-Nächte-Bedingung, abgeleitet aus COVID-Daten. Fehlalarmziel ≤ 1 pro Monat.
10. **Schmerzregel** (§9.3): 4/10 oder verändertes Laufbild → kein Lauf.
11. **Rückkehr nach Infekt** (§9.2): Testlauf, zwei lockere Tage, dann Qualität. Ist eine harte Einheit ab Tag 4 nach Fieber oder Brust-Symptomen zu früh?
12. **Handlungsstufen** (§8.2): −25 % als „leichter“; Rangfolge Q2 streichen vor Q1 verkleinern vor Long Run verkleinern.
13. **„Diese Woche ruhiger“** (§8.4): Auslöser 3 Tage `below`; Rest −20 %, LR −25 %. Dazu: Wie soll es **nach** einer gekürzten oder pausierten Woche weitergehen? Heute bleiben die Folgewochen unverändert; die Steigerungsgrenze des Plan-Kerns (I3, ≤ 30 % über zwei Wochen) rechnet mit geplanten, nicht mit gelaufenen km.
14. **Kalender-Schwellen** (§7.2–7.5): Schlafgelegenheit < 6 h / 6–7 h mit je 60 min Puffer; gebundene Stunden > 10 h; Tag nach körperlicher Schicht „eingeschränkt“; Prüfungstag „ungeeignet“, Vortag „eingeschränkt“.
15. **Recht** (kein Spoho-Thema, aber vor Release): Einwilligung für Gesundheitsdaten im Check-in, Datenschutzerklärung, Abgrenzung zum Medizinprodukt (MDR) für die Krankheits- und Schmerzlogik.
16. **Taper und Rennwoche** (§8.7): keine Vorschläge in der Rennwoche, nur Reduktion im Taper.
17. **Einsichten** (§11): 10/10 Tage, 90-%-Intervall, Benjamini-Hochberg 10 % – streng genug für Aussagen gegenüber Laien?
18. **Frauen:** Zykluseffekte auf Temperatur (0,3 °C), HRV und Ruhepuls sind nur über das 28-Tage-Fenster abgefedert. Reicht das, oder braucht es ein freiwilliges Zyklus-Etikett?
20. **Schutzregeln aus der Prüfung** (v0.2): Kennenlernphase 14 Tage (§4.7), HRV-Deckel −1,0 (§4.3), „nur aus dem Check-in wird nicht gestrichen“ (§8.3), Lastdruck höchstens 1 in den ersten 14 Tagen (§5). Zu vorsichtig oder passend?
19. **Validierungsplan** (§13): Welche Auswertung des Freundes-Tests würde die DSHS als ersten Beleg akzeptieren? Wäre eine begleitende Bachelorarbeit möglich?

**Gerätepunkte (vor Umsetzungsschritt 4 klären, iPhone 13 + Antons Uhr):** (1) Wie viele SDNN-Werte fallen pro Nacht an? (2) Liefert `@capgo/capacitor-health` Herzfrequenz-Samples im Schlaffenster, Schlag-zu-Schlag-Serien, `appleSleepingWristTemperature`, `workoutEffortScore`? (3) Liefert eine Series 12 Nacht-rMSSD über HealthKit?

## Quellen

Vollständige Quellenlisten mit Evidenzbewertung stehen je Strang in `docs/readiness-research.md` (Teile B1–B7). Die für die Regeln dieser Spec tragenden Arbeiten:

- Alavi A. et al. (2022). Real-time alerting system for COVID-19 and other stress events using wearable data. *Nat Med*. (Krankheitsregel)
- Buchheit M. (2014). Monitoring training status with HR measures: do all roads lead to Rome? *Front Physiol* 5:73. (Mittelung, Streuung)
- Clarsen B. et al. (2020). Improved reporting of overuse injuries and health problems in sport: OSTRC questionnaires update. *Br J Sports Med*. (Gesundheits-Chips)
- Craven J. et al. (2022). Effects of acute sleep loss on physical performance. *Sports Med*. (Schlaf)
- Dawes R. M. (1979). The robust beauty of improper linear models in decision making. *Am Psychol*. (gleiche Gewichte)
- Doherty C. et al. (2025). Readiness, recovery, and strain: an evaluation of composite health scores in consumer wearables. *Transl Exerc Biomed* 2(2):128–144. (Kritik an Scores)
- Foster C. et al. (2001). A new approach to monitoring exercise training. *J Strength Cond Res*. (Session-RPE)
- Schuster Brandt Frandsen J. et al. (2025; Letztautor Nielsen). How much running is too much? *Br J Sports Med*. (Einzellauf-Spitze)
- Le Meur Y. et al. (2013). Evidence of parasympathetic hyperactivity in functionally overreached athletes. *Med Sci Sports Exerc*. (HRV über dem Band)
- Manresa-Rocamora A. et al. (2021). Heart rate variability-guided training … systematic review and meta-analysis. *Int J Environ Res Public Health*. (HRV-Steuerung)
- Nuuttila O.-P. et al. (2022). Individualized endurance training based on recovery and training status in recreational runners. *Med Sci Sports Exerc*. (multimodale Entscheidung, −25 %, zweimal pro Woche)
- O'Grady B. et al. (2024). The validity of Apple Watch Series 9 and Ultra 2 for serial measurements of HRV and resting heart rate. *Sensors*. (Messfehler)
- Quer G. et al. (2020, 2021). *PLoS One*; *Nat Med*. (Ruhepuls-Streuung; Sensoren + Symptome)
- Ryan S. et al. (2019). Measurement characteristics of athlete monitoring tools in professional Australian football. *Int J Sports Physiol Perform*. (Zuverlässigkeit der Items)
- Saw A. E., Main L. C., Gastin P. B. (2016). Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures. *Br J Sports Med*. (Befinden)
- Schwellnus M. et al. (2022). IOC consensus statement on acute respiratory illness in athletes. *Br J Sports Med*. (Rückkehr nach Infekt)
- Silverman J., Barasch A. (2023). On or off track: how (broken) streaks affect consumer decisions. *J Consum Res*. (Streaks)
- Vedaa Ø. et al. (2015). Systematic review of the relationship between quick returns in rotating shift work and health-related outcomes. *Ergonomics*. (Ruhezeit)
- Vesterinen V. et al. (2016). Individual endurance training prescription with heart rate variability. *Med Sci Sports Exerc*. (Baseline, Band)

Bibliografische Details (Band, Seiten, DOI) und der Prüfstatus jeder Quelle stehen im Recherchebericht; mehrere sind dort als „nur Abstract“ oder „nicht verifiziert“ markiert.
