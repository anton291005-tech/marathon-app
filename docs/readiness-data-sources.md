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

1. Welche Apple Watch trägt Anton (Series 8+ → Handgelenktemperatur)? → **Apple Watch Ultra (1. Generation, `Watch6,18`)**, Handgelenktemperatur kommt an (§5).
2. Schreibt seine Uhr unter watchOS 27 schon `heartRateVariabilityRMSSD`, oder nur Series 12 / Ultra 4? → **Nein.** Der Typ existiert unter iOS 27.2 und wurde angefragt, aber in 7 Tagen kam kein Wert (§5).
3. Wie viele SDNN-Werte pro Nacht kommen an (Schritt 0, Teil 1)? → **Rund 6 SDNN-Werte pro Kalendertag** (über den ganzen Tag, nicht nur nachts). Wie viele davon im Schlaffenster liegen, zeigt die Diagnose noch nicht (§5, offen).

## 5. Gerätebefund Ultra (13.11.2026)

iPhone 13 mit iOS 27.2, Apple Watch Ultra 1 (`Watch6,18`, Quelle „Apple Watch von Anton“). Zwei Runden mit dem Diagnose-Panel (Einstellungen → Datenschutz & Daten → „Uhr-Signale prüfen“, nur mit Flag). Werte: letzte 7 Tage (07.–13.11.), Trainings: 14 Tage.

**Vorweg – Runde 1 war verfälscht:** SDNN und SpO2 meldeten „Authorization not determined“. Ursache: Die Anfrage des bestehenden Plugins scheiterte komplett am unbekannten Typnamen `activeEnergyBurned` (seit Juni, auch in Production). Behoben auf `fix/apple-health-read-types`; Runde 2 unten ist nach dem Fix. Alle 18 abgefragten Typen stehen jetzt auf „angefragt“. Ob iOS Lesen erlaubt oder verweigert hat, verrät HealthKit nicht; „0 Werte“ heißt deshalb „keine Daten oder verweigert“ – Anton hat im Dialog alle Typen eingeschaltet.

| Signal | Ergebnis (7 Tage) | Bedeutung |
|---|---|---|
| **Gerät** | Apple Watch Ultra (1. Gen), `Watch6,18` | – |
| **HRV RMSSD** (`heartRateVariabilityRMSSD`) | Typ vorhanden (iOS 27.2), **0 Werte** | Ultra 1 schreibt kein RMSSD (passt zu „sicher Series 12 / Ultra 4“) |
| **HRV SDNN** | **40 Werte, 6 je Tag** (11-07 bis 11-12 je 6, 11-13 bis 13:40 UTC: 4); über den Tag verteilt, z. B. 06:52, 12:34, 13:39 Ortszeit; Ausreißer 150,9 ms am frühen Morgen | Nachtwert nur aus den Werten im Schlaffenster – deren Zahl je Nacht ist noch nicht ausgewertet |
| **Handgelenktemperatur Schlaf** | **7 Werte, 1 je Nacht** (11-07: 2), **Absolutwert** 35,5–35,9 °C; Zeitstempel = Schlafbeginn (~23:05–23:45 Ortszeit) | Keine Abweichung: Grundlinie und Delta rechnet MyRace selbst. Tageszuordnung über den Aufwachtag (`endDate`), nicht über den Schlafbeginn – sonst landet der Wert auf dem Vorabend |
| **Blutsauerstoff SpO2** | 156 Werte, 16–27 je Tag; Wert als **Anteil 0–1** (0,95–0,98), nicht Prozent | Nutzung offen (Checkliste „vor Production nutzen oder entfernen“) |
| **VO2max** | 1 Wert (07.11., 57,7 mL/(kg·min)) | Kein Training an diesem Tag in HealthKit – der Wert entstand ohne gestartetes Workout |
| **Anstrengung je Training** | 1 Training in 14 Tagen (31.10., Laufen, 52 min, 10,04 km): **selbst = 6, geschätzt = 6**, beide über **`related`** gefunden | `predicateForWorkoutEffortSamplesRelated` funktioniert; der Zeitfenster-Rückfall wurde nicht gebraucht. In 7 Tagen 0 Effort-Werte, weil kein Training im Fenster lag |
| **Pulserholung 1 min** | 0 Werte | Nicht aussagekräftig: kein Training in den 7 Tagen (Pulserholung entsteht nach Workouts) |
| **Trainings** | bestehendes Plugin und HealthKit direkt: dasselbe eine Training | Kein Lesefehler; Runde-1-Frage „VO2max ohne Training“ geklärt |

**Offen für einen späteren Lauf** (nicht blockierend):
- SDNN-Werte **im Schlaffenster** je Nacht zählen (Diagnose um das Schlaffenster erweitern). Davon hängt die Mindestzahl für den Nachtwert in Schritt 4 ab (Plan: „< 3 Werte → kein Nachtwert“ – bei 6 Werten pro Tag ist fraglich, ob nachts 3 zusammenkommen).
- Pulserholung und Effort nach einem Training in den letzten 7 Tagen erneut prüfen.


## TODO: Vor Merge / Wiederaufnahme Schritt 3

Stand 13.11.2026, Branch `feat/health-native-signals`. Der Entwurf von Schritt 3 (Session-RPE aus der Uhr) liegt getrennt auf `wip/health-signals-step3` (3fb3e03) und ist nicht in diesem Branch.

- [ ] **Vollständiger Testlauf vor dem Merge:** `CI=true npm test` über das ganze Repo (bisher nur die berührten Ordner), dazu `CI=false npm run build`.
- [x] **Datenschutzerklärung ergänzen** (13.11.2026, `public/privacy-policy.html` §2, §3, §5, §6): alle neu gelesenen Typen mit Zweck, „nur lesen“, Speicherorten (`health_workouts`, `recovery_daily`, `session_logs.rpe`/`rpe_source`), Rechtsgrundlage Art. 9 Abs. 2 lit. a DSGVO und Widerruf. Info.plist-Text, Datenschutzerklärung und Datennutzungsseite nennen dieselben Typen (Test `healthTypesConsistency.test.ts`). **Offen:**
  - [ ] **Veröffentlichung:** Die Erklärung beschreibt Speicherungen (RMSSD, Handgelenktemperatur, `rpe_source`), die erst mit Schritt 3/4 und Migration 021 existieren. Nicht vor dem Feature-Flag auf Production bringen (`public/` wird mit `main` ausgeliefert).
  - [ ] **TODO-RECHT (im HTML als Kommentar markiert, ein Jurist soll prüfen), Stand nach Gesundheits-Zustimmung v2:** (1) reicht die In-App-Einwilligung v2 (Text, Server-Zeitstempel, Version, Wortlaut-Archiv `HEALTH_CONSENT_TEXTS`) als ausdrückliche Einwilligung und Nachweis nach Art. 7 Abs. 1 – früher Punkte 1 und 2; (2) Rechtsgrundlage für Trainings (Puls, Kalorien), die ohne diese Einwilligung gelesen werden; (3) Datenschutz-Folgenabschätzung Art. 35; (4) nur die iOS-Freigabe entzogen, ohne Widerruf in der App → keine automatische Löschung; (5) „angefragt, aber nicht gespeichert“ (SpO2, Pulserholung, VO2max) und Datenminimierung. Erledigt: Anstrengung an Anthropic steht im KI-Einwilligungstext (Version 2, alle neu gefragt, `6ff8191`).
- [ ] **Vor Production: SpO2, Pulserholung, VO2max** entweder in Schritt 4 nutzen oder aus dem HealthKit-Request entfernen (Apple 5.1.1: nur Daten anfragen, die die App tatsächlich braucht). Betrifft `APPLE_HEALTH_WATCH_SIGNAL_ONLY_TYPES`/`oxygenSaturation` in `appleHealthService.ts` und `HEALTH_SIGNAL_TYPES` in `healthSignalsPlugin.ts` samt Labels, Info.plist-Text, Datenschutzerklärung §6 und Datennutzungsseite.
- [x] **Gesundheits-Zustimmung v2** (13.11.2026, `821ff54`…): Text v2 mit Wortlaut-Archiv (`HEALTH_CONSENT_TEXTS`), Abfrage vor dem Apple-Dialog, vor der ersten gespeicherten Anstrengung und einmal pro Version beim Start; ohne Zustimmung kein Lesen der Erholungs-/Uhr-Typen und kein Speichern von Erholungswerten oder Anstrengung (Anstrengung wird verworfen, keine RPE-Abfrage mehr); Widerruf unter Datenschutz & Daten → Gesundheitsdaten mit Bestätigung. Alles hinter `isWatchSignalsEnabled()`. **Offen:**
  - [ ] **Migration 022 einspielen** (`supabase/migrations/022_health_consent_v2.sql`, nach 021; läuft auch ohne 021, `rpe_source` wird dann übersprungen). Prüf-Abfragen stehen am Dateiende. Ohne 022 meldet der Widerruf „auf dem Server noch nicht eingerichtet“ und löscht nichts; der Zeitstempel kommt bis dahin vom Gerät.
  - [ ] **Bekannte Grenze:** Mit Flag und ohne Zustimmung werden bereits gespeicherte `recovery_daily`-Zeilen (aus der Zeit vor v2) weiter geladen und angezeigt, nur nicht neu gelesen oder geschrieben. Erst ein Widerruf löscht sie.
- [ ] **Vor Production: Gesundheits-Zustimmung per RLS erzwingen.** Heute prüfen nur App und Services (`isHealthDataProcessingAllowed`) die Zustimmung v2. In der Datenbank sollen `daily_checkins`, `recovery_daily` und `session_logs.rpe`/`rpe_source` nur schreibbar sein, wenn `profiles.health_consent_version` aktuell gesetzt ist (Policy `WITH CHECK` bzw. Trigger); vorher prüfen, welche bestehenden Schreibwege (Migration lokaler Daten, Health-Sync ohne Flag) dadurch brechen.
- [ ] **Schritt 3 wieder aufnehmen:** `useWatchEffortRpe` (Entwurf auf dem WIP-Branch) hinter `isWatchSignalsEnabled()` legen, damit die RPE-Übernahme in Production nicht läuft; dazu Tests (Effort→RPE-Abbildung, manuelle RPE wird nie überschrieben, Rückschau „(Uhr)“/„(geschätzt)“), Migration `021_health_native_signals.sql` schreiben (Anton spielt sie ein) und erst nach dem Gerätebefund („Gerätebefund Ultra“) fortfahren.

## Quellen

- HealthKit-Typen: developer.apple.com/documentation/healthkit/hkquantitytypeidentifier, HealthKit-Updates (Effort Score, State of Mind)
- RMSSD in iOS 27: themomentum.ai (10.09.2026), blakecrosley.com „Five-Second Heart Rate“
- Readiness/Sleep Score ohne API: Apple Developer Forums (Thread 800403), fitmesh.fit, blakecrosley.com
- Vitals-App und Handgelenktemperatur: support.apple.com/120142
- Plugin-Typen: README `@capgo/capacitor-health` 8.7.0
