# Readiness – Datenquellen: was automatisch kommt, was gefragt werden muss

Stand 12.11.2026 (iOS 27 / watchOS 27). Ziel nach Antons Vorgabe: **möglichst alles automatisch**, selbst eingeben nur, was keine Uhr messen kann.

## 1. Was eine Apple Watch nach HealthKit schreibt und ob MyRace es heute lesen kann

Plugin: `@capgo/capacitor-health` 8.4.2 (installiert). „Plugin ✗“ heißt: HealthKit hat den Typ, das Plugin liest ihn nicht → eigener kleiner Swift-Teil nötig (§3, Baustein B).

| Signal | HealthKit-Typ | Uhr | Plugin | Nutzen für die Tagesform |
|---|---|---|---|---|
| Schlafdauer + Phasen (Kern, Tief, REM, wach) | `sleepAnalysis` | jede Watch mit Schlaf-Tracking, Phasen ab watchOS 9 | ✓ (`sleep`, mit `stages`) | Block C – **ersetzt die manuelle Schlafangabe** |
| Puls (auch nachts) | `heartRate` | alle | ✓ | Block B: Schlafpuls |
| Ruhepuls | `restingHeartRate` | alle | ✓ | Block B |
| HRV als SDNN | `heartRateVariabilitySDNN` | alle | ✓ | Block B (heute) |
| **HRV als RMSSD** | `heartRateVariabilityRMSSD` (neu in iOS 27) | unklar, welche Modelle schreiben; sicher Series 12 / Ultra 4 | ✗ | Block B: RMSSD ist das in der Literatur übliche Erholungsmaß – SDNN dann nur noch Rückfall |
| Atemfrequenz (nachts) | `respiratoryRate` | alle mit Schlaf-Tracking | ✓ | Krankheits-Frühzeichen |
| Handgelenktemperatur (nachts, Abweichung) | `appleSleepingWristTemperature` | ab Series 8 / alle Ultra | ✗ | Krankheits-Frühzeichen (zusammen mit Atemfrequenz und Puls) |
| Blutsauerstoff | `oxygenSaturation` | ab Series 6, nicht auf US-Modellen ab 2024 | ✓ (nicht angefragt) | gering; nur als Zusatzsignal |
| **Anstrengung je Training (1–10)** | `workoutEffortScore` (selbst bewertet) / `estimatedWorkoutEffortScore` (von der Uhr geschätzt), iOS 18 | watchOS 11+ | ✗ | **automatische Session-RPE** – die RPE-Nachfrage entfällt, wenn ein Wert da ist |
| Trainings mit Puls, Dauer, Distanz | `HKWorkout` | alle | ✓ | Last (RPE × Minuten), Abgleich mit Plan |
| Pulserholung 1 min | `heartRateRecoveryOneMinute` | alle (nach Workouts) | ✗ | Zusatzsignal Fitness/Ermüdung |
| VO2max | `vo2Max` | alle (bei Outdoor-Läufen) | ✗ auf iOS | Leistungsstand, eher für Prognose |
| Stimmung („Gemütszustand“) | `HKStateOfMind`, iOS 18 | wenn der Nutzer sie in Apple Health/Watch einträgt | ✗ | könnte die Kopf-Frage ersetzen – nutzen aber wenige |

**Nicht lesbar für fremde Apps:** Apples Schlafwert (watchOS 26), Apples „Readiness“-Wert (Series 12 / Ultra 4, watchOS 27) und die Vitals-Normbereiche. Es gibt dafür keinen HealthKit-Typ. MyRace muss die Tagesform also selbst aus den Rohwerten berechnen – das war ohnehin der Plan und ist der Unterschied zu Apple (Kalender, Plan, Befinden).

**Ohne Apple Watch:** Das iPhone allein liefert keinen Puls, keine HRV, keine Schlafphasen. Block B fällt weg, Schlaf nur, wenn eine andere App ihn nach Apple Health schreibt.

## 2. Was keine Uhr messen kann

Befinden (Energie, Beine, Kopf, subjektive Schlafqualität), Schmerz und Krankheitszeichen. Die Forschung (Saw et al. 2016, siehe `readiness-research.md`) zeigt, dass gerade diese subjektiven Angaben Belastung zuverlässiger anzeigen als die objektiven Marker. **Der Check-in bleibt deshalb** – aber so kurz wie möglich: vier Tipps, ein Tipp pro Frage.

Was wegfällt bzw. automatisch wird:

| Bisher manuell | Neu |
|---|---|
| Schlafdauer-Stepper im Check-in | **entfernt** (12.11.2026). Schlafdauer kommt nur noch von der Uhr; ohne Uhr zählt die Frage „Wie hast du geschlafen?“. Spalte `daily_checkins.sleep_hours_self` bleibt (alte Einträge), wird nicht mehr geschrieben |
| RPE-Frage nach jedem Training | entfällt, sobald die Uhr einen Anstrengungswert schreibt (Baustein C) |
| Check-in in der App öffnen | Option: Antwort direkt aus der Mitteilung (Baustein E) |

## 3. Bausteine (Vorschlag, Reihenfolge)

- **A – erledigt:** manuelle Schlafdauer raus.
- **B – Swift-Erweiterung zum Health-Plugin:** liest `heartRateVariabilityRMSSD`, `workoutEffortScore`/`estimatedWorkoutEffortScore`, `appleSleepingWristTemperature`, `heartRateRecoveryOneMinute`, `vo2Max`; dazu `oxygenSaturation` über das vorhandene Plugin anfragen. Neue Typen → neue HealthKit-Freigabe beim Nutzer, Datennutzungsseite und Datenschutzerklärung ergänzen. Test nur auf dem iPhone 13 mit Uhr (kein Simulator).
- **C – Automatische RPE:** Hat ein Training einen Anstrengungswert der Uhr, wird er als RPE übernommen (selbst bewertet vor geschätzt); die Nachfrage-Karte erscheint nur noch ohne Wert.
- **D – Spec-Änderung HRV:** RMSSD bevorzugen, SDNN nur als Rückfall; nie beide in einer Grundlinie mischen (Wechsel = neue Grundlinie). Betrifft Spec §4 Block B und `readinessCore/config.ts` (`hrvDeadbandRmssd`).
- **E – Check-in aus der Mitteilung:** Die 07:30-Erinnerung mit Aktionsknöpfen beantworten, ohne die App zu öffnen. Nur sinnvoll, wenn die vier Fragen dort bedienbar bleiben; erst nach dem Freundestest prüfen.
- **F – Hintergrund-Abgleich:** HealthKit-Daten auch ohne App-Start holen (Background Delivery). Größerer nativer Eingriff, nach TestFlight.

## 4. Offene Fragen (auf dem iPhone klären)

1. Welche Apple Watch trägt Anton (Series 8+ → Handgelenktemperatur)?
2. Schreibt seine Uhr unter watchOS 27 schon `heartRateVariabilityRMSSD`, oder nur Series 12 / Ultra 4?
3. Wie viele SDNN-Werte pro Nacht kommen an (Schritt 0, Teil 1)?

## TODO: Vor Merge / Wiederaufnahme Schritt 3

Stand 13.11.2026, Branch `feat/health-native-signals`. Der Entwurf von Schritt 3 (Session-RPE aus der Uhr) liegt getrennt auf `wip/health-signals-step3` (3fb3e03) und ist nicht in diesem Branch.

- [ ] **Vollständiger Testlauf vor dem Merge:** `CI=true npm test` über das ganze Repo (bisher nur die berührten Ordner), dazu `CI=false npm run build`.
- [ ] **Datenschutzerklärung ergänzen:** muss HRV (SDNN und RMSSD), Handgelenktemperatur, Anstrengung (Effort Score) und Blutsauerstoff (SpO2) nennen – Pulserholung und VO2max ebenfalls, sie werden mit angefragt. Vor dem Merge, weil die Datennutzungsseite sie ohne Flag nicht mehr listet, sobald das Flag in Production aufgeht.
- [ ] **Schritt 3 wieder aufnehmen:** `useWatchEffortRpe` (Entwurf auf dem WIP-Branch) hinter `isWatchSignalsEnabled()` legen, damit die RPE-Übernahme in Production nicht läuft; dazu Tests (Effort→RPE-Abbildung, manuelle RPE wird nie überschrieben, Rückschau „(Uhr)“/„(geschätzt)“), Migration `021_health_native_signals.sql` schreiben (Anton spielt sie ein) und erst nach dem Gerätebefund („Gerätebefund Ultra“) fortfahren.

## Quellen

- HealthKit-Typen: developer.apple.com/documentation/healthkit/hkquantitytypeidentifier, HealthKit-Updates (Effort Score, State of Mind)
- RMSSD in iOS 27: themomentum.ai (10.09.2026), blakecrosley.com „Five-Second Heart Rate“
- Readiness/Sleep Score ohne API: Apple Developer Forums (Thread 800403), fitmesh.fit, blakecrosley.com
- Vitals-App und Handgelenktemperatur: support.apple.com/120142
- Plugin-Typen: README `@capgo/capacitor-health` 8.7.0
