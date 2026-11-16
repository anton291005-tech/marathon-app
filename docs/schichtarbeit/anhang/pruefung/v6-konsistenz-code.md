# V6 – Prüfung Code-Aussagen, Konsistenz und Auftragstreue

> Stand: 16.11.2026. Geprüft: `docs/schichtarbeit/research.md`, `entscheidung.md`, `ideathlon-entwurf.md` (Branch `docs/schichtarbeit-research`, Code identisch mit `main` @ `78109aa`; der Branch fügt nur Dokumente hinzu).
> Methode: alle drei Dokumente vollständig gelesen; jede Code-Aussage aus `entscheidung.md` §1 per Read/Grep geprüft; `computeDayCapacityScore`/`computeSessionDayFitScore` und `classifyEventCategory` zusätzlich mit Beispielwerten ausgeführt (Skript außerhalb des Repos, nichts im Repo geändert, `git status` sauber).
> Grenzen: keine Websuche. Paragrafen sind auf innere Stimmigkeit und gegen mein Vorwissen geprüft, nicht gegen den Gesetzestext. `node_modules` fehlt, deshalb sind Aussagen über die Android-Fähigkeit der Plugins nicht am Code prüfbar. Zusätzlich gelesen: Auftragstext und Kontaktliste aus dem Projekt (für Auftragstreue und Namen).

---

## Teil A: Code-Aussagen

### A.1 Tabelle §1.1 „Was sich direkt nutzen lässt“

| Nr. | Aussage in `entscheidung.md` | Urteil | Beleg (Datei:Zeile) | Korrekturvorschlag (Ersatztext) |
|---|---|---|---|---|
| 1 | Kalender-Import vom Gerät, `src/calendar/**` (EventKit, 28-Tage-Fenster) | **bestätigt** | `src/calendar/calendarImportService.ts:5` (EventKit über `@ebarooni/capacitor-calendar`), `src/calendar/calendarSyncService.ts:24-25` (`CALENDAR_IMPORT_WINDOW_DAYS = 28`) | – |
| 2 | „Schichtkalender-Apps wie Supershift exportieren in den Gerätekalender. Damit kommt der Dienstplan ohne Arbeitgeber-Schnittstelle in die App“ | **ungenau** | Der Import verwirft Ganztagstermine (`src/calendar/eventToScheduleBlocks.ts:54`) und alle abonnierten Kalender (`:23`, `:55`; `calendarImportService.ts:69`). Der Supershift-Export ist laut Anhang eine bezahlte Pro-Funktion (`anhang/b-wettbewerb.md:64`). Wie Supershift exportiert (Termine mit Uhrzeit oder Ganztag, eigener oder abonnierter Kalender) ist nirgends geprüft | „Schichtkalender-Apps wie Supershift können Schichten in den Gerätekalender schreiben (bei Supershift nur in der bezahlten Pro-Version). MyRace liest solche Termine, wenn sie eine Uhrzeit haben und nicht aus einem abonnierten Kalender stammen; Ganztagstermine (‚Früh‘, ‚N‘) und Kalender-Abos überspringt der Import heute. Ob der Export von Supershift dazu passt, ist nicht getestet.“ |
| 3 | Stand: „Code fertig, Gerätetest offen (Roadmap Schritt 4)“ | **bestätigt** | `docs/roadmap.md:43` („Code-seitig umgesetzt (2026-08-24), Device-E2E offen“). Hinweis: Laut einer Projektnotiz vom 7.10. (Quelle: gespeicherte Notizen, nicht das Repo) lief ein iPhone-Test eines Kalender-Testbranchs erfolgreich; die Roadmap ist dort nicht nachgezogen | – (ggf. Roadmap aktualisieren) |
| 4 | „‚Schicht‘ und ‚Dienst‘ werden schon als Arbeit erkannt“ | **ungenau** | `src/calendar/eventClassifier.ts:14` enthält `schicht`, `dienst`. Aber: Teilwort-Suche (`:22`) und feste Reihenfolge Studium → Ehrenamt → Sport → Job (`:10-15`). Ausgeführt: „Spätdienst Uniklinik“ → `study` (wegen „uni“), „Feuerwehr Wachdienst“ und „Dienst DRK Rettungswache“ → `volunteer`, „Nachtwache“, „Bereitschaft“, Kürzel „N“ → `other` | „Titel mit ‚Schicht‘ oder ‚Dienst‘ werden meist als Arbeit eingeordnet. Die Erkennung ist eine einfache Teilwort-Suche mit fester Reihenfolge: ‚Spätdienst Uniklinik‘ gilt als Studium, ‚Feuerwehr Wachdienst‘ als Ehrenamt, Kürzel wie ‚N‘ oder ‚Nachtwache‘ werden nicht erkannt.“ |
| 5 | Stand: „fertig, bisher ohne Wirkung auf die Planung“ | **bestätigt** | `eventClassifier.ts:5-6` („rein informativ“), `docs/roadmap.md:44`, `:56` | – |
| 6 | `assignSessionToBestCapacityDay.ts`, Wochen-Scan, Diff-Screen: „genau die Kernfunktion: Einheit auf einen passenden Tag legen, nie gegen die Trainingsregeln, nur nach Bestätigung“ | **ungenau, in der Wirkung irreführend** | Datei existiert und tauscht Tage (`src/ai/mutations/assignSessionToBestCapacityDay.ts:198-254`). Aber: (a) Ein Konflikt entsteht erst unter Fit 0,35 (`:55`, `:61-63`), also wenn mehr als 65 % des Tagesfensters belegt sind (`docs/readiness-spec.md:391` nennt das selbst „65-%-Regel“). Eine normale 8-Stunden-Schicht löst **nichts** aus: ausgeführt ergibt Früh 6–14 und Spät 14–22 je Kapazität 0,50 → kein Konflikt; erst ab rund 10,5 Stunden. Der Test hält das fest: `src/ai/mutations/scanWeekForCalendarConflicts.test.ts:151-153` („Titel Schicht oder Arbeit: … kein Konflikt (50 % belegt)“). (b) Lockere Einheiten reagieren fast gar nicht auf den Kalender (`src/scheduling/capacityScore.ts:166`, `:187-192`). (c) „nie gegen die Trainingsregeln“: hart ist nur die Strukturprüfung (`:242`); Verstöße gegen Erholungsabstände führen zu einer Warnung, nicht zur Ablehnung (`:108-114`, `:252`), und bei manueller Tageswahl darf der Nutzer sie übergehen (`:296-301`; `docs/roadmap.md:65`). (d) Getauscht wird nur innerhalb derselben Kalenderwoche, immer ganze Tage (`src/ai/mutations/buildCalendarReassignmentAction.ts:30-42`; `docs/readiness-plan.md:204`) | „Die Technik zum Tauschen ist da: Die App legt eine Einheit auf einen anderen Tag derselben Woche, prüft die Planstruktur hart, warnt bei zu kurzen Erholungsabständen und ändert nichts ohne Bestätigung. Die heutige Regel passt aber nicht zu Schichtarbeit: Ein Konflikt entsteht erst, wenn mehr als 65 % des Tages (rund 10,5 Stunden) belegt sind. Eine normale Früh- oder Spätschicht von 8 Stunden löst keinen Vorschlag aus, lockere Einheiten reagieren fast nie. Nutzbar ist die Mechanik, nicht die Regel.“ |
| 7 | Stand: „fertig bzw. UI in Arbeit“ | **bestätigt** | `docs/roadmap.md:32`, `:58` | – |
| 8 | Readiness-Spec §7: kurze Ruhezeit unter 11 Stunden, Schlafgelegenheit, körperliche Schicht ab 6 Stunden, Etiketten per Rückfrage, Grund `late_shift` | **bestätigt, eine Fundstelle ungenau** | `docs/readiness-spec.md:330` (Schlafgelegenheit), `:331` (< 11 h), `:370`, `:385-386` (körperliche Schicht ≥ 6 h), `:336-356` (Etiketten, Rückfrage). `late_shift` steht nicht in der Spec, sondern im Typ `ReasonCode` (`src/readinessCore/types.ts:133`). Inhaltlich wichtig: Die Regeln sind für gelegentliche Schichten gebaut (Beispiel S2, zwei Kellner-Schichten pro Woche, `readiness-spec.md:802`). Bei fünf Diensten in Folge wäre nach `:385-386` fast jeder Tag „ungeeignet“ oder „eingeschränkt“ für harte Einheiten; das Trainingsfenster ist fest 06–22 Uhr (`:333`) | „… Etiketten per Rückfrage; der Grund-Code `late_shift` ist im Typ schon angelegt (`src/readinessCore/types.ts`). Die Regeln sind für einzelne Schichten in einer sonst normalen Woche geschrieben; für Vollzeit-Wechselschicht müssen sie neu gesetzt werden, sonst gilt fast jeder Diensttag als ungeeignet.“ |
| 9 | Stand: „Spec fertig; im Code nur Typen (`src/readinessCore`), Logik der Schritte 5–10 offen“ | **bestätigt** (Kleinigkeit) | `src/readinessCore/index.ts:3` („nur Typen und Config … Logik kommt mit den Schritten 5–10“); `config.ts` (279 Zeilen Schwellenwerte) existiert zusätzlich. Die Spec ist von Anton freigegeben (`readiness-spec.md:820`), das Spoho-Review der Schwellen steht aus (`:865`) | „Spec freigegeben (Fach-Review offen); im Code nur Typen und Schwellenwerte, noch keine Rechenlogik“ |
| 10 | Morgen-Check-in und Anstrengungsfrage, `src/features/checkin`, Migrationen 016/017, „in `main`, hinter Schalter“ | **ungenau** | Dateien und Migrationen vorhanden (`supabase/migrations/016_session_logs_rpe.sql`, `017_daily_checkins.sql`). Hinter dem Schalter liegt nur der Check-in (`src/features/settings/settingsFlags.ts:13-23`, in Production aus). Die Anstrengungsfrage ist ohne Schalter live (`src/features/session/SessionEntrySheet.tsx:19-20`; `docs/readiness-plan.md`, Übersicht Schritt 2: „ändert Production? ja“). Der Check-in hat noch keine Wirkung (`src/AppMain.tsx:2330`) und gilt nur bis 14 Uhr (`src/features/checkin/checkInState.ts:55`) – nach einer Nachtschicht schläft man dann | „Check-in in `main`, in Production abgeschaltet und noch ohne Wirkung auf Plan oder Anzeige; Anstrengungsfrage nach der Einheit ist live. Der Check-in ist als Morgen-Frage gebaut (gültig bis 14 Uhr) und müsste für Nachtdienste an die Aufwachzeit gebunden werden.“ |
| 11 | Bauweise „Spec, Invarianten, Tests“ (`src/planCore`, `docs/plan-spec.md`) | **bestätigt** | `src/planCore/invariants.ts`, `__tests__/`, `docs/plan-spec.md` §12. Die Folgerung („das, was eine Prüfstelle als Trainingskonzept sehen will“) ist als Einschätzung markiert; laut `research.md` §4.2 verlangt Kapitel 5 ein Manual mit Stundenverlaufsplänen, kein Regelwerk für einen Algorithmus | Zusatz: „Für einen Kurs nach Kapitel 5 zählt ein Manual mit Stundenplänen; das Regelwerk hilft erst bei einer App nach Kapitel 7.“ |
| 12 | Einwilligungen …: `src/features/aiConsent`, „Gesundheits-Zustimmung v2“, Supabase RLS, Stand „in `main`“ | **falsch (Versionsangabe)** | `src/features/checkin/healthConsent.ts:11`: `HEALTH_CONSENT_VERSION = "1"`. Eine Version 2 gibt es nirgends im Repo. KI-Einwilligung ebenfalls Version 1 (`src/features/aiConsent/aiConsentState.ts:13`). Kontolöschung: `api/_lib/deleteAccount.js` vorhanden | „`src/features/aiConsent` (KI-Einwilligung), Zustimmung zur Speicherung von Gesundheitsangaben (Version 1, `src/features/checkin/healthConsent.ts`), Kontolöschung, Supabase RLS“ |
| 13 | KI-Coach mit Einwilligung, `api/_lib/coachHandlers.js`, „läuft“ | **bestätigt** | `CLAUDE.md` (Abschnitt AI-Provider, Guard-Reihenfolge) | – |

### A.2 Tabelle §1.2 „Was fehlt oder heute nicht passt“

| Nr. | Aussage | Urteil | Beleg | Korrekturvorschlag |
|---|---|---|---|---|
| 14 | „Das Tagesfenster ist 06–22 Uhr“ | **ungenau** | `src/scheduling/capacityScore.ts:18-19`: Werktag 06–22, Wochenende 07–23 | „Das Tagesfenster ist werktags 06–22 Uhr, am Wochenende 07–23 Uhr“ |
| 15 | Termine über Mitternacht werden am Tageswechsel geteilt | **bestätigt** | `src/calendar/eventToScheduleBlocks.ts:35`, `:87-110`; Test `eventToScheduleBlocks.test.ts:66-82` (Nachtschicht 22:00–06:00 → 22:00–23:59 und 00:00–06:00). Grund: DB-Regel `end_time > start_time` (`supabase/migrations/009_weekly_schedule_blocks.sql:16`) | – |
| 16 | Der Teil von 0 bis 6 Uhr liegt außerhalb des Fensters | **bestätigt** | `capacityScore.ts:96-99` (Zuschnitt auf das Fenster) | – |
| 17 | „Eine Nachtschicht 22–6 Uhr belegt damit rechnerisch null Minuten“ | **bestätigt für Nächte ab Montag bis Freitag; sonst ungenau** | Ausgeführt: Mo 22:00 → Di 06:00 ergibt an beiden Tagen 0 belegte Minuten, Kapazität 1,0, `isFullyFree = true`. Beginn Sa oder So: 60 Minuten (Fenster bis 23 Uhr). Reale Kliniknacht 20:45–06:15: 75 + 15 Minuten. Der Befund ist eher schärfer als im Dokument: Weil der Tag als „komplett frei“ gilt, ist der Morgen nach der Nachtschicht für die Engine der **beste** Zieltag für eine harte Einheit (`assignSessionToBestCapacityDay.ts:190-194`) | „Eine Nachtschicht 22–6 Uhr belegt werktags rechnerisch null Minuten (am Wochenende 60, bei 20:45–6:15 Uhr 90 von 960). Beide Tage gelten als frei; die Engine würde eine harte Einheit also bevorzugt auf den Tag nach der Nachtschicht legen.“ |
| 18 | Readiness-Spec setzt die Schlafgelegenheit bei Nachtschicht ausdrücklich auf „unbekannt“ (§7.2) | **bestätigt** | `docs/readiness-spec.md:330` | – |
| 19 | „Schlaf am Tag sieht niemand“ | **ungenau** | Richtig für den Kalender. Mit Uhr werden aber alle Schlafabschnitte auf den Aufwachtag summiert, auch Tagschlaf (`src/recovery/aggregateRecoverySamples.ts:3`, `:93`). Der Check-in fragt zudem nach dem Schlaf | „Schlaf am Tag sieht der Kalender nicht. Mit Uhr zählt die vorhandene Auswertung auch Tagschlaf mit (alle Abschnitte auf den Aufwachtag); ohne Uhr bleibt nur die Check-in-Frage.“ |
| 20 | Kein Schichtmodell: kein Datentyp Früh/Spät/Nacht/Frei, keine Rotationsmuster, kein Foto-/PDF-Import | **bestätigt** | Suche nach `frühschicht|spätschicht|nachtschicht|shiftType|rotation` in `src/**`: nur Tests. Zusätzlich: wiederkehrende Blöcke gibt es nur je Wochentag (`009_weekly_schedule_blocks.sql:7`), und für Handeingabe gibt es keine Oberfläche (`saveWeeklyScheduleBlock` wird in `AppMain.tsx` und `src/components` nicht aufgerufen) | Zusatz: „Wiederkehrende Termine kennt die Tabelle nur wochenweise; Rotationen mit anderer Länge (z. B. 2-2-2-4) lassen sich nicht ablegen. Eine Oberfläche zur Handeingabe von Terminen gibt es nicht.“ |
| 21 | Preset „Schichtarbeit“ = Näherung „Mo–Fr 6–14 Uhr“ | **bestätigt** | `src/calendar/presets.ts:54-66` | – |
| 22 | `CoreInputs.availableDays` ist eine feste Menge von Wochentagen | **bestätigt** | `src/planCore/types.ts:10`, `:38-39`; `docs/plan-spec.md:35` | – |
| 23 | `PlanRules.maxMinutesByDay` existiert als Typ, Regeln im MVP leer | **bestätigt** | `types.ts:59-60`, `:69-70` (`EMPTY_RULES`); gelesen wird das Feld nur beim Normalisieren (`src/planV2/normalizePlanCoreMeta.ts:92-104`) | – |
| 24 | Plan-Kern: 5 km bis Marathon, Renndatum Pflicht, 3–6 Lauftage; kein Plan ohne Rennen | **bestätigt** | `types.ts:16`, `:19`, `:34`; `docs/plan-spec.md:13-15`, `:33-34` | – |
| 25 | „Kein Krafttraining (`docs/plan-spec.md` §0)“ | **bestätigt für den Kern, unvollständig** | `docs/plan-spec.md:16`; `types.ts:76`, `:78`. Das Plan-Datenmodell der App kennt Kraft, Rad und Schwimmen aber schon (`src/planV2/types.ts:3`; `src/lib/ai/types.ts:30-36`), und die Kalender-Engine behandelt `strength`/`bike` als lockere Einheit (`docs/roadmap.md:27`) | „Der Plan-Kern erzeugt kein Krafttraining (`plan-spec.md` §0). Speichern, Anzeigen und Verschieben von Kraft-, Rad- und Schwimmeinheiten kann die App bereits (`src/planV2/types.ts`); es fehlt der Erzeuger, nicht das Datenmodell.“ |
| 26 | kein Geh-Lauf-Einstieg, keine Mindestdosis | **bestätigt** | Es gibt einen Einsteiger-Modus (Tempo nach Gefühl, keine Intervalle; `plan-spec.md:73`, `:243`, `:250`), aber nur für Menschen, die schon laufen (Beispiel P1: 10 km pro Woche, `:336`) | Zusatz: „Der Einsteiger-Modus setzt voraus, dass jemand schon rund 10 km pro Woche läuft.“ |
| 27 | „Eine Einheit hat einen Tag, keine Uhrzeit“ | **bestätigt** | `src/planV2/types.ts:8` (Mittag als Platzhalter), `src/planCore/types.ts:87`; `docs/readiness-spec.md:334` („der Plan kennt keine Uhrzeit einer Einheit“) | – |
| 28 | Nur iOS: `@capacitor/ios`, HealthKit-Plugin; Android unter „Post-TestFlight“ | **bestätigt** | `package.json:13`, `:18-19`; kein Ordner `android/`; `calendarImportService.ts:17-19` (nur iOS); `CLAUDE.md:86-87`; `docs/roadmap.md:281` („nicht anfassen, auch nicht nebenbei“) | – |
| 29 | Keine Funktionen für Betriebe | **bestätigt** | Suche nach Lizenz/Organisation/Gruppe in `supabase/migrations` und `src/lib/supabase`: keine Treffer | – |
| 30 | Kein Kursformat, keine Auswertung | **bestätigt, unvollständig** | Keine Module, Bescheinigungen, Fragebögen. Es fehlt außerdem jede Bezahlfunktion (kein Kauf, keine Rechnung) – in §1.3 nicht eingeplant | Zusatz: „… keine Bezahlung und keine Rechnung (ein Kurs für rund 100 € braucht beides; bei Kauf in der iOS-App fällt die Apple-Provision an)“ |
| 31 | MyRace nicht fertig: Developer-Account fehlt, TestFlight offen, Readiness-Kern nicht gebaut | **bestätigt** | `CLAUDE.md:74-75`; `src/readinessCore/index.ts:3` | – |
| 32 | §8 Nr. 12: Uhr- und Kalenderfunktionen auf dem iPhone nicht abgenommen | **bestätigt** | `docs/roadmap.md:43`, `:48-50`; `CLAUDE.md:73`, `:77` | – |

### A.3 Fehlende Bausteine in der Fit-Analyse

Nutzbar, aber nicht genannt:

1. **Vorhandene Uhr-Auswertung** (`src/recovery/**`, live): Schlaf, HRV, Ruhepuls aus Apple Health; Tagschlaf wird mitgezählt (`aggregateRecoverySamples.ts:3`). Der Auftrag nannte `src/recovery/**` ausdrücklich; die Fit-Analyse erwähnt nur die noch nicht gebaute Tagesform.
2. **Tabelle `weekly_schedule_blocks`** (Migrationen 009/010): einmalige und wöchentliche Blöcke, Herkunft `manual|eventkit|preset`. Ein Schichtmuster ließe sich wie der Kalender-Import als Einzeltermine ablegen (neue Herkunft nötig, `010_…source.sql:12`). Grenzen: nur Wochenrhythmus, kein Block über Mitternacht, keine Eingabe-Oberfläche.
3. **Plan-Datenmodell mit Kraft/Rad/Schwimmen** (`src/planV2/types.ts:3`) – siehe Zeile 25.
4. **Mehrere Pläne und Archiv** (`MAX_ACTIVE_PLANS = 5`, `src/lib/supabase/services/trainingPlanService.ts:23`; Migration 012): ein Gesundheitsplan neben einem Rennplan ist strukturell möglich.
5. **Einheiten-Protokoll** (`session_logs` mit erledigt/übersprungen, Gefühl, Anstrengung 0–10): die Datengrundlage für „Nutzungsdaten“ im Piloten und für eine Vorher-Nachher-Auswertung ist da.
6. **Strava-Anbindung** (Backend fertig, Gerätetest offen, `CLAUDE.md:77`): einzige vorhandene Brücke zu Nutzern ohne Apple Watch.
7. **Trainings- und Check-in-Erinnerung** (`src/services/notificationService.ts:30`, `:163`): vorhanden, aber mit fester Uhrzeit (8:00 bzw. 7:30). Für Wechselschicht müsste die Uhrzeit dem Dienst folgen; um 7:30 Uhr geht eine Nachtschicht gerade schlafen.
8. **Plan-Kern läuft auf dem Gerät** (`src/onboarding/localCorePlan.ts`): offline nutzbar, wenig Serverkosten – ein Argument gegenüber Betrieben.

Hürden, die fehlen:

9. **65-%-Regel** (Zeile 6): 8-Stunden-Schichten erzeugen keinen Konflikt.
10. **Import überspringt Ganztagstermine und Kalender-Abos** (Zeile 2). Viele tragen Dienste als Ganztagstermin oder Kürzel ein; Dienstplansysteme liefern, wenn überhaupt, Abos. Das trifft Annahme A6 direkt.
11. **Tausch nur innerhalb einer Woche, nur ganze Tage, eine Einheit pro Tag** (Zeile 6 d). Sieben Dienste am Stück löst kein Wochentausch.
12. **Der Kalender wirkt nur nachträglich und nur 28 Tage weit**; der Plan entsteht einmalig ohne Kalender (`docs/calendar-system-analysis.md:25`).
13. **Freigegebene Entscheidung A19** der Readiness-Spec: „Woche für Woche planen wird nicht gebaut“ (`docs/readiness-spec.md:842`). Paket S2 („Wochenplanung nach Dienstfolge“) widerspricht dem und braucht eine neue Entscheidung.
14. **Keine Bezahlung, keine Mehrsprachigkeit** (App fest auf Deutsch, `settingsFlags.ts:5`), kein Web-Zugang für Nicht-iPhone-Nutzer.

### A.4 Ist die Aufwandsschätzung §1.3 plausibel?

| Paket | Schätzung | Bewertung |
|---|---|---|
| S1 Schicht-Kern | 8–12 Tage „zusätzlich zu den Readiness-Schritten 7, 8 und 12“ | **Zu knapp dargestellt.** Schritt 12 hängt laut `docs/readiness-plan.md:198` an 7, 8 und 10; Schritt 10 an 9 (`:178`); Schritt 9 an 5, 6, 7 (`:165`). Der Vorlauf ist also 5 + 6 + 7 + 8 + 9 + 10 + 12 = rund 19–24 Arbeitstage, nicht drei Schritte (7–9 Tage). Dazu kommen für S1 selbst: neue Regeln (die Spec setzt Nachtschicht bewusst auf „unbekannt“), Schema-Änderung, erstmals eine Eingabe-Oberfläche, Wochengrenzen. 8–12 Tage sind für den reinen Rechenteil vertretbar; bis zu einem **zeigbaren** Schicht-Modus sind es eher 27–36 Arbeitstage plus Gerätetests |
| S2 Gesundheitsplan | 15–25 Tage plus Fachzuarbeit | **Untergrenze optimistisch.** Der Lauf-Plan-Kern allein war mit 21–25 Arbeitstagen geplant (`docs/plan-core-plan.md:517`) und hatte Literatur als Vorlage. S2 ist ein neuer Erzeuger (kein Rennen, Kraft, Einsteiger, Dienstfolge statt Mo–So) – `src/planCore` ist dafür kaum wiederverwendbar (Phasen, km-Umfang, Renntempo, Invarianten I1–I16 sind laufspezifisch). Realistisch eher 25–40 Tage; die Inhalte hängen an einer Fachperson, die es noch nicht gibt |
| S3 Kursformat | 10–15 Tage plus Inhalte | **Lücken:** Bezahlung und Rechnung, Nachrichtenkanal mit 48-Stunden-Pflicht (eigenes Backend, Benachrichtigungen), Verwaltung für die Kursleitung fehlen in der Beschreibung |
| S4 Android | 10–20 Tage | plausibel am oberen Ende; es gibt kein Android-Testgerät, und die Projektregel verlangt Gerätetests (`CLAUDE.md`, „nie Simulator“) |
| S5 Betriebe | 10–15 Tage plus Rechtsprüfung | plausibel für den Code |

Weitere Punkte: (1) Die Pakete werden nie summiert. Option 2 bis zum ersten Kurs heißt S1 + Vorlauf + S2 + S3 = 52–76 Arbeitstage mit den Zahlen des Dokuments, mit der höheren Schätzung für S2 rund 60–90, neben den offenen MyRace-Punkten. Das steht im Widerspruch zum Eindruck „machbar in vier bis acht Monaten“ für einen Studenten mit zwei Nebenjobs. (2) Ein „Arbeitstag“ enthält Antons Abnahme; die Gerätetests waren bisher der Engpass.

### A.5 Folgt „Option 2, gebaut in der Reihenfolge von Option 3“ aus dem Code-Befund?

**Die Reihenfolge ja, die Begründung nur zum Teil.**

- Dafür: Kalender-Import, Termin-Tabelle, Tausch-Mechanik mit Prüfung und Bestätigung, Einwilligungen und das Protokoll sind echte, wiederverwendbare Vorleistung. S1 ist für Option 2 und 3 derselbe Schritt und verbessert MyRace auch allein. Der Rückfall auf Option 3 ist sauber.
- Dagegen: „Derselbe Kalender, dieselbe Tagesform, dieselbe Logik zum Verschieben“ (Kurzfassung) klingt nach Bestand. Tatsächlich ist die Tagesform nicht gebaut, die Verschiebe-Regel reagiert auf normale Schichten nicht und hält den Tag nach der Nachtschicht für frei, und der einzige fertige, geprüfte Kern (`src/planCore`) ist für einen Gesundheitskurs nicht nutzbar. Der Code stützt deshalb „Synergie 4“ für Option 2 nicht; 3 wäre ehrlicher.
- Der wichtigste Punkt steht in Teil B, H1: Der empfohlene Geldweg (fester Kurs nach Kapitel 5) braucht den adaptiven MyRace-Kern kaum, und je mehr die App plant, desto eher fällt das Angebot unter Kapitel 7.

---

## Teil B: Befunde

### Hoch (sachlich falsch oder irreführend)

**H1 – Zielkonflikt zwischen Geldweg und Technik wird nicht benannt.**
Fundstelle: `entscheidung.md` Kurzfassung („In welcher Form?“, Stufe 2), §2 Empfehlung Punkt 3, A3; `research.md` §4.2.
Laut `research.md` §4.2 ist nach Kapitel 5 nur ein Kurs mit festen Modulen zertifizierbar, bei dem „der Dienstplan nur steuert, wann ein Modul liegt“. Und: Kapitel 7 gilt, „wenn digitale Technik Aufgaben übernimmt, die sonst die Kursleitung hat“. Eine App, die Training selbst plant und anpasst, tut genau das. Folge: Entweder bleibt der Kurs fest (dann trägt der MyRace-Kern wenig bei, und der USP ist Inhalt plus Kursleitung), oder die App plant adaptiv (dann droht Kapitel 7 mit ISO 27001 und Studie, laut `research.md` „derzeit nicht erreichbar“). `entscheidung.md` führt „Kassen sagen ‚nur als fester Kurs‘“ nur als Umbau-Fall in §7, obwohl das laut Recherche der Ausgangsfall ist.
Ersatztext für die Kurzfassung, Absatz „In welcher Form?“, Ergänzung am Ende: „Wichtig: Der Kurs der Stufe 2 hat feste Inhalte; die App legt nur fest, an welchem Tag ein Modul liegt. Die Stärke von MyRace (Plan passt sich an) darf dort nur wenig tun, sonst prüfen die Kassen das Angebot als App nach den strengeren Regeln. Der Kern zahlt sich erst in Stufe 3 voll aus.“
Ersatztext für A3, Spalte „Was dagegen spricht“: „Kapitel 5 erlaubt nur feste Module (üblich im Wochenrhythmus). Übernimmt die App Aufgaben der Kursleitung, gilt Kapitel 7 mit ISO 27001 und Studie. Wo die Grenze bei automatischer Terminplanung liegt, ist offen.“

**H2 – Fit-Tabelle stellt die Verschiebe-Logik als fertige Kernfunktion dar.**
Fundstelle: `entscheidung.md` §1.1 Zeile 3; Kurzfassung; `ideathlon-entwurf.md` Feld 5 („Der Rechenkern existiert bereits“).
Siehe Teil A Zeilen 6 und 17. Ersatztext für Feld 5: „Die Grundlage existiert in MyRace: Kalender-Import und das Verschieben von Einheiten mit Prüfung und Bestätigung. Die Regeln für Schichten gibt es noch nicht; neu zu bauen sind das Schichtmodell, die Schicht-Regeln, Kraft- und Einsteigerinhalte und das Kursformat.“

**H3 – Aufwand S1: Abhängigkeiten falsch verkürzt, keine Summe.**
Fundstelle: `entscheidung.md` §1.3. Siehe A.4.
Ersatztext S1: „8–12 Tage, **nach** den Readiness-Schritten 5–10 und 12 (zusammen rund 19–24 Tage, `docs/readiness-plan.md`); Schritt 12 setzt 10 und 9 voraus“. Neuer Satz unter der Tabelle: „Summe für Option 2 bis zum ersten Kurs: mindestens 52–76 Arbeitstage (S1 mit Vorlauf, S2, S3; Schätzung), dazu Inhalte, Bezahlung und Gerätetests.“

**H4 – „Gesundheits-Zustimmung v2“ gibt es nicht.**
Fundstelle: `entscheidung.md` §1.1 Zeile 7. Beleg und Ersatztext: Teil A Zeile 12.

**H5 – Pitch: „Bezahlen sollen es nicht die Pflegekräfte, sondern Krankenkassen und Arbeitgeber“ widerspricht den eigenen Feldern.**
Fundstelle: `ideathlon-entwurf.md` §2 (Pitch) gegen Feld 7, Feld 8, §4 („Wer zahlt wirklich?“) und `research.md` §4.2 („Die versicherte Person zahlt vor … Der Anbieter bekommt kein Geld von der Kasse“; TK 80 %, DAK höchstens 75 €; Erstattung nur bei vollständiger Teilnahme).
Ersatztext: „Für die Pflegekräfte soll wenig übrig bleiben: Als geprüfter Präventionskurs erstattet die Krankenkasse den größten Teil, oder der Arbeitgeber übernimmt ihn.“

**H6 – Pitch und Feld 2: „jeder Trainingsplan und jeder Kurs geht von festen Wochentagen aus“ ist nach der eigenen Recherche falsch.**
Fundstelle: `ideathlon-entwurf.md` §2 und Feld 2 gegen `research.md` §3.2 (IronShift, ShiftFit, Edge planen um Rotationen), §2.7 (AOK: schichtspezifische Kurse im Betrieb) und Feld 3 desselben Entwurfs.
Ersatztext Pitch: „Aber fast alle Trainingspläne und Kurse gehen von festen Wochentagen aus.“ Ersatztext Feld 2: „Die gängigen Trainingspläne und Kurse gehen von festen Wochentagen aus.“

**H7 – Feld 3 nennt Studie und Kassenweg als vorhandenen Unterschied.**
Fundstelle: `ideathlon-entwurf.md` Feld 3 („Unser Unterschied … wissenschaftlicher Prüfung an der Spoho und dem Weg über Krankenkassen und Betriebe“). Nichts davon existiert; der Entwurf verbietet das an anderer Stelle selbst (Hinweis unter Feld 5, Checkliste §5 Punkt 4).
Ersatztext: „Nicht die App allein – die ist kopierbar. Sondern, was wir aufbauen wollen: ein offenes Regelwerk (jede Anpassung wird erklärt), eine Begleitstudie und der Weg über Krankenkassen und Betriebe. Stand heute: `[Zusagen eintragen oder ‚noch keine‘]`.“

**H8 – Feld 4: „Tagesform aus Uhr und Check-in“ ist nicht gebaut.**
Fundstelle: `ideathlon-entwurf.md` Feld 4. Der Check-in ist in Production aus und ohne Wirkung (`settingsFlags.ts:13`, `AppMain.tsx:2330`); der Tagesform-Kern hat keine Logik (`src/readinessCore/index.ts:3`). Vorhanden ist ein älterer Erholungswert aus Uhrdaten.
Ersatztext: „… ein regelbasierter Planungskern mit offengelegten Regeln und Tests, Kalender-Import und ein Erholungswert aus Uhrdaten; ein Check-in zur Tagesform ist in Arbeit.“

**H9 – Das zentrale Go-Kriterium ist so nicht messbar: „ungefragt“ wird durch den Leitfaden selbst verfälscht.**
Fundstelle: `entscheidung.md` §6 Fragen 5 und 7, Auswertungstabelle, §7 Zeilen „Problem bestätigt“ und „Lassen“.
Frage 5 nennt „nach einem Nachtdienst oder vor einem Frühdienst“ als Beispiel und legt damit die Schicht als Grund nahe; die Auswertung zählt aber Antworten auf Frage 4 **und 5** als „ungefragt Planung“. Frage 7 fragt direkt nach Schlaf; trotzdem zählt „ungefragt Erschöpfung oder Schlaf“ aus Frage 4 **und 7**.
Ersatztext Frage 5: „Wie entscheidest du an einem Tag, ob und was du machst? Erzähl mir vom letzten Mal.“ Auswertungstabelle: „nennt ungefragt Planung oder Unregelmäßigkeit – aus Frage 3, 4“; „nennt ungefragt Erschöpfung oder Schlaf – aus Frage 3, 4 (vor Frage 7)“.

### Mittel (Widerspruch oder unbelegte Zahl)

**M1 – 5,7 Mio. gegen 5,6–5,9 Mio.; „14,3 % … das sind rund 5,7 Millionen“ stimmt rechnerisch nicht.**
Fundstellen: `research.md` §1 Nr. 1 und §2.1 (5,6–5,9 Mio., gerechnet mit 15 % von 39 Mio.), §4.9 (5,7 Mio. „aus Destatis-Anteil“); `entscheidung.md` Kurzfassung (5,7 Mio., ohne Hinweis auf eigene Rechnung); `ideathlon-entwurf.md` Feld 2 und Pitch. 14,3 % von 39 Mio. sind 5,58 Mio.; 15 % sind 5,85 Mio.; 5,7 ist nur die Mitte der Spanne. In §2.1 passt zudem „15 % … ergibt 5,6–5,9“ nicht (15 % ergibt nur den oberen Wert).
Ersatztext überall: „rund 5,6 Millionen (14,3 % von rund 39 Mio. abhängig Beschäftigten, eigene Hochrechnung)“; im Pitch: „mehr als fünfeinhalb Millionen“. §2.1: „14,3–15 % von rund 39 Mio. … ergibt 5,6–5,9 Mio.“

**M2 – Startgruppe Pflege gegen die Reihung der Recherche.**
`research.md` §2.2 reiht die Erreichbarkeit Polizei NRW (1) … Pflege (4, „zersplittert, 49 % Teilzeit, Erschöpfung“). `entscheidung.md` §2 und §8 Nr. 4 und `ideathlon-entwurf.md` Feld 7 starten mit Pflegekräften im Krankenhaus. Das ist begründet (Zahler-Logik: Kassenbudget für Krankenhäuser, Kassenweg greift bei Beamten vermutlich nicht; Krankenhäuser sind weniger zersplittert als Heime), aber die Abweichung wird nicht genannt, und die Begründung „Kassenweg greift nicht“ ist laut §8 Nr. 7 ungeprüft.
Ersatztext nach der Tabelle in §2: „Das weicht von der Reihung in `research.md` §2.2 ab (dort Polizei NRW vor Pflege). Grund: Dort ging es um den Zugang, hier um den Zahler. Die Krankenhaus-Pflege ist die einzige Gruppe, bei der Kassenkurs und Kassenbudget für Betriebe zusammenpassen. Fällt die ungeprüfte Annahme zur Polizei (§8 Nr. 7), ist die Reihung neu zu entscheiden.“

**M3 – „Größte Teilgruppe ist die Pflege mit 1,76 Mio. Beschäftigten“.**
Fundstellen: `research.md` §1 Nr. 1; `ideathlon-entwurf.md` Feld 3. 1,76 Mio. sind alle Pflegebeschäftigten, nicht die im Schichtdienst (laut eigenen Zahlen 43 % bzw. Annahme 55 %, also rund 0,8–1,0 Mio.). Für die Industrie wurde keine absolute Zahl gefunden (§2.2); „größte“ ist also nicht belegt.
Ersatztext: „Eine große, gut abgrenzbare Gruppe ist die Pflege: 1,76 Mio. Beschäftigte (06/2025), davon nach BAuA rund 43 % in Schicht. Für die Industrie fehlt eine absolute Zahl.“

**M4 – „Das Problem ist echt und groß … Studien nennen immer dieselben Hürden“ ist stärker als die Recherche.**
Fundstelle: `entscheidung.md` Kurzfassung. Die Meta-Analyse findet keinen signifikanten Unterschied im Bewegungsniveau (`research.md` §2.3); dieser Befund fehlt in `entscheidung.md` ganz. Die Hürden stammen aus drei qualitativen Arbeiten (12 Interviews, 15 Fokusgruppen, ein Kongress-Abstract; Evidenz schwach bis mittel).
Ersatztext: „Die Gruppe ist groß (rund 5,6 Mio.), und qualitative Studien nennen wiederholt dieselben Hürden für Sport – unregelmäßige Pläne, Erschöpfung, Angebote zu Bürozeiten. Dass Schichtarbeitende sich insgesamt weniger bewegen, ist dagegen nicht belegt.“

**M5 – Befund „Programme wirken eher im Betrieb als digital“ wird nicht gewichtet.**
`research.md` §1 Nr. 4 und §2.6 (Demou: Erfolgsfaktoren sind Nähe zum Arbeitsplatz, bezahlte Teilnahmezeit, Rückhalt der Leitung). `entscheidung.md` empfiehlt ein digitales Freizeitangebot und nennt den Befund weder in A1 noch in A5.
Ersatztext A1, Spalte „Was dagegen spricht“, Ergänzung: „gewirkt haben bisher vor allem Programme im Betrieb mit bezahlter Zeit und Rückhalt der Leitung, nicht digitale Angebote für die Freizeit (Demou 2018)“.

**M6 – Größtes Risiko des Kurswegs fehlt in den riskantesten Annahmen.**
`research.md` §4.1 nennt für Weg A als größtes Risiko: Erstattung nur bei 100 % absolvierten Einheiten, Abhängigkeit von einer Kursleitung, nur einmalige Erlöse, höchstens zwei Kurse pro Jahr. In `entscheidung.md` §3 fehlt das.
Ersatztext neue Zeile A9: „**Teilnehmende schaffen alle Module** – sonst erstattet die Kasse nichts. Dafür: feste Struktur, Begleitung. Dagegen: Erschöpfung und wechselnde Dienste; 15 % Ausstieg in 24 Tagen in der Bergbau-Studie. Test: Pilot mit Abschlussquote.“

**M7 – Kurspreis: „rund 100 €“ gegen Rechnung mit 99–129 €; 129 € ohne Quelle.**
`ideathlon-entwurf.md` Feld 8: Preis „rund 100 €“, die Größenordnung „34.000 bis 220.000 €“ rechnet am oberen Ende mit 129 €. Mit 100 € sind es 34.000–170.000 €. Die belegten Vergleichspreise in `research.md` §4.2 sind 99 € (Gymondo, 2022) und 69/90 € (Epassi); 129 € taucht in keiner Quelle auf (auch nicht im Anhang). `entscheidung.md` Kurzfassung nennt „etwa 100 €“ ohne Markierung als Annahme.
Ersatztext Feld 8: „rund 100 € je Teilnahme *(Annahme; Vergleichspreise 69–99 €)*“ und „Kurs rund 340 bis 1.700 Teilnahmen pro Jahr = rund 34.000 bis 170.000 € Umsatz“. `research.md` §4.9: Preis „99 € (Annahme; 129 € als obere Variante ohne Vergleichsquelle)“.

**M8 – Lizenzrechnung: „Berechtigte“ uneinheitlich; 55 % gegen 43 %; „57–59 %“ ohne Quelle im Bericht.**
`research.md` §4.9: Das Segmentvolumen rechnet mit 55 % Schichtanteil, die Szenarien (2 Einrichtungen = 600, 5 Kliniken = 1.500) mit allen Pflegekräften je Haus. §2.2 nennt für Gesundheitsberufe 43 % (BAuA). Die Stütze „57–59 %“ steht nur im Anhang A (Zeile 1.17), nicht in `research.md`.
Ersatztext: Zeile „davon im Schichtdienst“: „43–55 % → rund 470.000–600.000 (43 % BAuA 2021, Gesundheitsberufe; 55 % Annahme, gestützt auf 57–59 % mit Arbeit vor 7 oder nach 19 Uhr, Anhang A 1.17)“; Volumen „11–22 Mio. €“; unter der Szenario-Tabelle: „Berechtigte = alle Pflegekräfte des Hauses; nur Schichtarbeitende wären rund die Hälfte.“ In `ideathlon-entwurf.md` Feld 8 entsprechend: „Lizenzen bei fünf Kliniken rund 20.000 bis 54.000 € pro Jahr“.

**M9 – Zeitangaben widersprechen sich.**
(a) `entscheidung.md` Kurzfassung: „Bis 06.12. kein Code“; §8 Nr. 2: „Bis zum Ideathlon [22.01.] entsteht kein Code“; `ideathlon-entwurf.md` §3: bis 22.01. „Schichtmodell als klickbarer Entwurf“. (b) Kurzfassung: zehn Interviews, „mindestens fünf vor der Frist“; `ideathlon-entwurf.md` §3: „bis 06.12.2026 10 Gespräche“.
Ersatztext §8 Nr. 2: „Bis zum 06.12. entsteht kein Code; bis zum Ideathlon höchstens ein klickbarer Entwurf ohne App-Code.“ `ideathlon-entwurf.md` §3: „bis 06.12.2026: mindestens 5 Gespräche (Ziel 10 bis Ende Januar) …“.

**M10 – Erscheinungsjahr der Wettbewerber.**
`research.md` §1 Nr. 5 und §3.2: 2025/2026; `ideathlon-entwurf.md` Feld 3: 2025/26; `entscheidung.md` Kurzfassung: „2026“; `ideathlon-entwurf.md` §4: „seit 2026“. Ersatztext: jeweils „seit 2025/2026“.

**M11 – Go/Umbau/No-Go: Lücken und unscharfe Begriffe.**
Fundstelle: `entscheidung.md` §7 und §2 („Die Bedingung“).
- 3 bis 5 von 10 nennen Planung: weder „weitermachen“ (ab 6) noch „lassen“ (unter 3). „Umbauen“ setzt ein bestätigtes Problem voraus.
- Drei verschiedene Regeln zu Fachperson, Institut, Pilotpartner: §2 („keines der drei in Sicht“ → Option 3), §7 Weitermachen (alle nötig), §7 Lassen („weder Fachperson noch Institut“). Ist genau eines in Sicht, gilt nichts davon.
- „in Sicht“, „mit Substanz“, „Mitte Januar“ gegen Stichtag 31.01. sind nicht messbar bzw. uneinheitlich.
- Keine Regel, wenn ZPP und GKV-Spitzenverband nicht antworten; keine Regel bei weniger als zehn Interviews.
- Die Schwelle 6 von 10 mischt Sportliche und Wenigbewegte. Bestätigen nur die fünf Sportlichen plus eine weitere Person, gilt das Problem als bestätigt, obwohl die Zielgruppe der Kassen fehlt. Für „Nur die Sportlichen wollen es“ gibt es keine Schwelle.
- Für „Hauptproblem ist Schlaf und Erschöpfung“ gibt es keine Schwelle.
Ersatztext (Kern): „Problem bestätigt: mindestens 60 % der Befragten und mindestens 3 der Befragten ohne regelmäßigen Sport nennen ungefragt Planung oder Unregelmäßigkeit. 30–59 %: fünf weitere Interviews, dann neu zählen. Unter 30 %: lassen. Nennen mehr Befragte Erschöpfung als Planung als Hauptgrund: Umbau-Zeile ‚Schlaf und Erschöpfung‘.“ – „Fachperson: mindestens eine Person mit abgeschlossenem Studium hat ein Gespräch zugesagt.“ – „Kassen-Passung: ZPP oder GKV-Spitzenverband haben geantwortet und schließen … nicht aus; ohne Antwort bis 31.01. gilt das Kriterium als offen, nicht als erfüllt.“ – §2 angleichen: „Fehlen am 31.01. Fachperson **oder** Institut, bleibt es bei Option 3.“

**M12 – A3 gibt den Leitfaden verkürzt wieder.**
„Schichtarbeit ist im Leitfaden als Zielgruppe genannt“: laut `research.md` §4.3 nur im BGF-Teil (Kap. 6.5) bei Stressbewältigung, nicht für Bewegungskurse; kein eigenes Handlungsfeld. „Kapitel 5 verlangt feste Module im Wochenrhythmus“: `research.md` sagt „üblicherweise wöchentlich“, die Flexibilisierung ist offene Frage an die ZPP.
Ersatztext „Was dafür spricht“: „Kapitel 7 erlaubt ausdrücklich starke Individualisierung; Schichtdienst kommt im Leitfaden vor, allerdings nur im Betriebsteil bei Stressbewältigung.“

**M13 – Unbelegte Aussagen in der Annahmen-Tabelle.**
A5 „Bewegung ist das häufigste Thema in der BGF“ (belegt ist: in 62 % der verhaltensbezogenen Maßnahmen); A7 „Modell ‚Arbeitgeber zahlt, sieht aber nichts‘ ist üblich“ (keine Quelle, in `research.md` §4.8 eigene Einordnung); A7 „Shift2Health berichtet Misstrauen gegenüber Technik“ (Quelle sagt: technische Lösungen werden teils als Fassade erlebt – das ist Misstrauen gegenüber dem Arbeitgeber, nicht gegenüber Technik); §2 „Fitnessnachweis verankert“ (nur im Anhang A 5.4, nicht in `research.md`); §2 Punkt 4 „Läufer … in den Foren von Garmin und TrainerRoad“ (TrainerRoad ist eine Rad-App).
Ersatztexte: „Bewegung kommt in 62 % der verhaltensbezogenen BGF-Maßnahmen vor (2024)“; „Modell ‚Arbeitgeber zahlt, sieht aber nichts‘ ist rechtlich möglich (Einschätzung)“; „Shift2Health: technische Angebote werden teils als Fassade erlebt“; „Sportler im Schichtdienst fordern …“.

**M14 – Kontakt-Zuordnung widerspricht sich bei A4.**
`entscheidung.md` §4 Zeile 8 (ZPP testet A3, A4) gegen §4.1 („A4 Fachperson: Kein Kontakt testet das“). Die ZPP kann die Anforderungen klären, nicht die Suche. Ersatztext Zeile 8: „A3“; §4.1: „A4 Fachperson: Biallas testet nur den Instituts-Teil; die Fachperson testet kein Kontakt“.

**M15 – Feld 2 und Pitch: Leitlinie und Krankheitsbezug.**
„Schichtarbeit hängt mit mehr Diabetes, Übergewicht und Herzinfarkten zusammen; die medizinische Leitlinie empfiehlt **deshalb ausdrücklich** Sport“: Die Begründung „deshalb“ steht nicht in der Recherche (dort: Empfehlung als Konsens, ohne Zeitpunkt); bei Übergewicht fehlt der Vorbehalt (für Wechselschicht mit Nacht nicht signifikant). Der Satz rückt die App neben Krankheitsrisiken; `research.md` §4.7 rät, Texte bei „Training planen“ zu halten. Pitch: „Ärztliche Leitlinien“ (Mehrzahl) – belegt ist eine.
Ersatztext Feld 2: „Schichtarbeit geht in Studien mit mehr Diabetes und Herzinfarkten einher (Zusammenhang, keine belegte Ursache). Die arbeitsmedizinische Leitlinie empfiehlt Schichtarbeitenden Sport in der Freizeit.“ Pitch: „Die arbeitsmedizinische Leitlinie empfiehlt ihnen Sport.“

**M16 – Feld 5: „Die Regeln sind offen und fachlich begründet“.**
Laut `research.md` §2.5 sind sie „plausibel hergeleitet, nicht als wirksam belegt“; eine Fachperson gibt es nicht. Ersatztext: „Die Regeln sind offen und aus Schlaf- und Trainingsforschung hergeleitet; fachlich geprüft sind sie noch nicht.“

**M17 – Partner und Kontakte werden vor einer Antwort genannt bzw. als erledigt dargestellt.**
`ideathlon-entwurf.md` Feld 8: „Zugang über das BGF-Institut … und die TK“; Feld 6: „23 Fachkontakte schriftlich befragt“ (Stand heute sechs verschickt; die AOK nur bedingt). Ersatztext Feld 8: „Zugang angefragt bei `[Einrichtungen, die geantwortet haben]`“; Feld 6: „`[Zahl]` Fachkontakte angeschrieben, `[X]` Antworten bis `[Datum]`“.

**M18 – „einzige passende Studie“.**
`entscheidung.md` Kurzfassung und A1, `ideathlon-entwurf.md` §4. `research.md` §1 Nr. 4 sagt „einzige **gelesene** Schicht-App/SMS-Studie“ (n = 51, 24 Tage, Bergbau, Evidenz schwach). Ersatztext: „In der einzigen Studie zu einer Schicht-App, die die Recherche gefunden hat (51 Bergleute, 24 Tage), …“.

**M19 – ZPP-Kursdatenbank nicht durchsucht, fehlt als nächster Schritt.**
`research.md` §3.4 („kein zertifizierter Kurs … gefunden – die Kursdatenbank selbst wurde nicht durchsucht“, Evidenz schwach). Das ist in zehn Minuten nachholbar und entscheidet über „gibt es das schon bei den Kassen“. Ersatztext, Kurzfassung Schritt 2, Ergänzung: „Vorher selbst in der Kurssuche der Kassen nach ‚Schicht‘ suchen.“

**M20 – Kurzfassung und Feld 4 beschreiben die Tagesform als Bestand.**
„Derselbe Kalender, dieselbe Tagesform, dieselbe Logik zum Verschieben“. Ersatztext: „Derselbe Kalender-Import und dieselbe Technik zum Verschieben; die Tagesform ist für MyRace geplant, aber noch nicht gebaut.“

**M21 – Semesterangabe prüfen.**
Alle drei Dokumente schreiben „2. Semester“ (so stand es im Auftrag). Nach einer gespeicherten Profilnotiz begann das Studium im Wintersemester 2025/26; dann wäre das Wintersemester 2026/27 das dritte. Betrifft Feld 4, §4 und die EXIST-Einordnung (`research.md` §5.4). Bitte selbst klären.

**M22 – StarS verlangt eine „skalierbare“ Idee; der empfohlene Weg ist es laut Recherche nicht.**
`research.md` §5.2 (Voraussetzung) gegen §4.9 („trägt ein kleines Unternehmen, kein großes“). `entscheidung.md` vergibt „Passung zum Ideathlon 5“ und erwähnt den Punkt nicht. Ersatztext, Ergänzung zur Zeile „Passung“: „Für StarS zählt Skalierbarkeit; die hat erst Stufe 3 (Lizenzen), nicht der Kurs.“

**M23 – Checkliste nicht erfüllbar.**
`ideathlon-entwurf.md` §5: „Jede Zahl im Text steht in `research.md` §8“. Dort fehlen 5,7 Mio., 75–100 %/75–150 €, 69–129 €, 2–3 €, 340–1.700, 34.000–220.000, 36.000–54.000. Ersatztext: „Jede Zahl steht in `research.md` (§8 oder §4.9) oder ist als Annahme markiert“.

**M24 – `research.md` §4.1 F gegen §4.9.**
„Vergabe ist keine Hürde mehr“ (Direktauftrag bis 50.000 €) gegen das Szenario Polizei NRW landesweit mit 450.000–670.000 €. Ersatztext: „Für einen Piloten unter 50.000 € netto ist die Vergabe keine Hürde mehr; eine landesweite Lizenz bräuchte eine Ausschreibung.“

**M25 – Zahlen ohne Quelle oder Jahr in `research.md`.**
74,5 Mio. Versicherte (§4.9, ohne Quelle und Jahr); „57–59 %“ (siehe M8); „75–100 %“ Erstattung (§4.1; die Kassentabelle zeigt 80–100 %). Download → zahlend 2,9 % ist nicht das Produkt aus 6,9 % und 37,7 % (= 2,6 %); als Hinweis ergänzen, dass es Mediane verschiedener Verteilungen sind.

### Niedrig (Stil, Kleinigkeiten)

- **N1 Lizenzpreis 2–6 € gegen 2–3 €:** kein Widerspruch (§4.9 erklärt „unteres Ende“), aber `entscheidung.md` §8 Nr. 6 nennt die Spanne nicht. Ergänzen: „(Schätzspanne 2–6 €, gerechnet mit dem unteren Ende)“.
- **N2 Schreibweise** „Shift2Health“ (A7) und „SHIFT2HEALTH“ (A8); `research.md` sagt nicht, dass die Fokusgruppen (§2.3) und die Studie in Bremen (§2.7) dasselbe EU-Projekt sind.
- **N3 Wettbewerbstabelle Feld 3:** bei den Krankenkassen fehlen die schichtspezifischen Betriebskurse der AOK (`research.md` §2.7); „Keine ist deutsch“ in §4 stimmt für Apps, PPF Germany (deutscher Videokurs für Polizei) sollte man kennen.
- **N4 Sweeney 2025:** `research.md` §2.3 „Band/Heft nicht angegeben“; die Kontaktliste nennt JOEM 67(9).
- **N5 Optionsvergleich:** „Risiko 3“ für Option 2 ist bei drei fehlenden Voraussetzungen großzügig; „Synergie 4“ siehe A.5.
- **N6 Evidenzspalte** fehlt in einigen Tabellen von `research.md` (§2.2 Teilgruppen, §5 nutzt „belegt“ statt der vier Stufen).
- **N7 Kellnern als „Schichtarbeit“:** stimmt als Abendarbeit; im Gespräch nicht mit Wechselschicht gleichsetzen.
- **N8 Pitch-Länge:** siehe Abschnitt B.4.
- **N9 Unerklärte Fachbegriffe:** siehe Abschnitt B.5.

### B.1 Rechnungen nachgerechnet (`research.md` §4.9, Übernahme in Feld 8)

| Rechnung | Ergebnis | Urteil |
|---|---|---|
| 5,7 Mio. × 89 % | 5,07 Mio. → 5,1 | stimmt |
| 1,89 Mio. ÷ 74,5 Mio. | 2,54 % | stimmt |
| 5,1 Mio. × 2,5 % × 27 % | 34.425 → rund 34.000 | stimmt |
| 1 % → 340 × 99/129 € | 33.660 / 43.860 | stimmt |
| 5 % → 1.700 × 99/129 € | 168.300 / 219.300 | stimmt |
| 0,1 % von 5,1 Mio. = 5.100 × 99/129 € | 504.900 / 657.900 | stimmt (entspricht 15 % aller Online-Teilnahmen der Gruppe – „optimistisch“ ist zutreffend) |
| 553.396 ÷ 1.841 | 300,6 | stimmt |
| (553.396 + 537.000) × 55 % | 599.718 | stimmt |
| 600.000 × 24/36 € | 14,4 / 21,6 Mio. € | stimmt |
| 600 / 1.500 / 11.000 Berechtigte × 24/36 € | 14.400–21.600 / 36.000–54.000 / 264.000–396.000 | stimmt (gerundet 270.000–400.000) |
| 46.700 × 40 % × 24/36 € | 18.680; 448.000–672.000 | stimmt |
| 14–22 Mio. ÷ 95 Mio. | 14,7–23,2 % | stimmt; 95 Mio. = 1 € × (9,55 ÷ 7,52) × 74,5 Mio. = 94,6 Mio. |
| 281,96 Mio. ÷ 28.142 Betriebe (§4.1 C) | 10.019 € | stimmt |
| 281,96 Mio. ÷ 74,5 Mio. | 3,78 € | stimmt (3,79) |
| 9,3 % × 42,6 Mio. (§2.1) | 3,96 Mio. | stimmt |
| 8 % × 39 Mio. (Nachtanteil) | 3,1 Mio. | stimmt |
| Feld 8: 340–1.700 Teilnahmen = 34.000–220.000 € | nur mit 99–129 €; bei „rund 100 €“ 34.000–170.000 € | **Abweichung, siehe M7** |
| Feld 8: fünf Kliniken 36.000–54.000 € | stimmt mit §4.9 | stimmt (Vorbehalt M8) |

### B.2 Paragrafen

Innerhalb der Dokumente widerspruchsfrei; `entscheidung.md` und `ideathlon-entwurf.md` nennen keine Paragrafen, nur `research.md`.

| Angabe | Verwendung | Stimmig? |
|---|---|---|
| § 20 Abs. 4 Nr. 1 SGB V | verhaltensbezogene Prävention (§4.2) | ja |
| § 20 Abs. 5 Satz 1 | Leistung nur bei Zertifizierung (§4.2) | ja |
| § 20 Abs. 2, Abs. 6 | Kriterien des GKV-Spitzenverbands; Richtwerte 7,52 / 2,15 / 3,15 / 1 € | ja; Fortschreibung 2024 (1,13 €) und 2026 (rund 95 Mio. €) rechnerisch stimmig |
| § 20b SGB V | BGF (§4.1 C, §4.3) | ja |
| § 3 Nr. 34 EStG | 600 € je Person und Jahr (§4.5) | ja; in `entscheidung.md`/Entwurf nur „steuerfrei“ ohne Grenze und Bedingung (zertifiziert) |
| § 8 Abs. 2 Satz 11 EStG | 50-€-Grenze (§4.5) | ja |
| §§ 33a, 139e SGB V | DiGA (§4.1 I, §4.7) | ja |
| § 26 Abs. 2, 3, 4 BDSG | Einwilligung, Gesundheitsdaten, Vereinbarungen (§4.8) | ja |
| § 87 Abs. 1 Nr. 6, 7 BetrVG | Überwachung, Gesundheitsschutz (§4.8) | ja |
| § 80 Abs. 1 Nr. 16, 17, 21 BPersVG | Personalrat Bund (§4.8) | plausibel, nicht geprüft |

Hinweis: geprüft gegen Vorwissen, nicht gegen den Gesetzestext.

### B.3 Auftragstreue

| Anforderung | Erfüllt? | Anmerkung |
|---|---|---|
| Kurzfassung höchstens eine Seite | ja | 436 Wörter, rund 2.950 Zeichen |
| Kurzfassung ohne Fachjargon | weitgehend | unerklärt: USP, BGF-Institut, An-Institut, TK, Rechenkern, Pilot, Lizenzen, SHIFT2HEALTH, Gateway-Kontakt |
| Lohnt es sich / Form / Finanzierungsweg / größtes Risiko / 3 Schritte | ja | – |
| Drei Optionen, sechs Kriterien | ja | Bewertung teils großzügig (N5) |
| 5–8 riskanteste Annahmen | ja (8) | Kurs-Abschlussquote fehlt (M6) |
| Zuordnung zu 23 Kontakten | ja | alle 23 der Liste vorhanden, Namen stimmen mit der Kontaktliste; Widerspruch bei A4 (M14) |
| Interviewleitfaden, höchstens 10 Fragen, Deutsch, 15 Minuten | formal ja | 10 Nummern, aber 16 Einzelfragen plus Einstieg und 2 Abschlussfragen; realistisch 20–25 Minuten |
| nicht suggestiv | teilweise | siehe unten |
| Kriterien weitermachen/umbauen/verwerfen | teilweise | Lücken (M11, H9) |
| Abschnitt „Annahmen und Entscheidungen“ | ja (§8, 12 Punkte) | – |
| Entwurf: Problem, Zielgruppe, Lösung, USP, Geschäftsmodell, Markt, Wettbewerb, Validierung mit Platzhaltern, Team, nächste Schritte, Pitch | ja | USP ohne eigene Überschrift (Feld 3 und 5) |
| Quelle und Evidenzstärke je Kernaussage, Zahlen mit Jahr, Widersprüche | weitgehend | Lücken M25, N6 |
| Keine Gesundheitsversprechen über die Evidenz | weitgehend | M15, M16; sonst vorbildlich („Nicht schreiben“-Hinweise) |

**Interviewfragen einzeln:**

| Nr. | Urteil | Begründung und Ersatztext |
|---|---|---|
| 1 | neutral | zwei Fragen in einer; in Ordnung |
| 2 | neutral | Auswahlliste lenkt leicht; „… oder woanders?“ anhängen |
| 3 | neutral, gut | fragt nach Verhalten |
| 4 | leicht suggestiv | setzt voraus, dass Sport geplant wird; passt nicht für die fünf Befragten ohne Sport. Ersatz: „Wann hattest du dir zuletzt vorgenommen, dich zu bewegen, und es ist nichts daraus geworden? Was ist passiert?“ |
| 5 | **suggestiv** | Beispiel nennt die Hypothese (H9). Ersatz siehe H9 |
| 6 | leicht suggestiv | „unter einen Hut bekommen“ unterstellt ein Problem. Ersatz: „Hast du in den letzten zwei Jahren etwas ausprobiert, um dich regelmäßiger zu bewegen (Studio, Verein, App, Kurs, Angebot des Arbeitgebers)? Was machst du davon noch, was nicht mehr, und warum?“ |
| 7 | erster Teil neutral, zweiter hypothetisch | „Was machst du, wenn …“ fragt nach einer Regel, nicht nach Erlebtem. Ersatz: „Wann hast du zuletzt schlecht geschlafen, obwohl Sport geplant war? Was hast du dann gemacht?“ Nicht als „ungefragt“ zählen |
| 8 | neutral | zwei Fragen; in Ordnung |
| 9 | hypothetisch, verrät einen Teil der Idee | verstößt gegen die eigenen Regeln („nach Vergangenem fragen“, „Idee erst am Ende“). Ersatz: „Hat dir dein Arbeitgeber schon einmal ein Gesundheitsangebot oder eine App angeboten? Hast du es genutzt? Warum (nicht)?“ Die Wenn-Frage in den Abschluss nach der Idee verschieben |
| 10 | Wunschfrage | als Ausklang in Ordnung, nicht auswerten |

### B.4 Pitch

- 150 Wörter (Platzhalter als je ein Wort; mit ausgesprochenen Zahlen rund 153). Das liegt im Zielbereich 130–160, ist mit der verlangten Pause nach der Publikumsfrage aber eher 65–75 Sekunden.
- Sprechbar: ja, kurze Sätze (längster 16 Wörter). Stolperstelle: „Schichttakt“ direkt nach „mache ich“.
- Unbelegt oder falsch: „jeder Trainingsplan und jeder Kurs“ (H6), „Bezahlen sollen es nicht die Pflegekräfte“ (H5), „Ärztliche Leitlinien“ (M15), „5,7 Millionen“ (M1).

Fertiger Ersatz (144 Wörter, ohne den Satz zur Studie 135):

> Wer von euch hat schon mal nach einer Nachtschicht trainiert?
>
> In Deutschland arbeiten mehr als fünfeinhalb Millionen Menschen in Schicht. Die arbeitsmedizinische Leitlinie empfiehlt ihnen Sport. Aber fast alle Trainingspläne und Kurse gehen von festen Wochentagen aus. Wer Früh, Spät und Nacht im Wechsel hat, plant jede Woche neu – oder lässt es.
>
> Ich bin Anton, studiere hier Sportmanagement und kellnere in Spätschichten. Ich habe eine Lauf-App gebaut, die den Kalender liest und Einheiten nach offenen Regeln verschiebt. Daraus mache ich Schichttakt: ein Programm aus Ausdauer und Kraft, das sich nach dem Dienstplan richtet.
>
> Ich habe mit `[N]` Schichtarbeitenden gesprochen. `[x]` sagen: Es scheitert an der Planung.
>
> Als geprüfter Präventionskurs erstattet die Krankenkasse den größten Teil, oder der Arbeitgeber zahlt. Ob es wirkt, will ich mit einer Studie prüfen. Dafür suche ich eine Sportwissenschaftlerin und einen Betrieb für den ersten Test. Sprecht mich an.

### B.5 Sprache: beim ersten Auftreten nicht erklärte Begriffe

- **`research.md`:** BGF (ab Zeile 5 benutzt, erst in der Überschrift §4.3 ausgeschrieben), ZPP (nur in der Quellenliste ausgeschrieben), IKT, DiGA, RCT (in §1 als „randomisierte Studie“, in §2.5 als Kürzel), OR, RR, 95 %-KI, I², g (Effektgröße), Umbrella-Review, Adhärenz, BGM, GKV, vdek, MD Bund, B2B/B2C, USP, ISO 27001/27018, ECTS, DRKS, OSF, MDR, UVgO, TED, BMF, BFH, BfArM, IARC, AWMF/S2k, BAuA, VBG, EXIST, MVP, An-Institut, Vollzeitäquivalente.
- **`entscheidung.md`:** BGF (schon in der Kurzfassung), An-Institut, USP, TK, ZPP, GKV-Spitzenverband, RCT, BGM, ISO 27001, GdP, DBfK; im technischen Teil §1 EventKit, RLS, HealthKit/Health Connect, Capacitor, Preset, Diff-Screen, TestFlight (für Anton vertraut, für Dritte nicht).
- **`ideathlon-entwurf.md`:** fast durchgehend ausgeschrieben (gut). Unerklärt: USP, An-Institut, OpenMic, Mock-up, S2k/AWMF (nur in der Belegzeile), „BGF-Institut“ in Feld 6 vor der Erklärung.

### B.6 Advocatus Diaboli: Was spricht gegen die Empfehlung, und wird es gewichtet?

| Befund aus `research.md` | In `entscheidung.md` gewichtet? |
|---|---|
| Kein belegter Bewegungsmangel bei Schichtarbeitenden | nein (M4) |
| Einzige Feldstudie zum Training vor der Nachtschicht ohne Effekt; App-Studie ohne Wirkung an Nacht- und Spätschichten | ja (A1, A2, Kurzfassung) |
| Wirksam sind Programme im Betrieb, nicht digitale Freizeitangebote | nein (M5) |
| Kapitel 5 nur als fester Kurs; adaptive App = Kapitel 7 | nur als Umbau-Fall (H1) |
| Erstattung nur bei vollständiger Teilnahme; nur einmalige Erlöse | nein (M6) |
| Kursweg trägt „ein kleines Unternehmen“ (34.000–220.000 € Umsatz) | in der Kurzfassung nur indirekt („nur unter Bedingungen“) |
| App allein in der BGF nicht förderfähig; Kassen haben Gratis-Apps | ja (A5, Stufe 1 über Partner) |
| Idee nicht mehr unbesetzt; Code in Wochen kopierbar | ja (Kurzfassung) |
| SHIFT2HEALTH liefert die fehlende Evidenz womöglich zuerst | ja (A8, §4.1) |
| Pflege am schlechtesten erreichbar | teilweise (M2) |
| Solo, frühes Semester, MyRace nicht im Store | ja, deutlich |

Insgesamt ist `entscheidung.md` ehrlicher als die meisten Dokumente dieser Art; geschönt wird an drei Stellen: beim Stand der eigenen Technik (H2, H8, M20), bei der Größe des Problems (M4) und im Entwurf dort, wo Geplantes als Vorhandenes klingt (H7, M17).

---

## Gesamturteil

Die Empfehlung trägt als das, was sie im Kern ist: ein billiger, befristeter Test (bis 06.12. Interviews statt Code, Entscheidung Ende Januar) mit sauberem Rückfall auf einen Schicht-Modus in MyRace. Sie trägt nicht als Aussage „derselbe Rechenkern, nur neu verpackt“: Der Code liefert Kalender-Import, Termin-Tabelle und Tausch-Mechanik, aber die heutige Regel übersieht normale 8-Stunden-Schichten, hält den Tag nach der Nachtschicht für frei, die Tagesform ist nicht gebaut und der fertige Plan-Kern ist für einen Gesundheitskurs nicht nutzbar. Der empfohlene Geldweg (fester Kurs nach Kapitel 5) braucht diesen Kern zudem kaum, während der Weg, der ihn braucht (Kapitel 7), laut Recherche derzeit unerreichbar ist – dieser Zielkonflikt fehlt in der Kurzfassung. Die Zahlen und Paragrafen sind in sich stimmig und die Rechnungen korrekt; zu korrigieren sind vor allem die 5,7 Mio., die Preisannahme 129 €, die falsche Versionsangabe und der Aufwand für S1. Vor der Bewerbung müssen der Pitch-Satz zum Zahler, die Allaussage „jeder Trainingsplan“, die als vorhanden dargestellten Partner und Funktionen sowie das „ungefragt“-Kriterium des Leitfadens berichtigt werden; dann ist der Entwurf belastbar.
