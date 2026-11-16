# Schichtarbeiter-Idee – Entscheidung

> Stand: 16.11.2026, nach unabhängiger Nachprüfung. Grundlage: `research.md` (Fakten und Quellen; Änderungen der Nachprüfung dort in §9) und der Code auf `main` (Commit `78109aa`).
> Dieses Dokument bewertet. Wo etwas eine Einschätzung ist und kein Befund, steht es dabei.

## Kurzfassung für Anton

**Lohnt sich die Idee?** Für den Ideathlon ja. Als Unternehmen nur unter Bedingungen. Die Gruppe ist groß: rund 5,6 Millionen Menschen in Deutschland arbeiten in Schicht. Befragungen nennen immer wieder dieselben Hürden für Sport – unregelmäßige Pläne, Erschöpfung, Angebote zu Bürozeiten. Kleine Studien deuten darauf hin, dass Training Schichtarbeitenden hilft (Schlaf, Fitness), aber fast nur mit Anleitung vor Ort. Drei Dinge dämpfen: Es ist nicht belegt, dass Schichtarbeitende sich weniger bewegen. Es ist nicht belegt, dass Training nach Dienstplan mehr bringt als allgemeine Tipps. Und als reine App ist die Idee schwach: Seit 2025 gibt es mehrere kleine Apps dafür, und in Deutschland sind zwei Anbieter schon auf dem Weg über die Krankenkassen unterwegs (Carefit für die Pflege, AIMO als geprüfte Bewegungs-App) – beide ohne Trainingsplan nach Dienstplan.

**In welcher Form?** Als zweites Produkt auf der Technik von MyRace, nicht als neue App und nicht nur als Schalter in MyRace. Ehrlich gerechnet übernimmst du weniger, als es klingt: den Kalender-Import und die Technik zum Verschieben von Einheiten. Die Regeln für Schichten gibt es noch nicht; die „Tagesform“ ist geplant, aber nicht gebaut. Der erste Bauschritt ist derselbe wie für einen Schicht-Modus in MyRace – du verlierst nichts, wenn es dabei bleibt.

**Was dich unterscheiden würde**, ist kein Code, sondern drei Dinge, die du noch nicht hast: eine Studie mit der Spoho, ein Prüfsiegel der Krankenkassen und ein Partner mit Zugang zu Betrieben. Die Spoho bietet dafür gute Türen: Das Institut, das für die AOK Gesundheitsförderung in Betrieben macht, ist mit der Hochschule verbunden und trägt dort seit April 2026 eine Professur.

**Über welchen Finanzierungsweg?** In drei Stufen:
1. Ein kleiner Test mit einem Partner (dieses Institut, die TK oder eine Klinik). Kaum Geld, aber Daten.
2. Ein von den Kassen geprüfter Online-Kurs „Bewegung im Schichtdienst“ mit einer ausgebildeten Fachperson, etwa 100 bis 120 € je Teilnahme (Annahme); die Kasse erstattet den größten Teil. Der Kurs hat feste Inhalte, die App legt nur die Termine – was MyRace besonders macht, hilft dort wenig.
3. Lizenzen an Arbeitgeber und die Prüfung als eigenständige App. Erst hier zahlt sich die Technik aus. Das braucht Team, Studie und Fördergeld.

Nicht tragfähig: ein Abo für Endkunden als Hauptweg, die Kasse als Zahler eines Abos, eine App auf Rezept. Die Polizei käme nur über Geld des Landes in Frage, nicht über Krankenkassen.

**Größtes Risiko:** Die Zielgruppe nutzt es nicht. Bei Bewegungs-Apps hört mehr als die Hälfte innerhalb von drei Monaten auf, und die Kasse erstattet einen Selbstlernkurs nur, wenn man ihn ganz abschließt. Das zweitgrößte Risiko bist du selbst: frühes Semester, allein, MyRace noch nicht im Store – und bis zum ersten Kurs wären es je nach Ausbau rund 40 bis 75 volle Arbeitstage.

**Die nächsten drei Schritte:**
1. **Bis zur Abgabe am 04.12. kein Code.** Mindestens fünf Schichtarbeitende befragen (Leitfaden in §6), die Antworten der Kontakte auswerten und selbst in der Kurssuche deiner Krankenkasse nach „Schicht“ suchen.
2. **Lücken schließen:** Prof. Giurgiu (die neue Professur) und die Studie SHIFT2HEALTH in Bremen anschreiben, Carefit und AIMO ansehen, über deinen Gateway-Kontakt eine fertige Sportwissenschaftlerin oder einen Sportwissenschaftler suchen.
3. **Formular bis Freitag, 04.12., abschicken** (Frist ist der 06.12., ein Sonntag ohne Uhrzeit; Entwurf in `ideathlon-entwurf.md`). Am 31.01.2027 nach den Kriterien in §7 entscheiden: weitermachen, umbauen oder lassen.

---

## 1. Fit mit MyRace

Geprüft am Code auf `main` und an `docs/roadmap.md`, `docs/plan-spec.md`, `docs/readiness-spec.md`, `docs/readiness-plan.md`. In der Nachprüfung wurde jede Zeile noch einmal am Code gegengelesen; Kapazitätsrechnung und Termin-Erkennung wurden mit Beispielwerten ausgeführt (Protokoll: `anhang/pruefung/v6-konsistenz-code.md`).

**Das Wichtigste vorweg:** MyRace liefert echte Vorleistung (Kalender-Import, Termin-Tabelle, Tausch-Technik mit Prüfung und Bestätigung, Einwilligungen, Protokoll der Einheiten). Die heutigen **Regeln** passen aber nicht zu Schichtarbeit: Eine normale 8-Stunden-Schicht löst keinen Vorschlag aus, und der Tag nach einer Nachtschicht gilt als frei. Nutzbar ist die Mechanik, nicht die Regel.

### 1.1 Was sich nutzen lässt

| Baustein | Wo | Nutzen für Schichtarbeitende | Stand und Grenzen |
|---|---|---|---|
| Kalender-Import vom Gerät | `src/calendar/**` (EventKit, die Kalender-Schnittstelle von iOS; 28-Tage-Fenster) | Schichtkalender-Apps wie Supershift können Schichten in den Gerätekalender schreiben (bei Supershift nur in der bezahlten Pro-Version). Damit käme der Dienstplan ohne Arbeitgeber-Schnittstelle in die App | Code fertig; laut Roadmap Gerätetest offen (Schritt 4; die Roadmap ist möglicherweise nicht nachgezogen). **Der Import überspringt Ganztagstermine („Früh“, „N“) und abonnierte Kalender.** Ob der Supershift-Export dazu passt, ist nicht getestet |
| Erkennung von Arbeitsterminen | `src/calendar/eventClassifier.ts` | Titel mit „Schicht“ oder „Dienst“ werden meist als Arbeit eingeordnet | fertig, bisher ohne Wirkung auf die Planung. Einfache Teilwort-Suche mit fester Reihenfolge: „Spätdienst Uniklinik“ gilt als Studium, „Feuerwehr Wachdienst“ als Ehrenamt, Kürzel wie „N“ oder „Nachtwache“ werden nicht erkannt |
| Einheiten verschieben | `src/ai/mutations/assignSessionToBestCapacityDay.ts`, Wochen-Scan, Diff-Screen | Die Technik ist da: Die App legt eine Einheit auf einen anderen Tag derselben Woche, prüft die Planstruktur hart, warnt bei zu kurzen Erholungsabständen (lehnt dann aber nicht ab) und ändert nichts ohne Bestätigung | fertig bzw. Oberfläche in Arbeit. **Die Regel passt nicht:** Ein Konflikt entsteht erst, wenn mehr als 65 % des Tagesfensters belegt sind (rund 10,5 Stunden). Früh 6–14 und Spät 14–22 ergeben 50 % – kein Konflikt (so auch im Test `scanWeekForCalendarConflicts.test.ts`). Lockere Einheiten reagieren fast nie. Getauscht wird nur innerhalb einer Woche, nur ganze Tage |
| Termin-Tabelle | `weekly_schedule_blocks` (Migrationen 009/010) | einmalige und wöchentliche Blöcke; ein Schichtmuster ließe sich als Einzeltermine ablegen | vorhanden. Nur Wochenrhythmus (Rotationen wie 2-2-2-4 gehen nicht), kein Block über Mitternacht, keine Oberfläche zur Handeingabe |
| Regelwerk für Schlaf und Arbeit | `docs/readiness-spec.md` §7: kurze Ruhezeit unter 11 Stunden, Schlafgelegenheit, körperliche Schicht ab 6 Stunden, Etiketten per Rückfrage; Grund-Code `late_shift` im Typ angelegt (`src/readinessCore/types.ts`) | die fachliche Vorarbeit für „nach der Spätschicht anders als vor dem Frühdienst“ | Spec freigegeben, Fach-Review offen; im Code nur Typen und Schwellenwerte, keine Rechenlogik (Schritte 5–10 offen). Die Regeln sind für einzelne Schichten in einer sonst normalen Woche geschrieben; bei Vollzeit-Wechselschicht gälte fast jeder Diensttag als ungeeignet – sie müssen neu gesetzt werden |
| Auswertung der Uhr | `src/recovery/**` (live): Schlaf, Herzfrequenzvariabilität, Ruhepuls aus Apple Health | zählt auch Schlaf am Tag mit (alle Abschnitte auf den Aufwachtag) | vorhanden; iPhone und Apple Watch nötig |
| Check-in und Anstrengungsfrage | `src/features/checkin`, Migrationen 016/017 | misst Erschöpfung direkt, auch ohne Uhr | Anstrengungsfrage nach der Einheit ist live. Der Check-in ist in Production abgeschaltet und noch ohne Wirkung; er gilt nur bis 14 Uhr und müsste für Nachtdienste an die Aufwachzeit gebunden werden |
| Protokoll der Einheiten | `session_logs` (erledigt/übersprungen, Gefühl, Anstrengung 0–10) | Datengrundlage für Nutzungszahlen im Piloten und eine Vorher-Nachher-Auswertung | vorhanden |
| Plan-Datenmodell | `src/planV2/types.ts` | kennt Kraft, Rad und Schwimmen schon (speichern, anzeigen, verschieben); mehrere Pläne nebeneinander möglich | es fehlt der Erzeuger, nicht das Datenmodell |
| Bauweise „Spec, Invarianten, Tests“ | `src/planCore`, `docs/plan-spec.md` | ein offenes Regelwerk statt Blackbox | Muster vorhanden. Für einen Kurs nach Kapitel 5 zählt ein Manual mit Stundenplänen; das Regelwerk hilft erst bei einer App nach Kapitel 7 (Einschätzung) |
| Einwilligungen, Kontolöschung, Datentrennung je Nutzer | `src/features/aiConsent`, Zustimmung zu Gesundheitsangaben (auf `main` Version 1), Supabase RLS (Zugriffsregeln je Nutzer) | Grundlage für das Datenschutzpaket, das Arbeitgeber und Kassen verlangen | in `main`. Es fehlt die Datenschutz-Folgenabschätzung; sie ist bei Uhrdaten Pflicht, auch für MyRace selbst (`research.md` §4.8) |
| KI-Coach mit Einwilligung | `api/_lib/coachHandlers.js` | Erklärungen und Rückfragen; für Kassen eher Nebensache | läuft |

### 1.2 Was fehlt oder heute nicht passt

| Lücke | Befund am Code | Gewicht |
|---|---|---|
| **Nachtschicht wird heute falsch behandelt** | Das Tagesfenster ist werktags 06–22 Uhr, am Wochenende 07–23 Uhr (`src/scheduling/capacityScore.ts`). Termine über Mitternacht werden am Tageswechsel geteilt (`eventToScheduleBlocks.ts`); der Teil von 0 bis 6 Uhr liegt außerhalb des Fensters. Eine Nachtschicht 22–6 Uhr belegt werktags rechnerisch null Minuten (am Wochenende 60; bei 20:45–6:15 Uhr 90 von 960). Beide Tage gelten als frei – die Engine würde eine harte Einheit also **bevorzugt auf den Tag nach der Nachtschicht** legen. Die Readiness-Spec setzt die Schlafgelegenheit bei Nachtschicht ausdrücklich auf „unbekannt“ (§7.2) | hoch – Kern der Idee |
| **Normale Schichten lösen nichts aus** | 65-%-Regel, siehe §1.1 | hoch |
| **Kein Schichtmodell** | Kein Datentyp für Früh/Spät/Nacht/Frei, keine Rotationsmuster, kein Foto- oder PDF-Import, keine Handeingabe. Das Preset „Schichtarbeit“ ist eine Näherung „Mo–Fr 6–14 Uhr“ (`src/calendar/presets.ts`) | hoch |
| **Plan-Kern kennt nur feste Wochen** | `CoreInputs.availableDays` ist eine feste Menge von Wochentagen (`src/planCore/types.ts`). `PlanRules.maxMinutesByDay` existiert als Typ, die Regeln sind leer. Der Kalender wirkt nur nachträglich und 28 Tage weit. Die freigegebene Readiness-Entscheidung A19 („Woche für Woche planen wird nicht gebaut“) steht einer Planung nach Dienstfolge entgegen und bräuchte eine neue Entscheidung | hoch |
| **Plan-Kern kennt nur Laufen mit Rennziel** | 5 km bis Marathon, Renndatum Pflicht, 3–6 Lauftage. Der Kern erzeugt kein Krafttraining (`docs/plan-spec.md` §0), keinen Plan ohne Rennen, keinen Geh-Lauf-Einstieg (der Einsteiger-Modus setzt rund 10 km pro Woche voraus), keine Mindestdosis wie „150 Minuten pro Woche“. Phasen, Umfang und Renntempo sind laufspezifisch – für einen Gesundheitskurs ist `src/planCore` kaum wiederverwendbar | hoch für Option 1 und 2 |
| **Keine Uhrzeit** | Eine Einheit hat einen Tag, keine Uhrzeit. Erinnerungen kommen zu festen Zeiten (8:00 bzw. 7:30 Uhr) – da geht eine Nachtschicht gerade schlafen | mittel |
| **Nur iOS** | `@capacitor/ios`, HealthKit-Plugin; kein Ordner `android/`; Android steht unter „Post-TestFlight“. Kein Web-Zugang | hoch für Betriebe und Kassen |
| **Keine Funktionen für Betriebe** | keine Lizenzcodes, keine Gruppen, keine Gesamtauswertung | mittel (erst ab Stufe 3) |
| **Kein Kursformat, keine Bezahlung** | keine Module, keine Teilnahmebescheinigung, kein Kanal zur Fachperson mit 48-Stunden-Antwort, keine Fragebögen zu drei Messzeitpunkten, kein Kauf und keine Rechnung (bei Kauf in der iOS-App fällt die Apple-Provision an) | hoch für den Kassenweg |
| **MyRace selbst ist nicht fertig** | Apple-Developer-Account fehlt, TestFlight offen, Readiness-Kern nicht gebaut | Kapazitätsrisiko |

### 1.3 Grober Aufwand (Schätzung, nicht belegt)

In „Arbeitstagen“ wie im Readiness-Plan (ein Tag = ein konzentrierter Auftrag an Claude Code plus deine Abnahme; die Gerätetests waren bisher der Engpass).

| Paket | Inhalt | Aufwand |
|---|---|---|
| Vorlauf | Readiness-Schritte 5–10 und 12, die MyRace ohnehin plant (Schritt 12 setzt 7, 8 und 10 voraus, Schritt 10 die 9, Schritt 9 die 5, 6 und 7; `docs/readiness-plan.md`) | rund 19–24 Tage |
| S1 Schicht-Kern | Schichtmodell, Eingabe per Muster oder Kalender-Etikett (erstmals eine Eingabe-Oberfläche), Tageseignung mit Nachtschicht und Tagschlaf, neue Regeln nach Schichttyp, Wochengrenzen, Tests | 8–12 Tage für den Rechenteil; bis zu einem zeigbaren Schicht-Modus mit Vorlauf eher 27–36 Tage plus Gerätetests |
| S2 Gesundheitsplan | neuer Erzeuger: Plan ohne Rennziel, Kraft- und Einsteiger-Bibliothek, Planung nach Dienstfolge statt Wochentag | 15–25 Tage in der ersten Schätzung; die Nachprüfung hält 25–40 für realistischer (der Lauf-Kern allein war mit 21–25 Tagen geplant). Dazu fachliche Zuarbeit einer ausgebildeten Person |
| S3 Kursformat | 8–12 Module mit Inhalten, Teilnahmebescheinigung, Nachrichtenkanal zur Fachperson, Verwaltung für die Kursleitung, Bezahlung und Rechnung, Auswertungsfragebögen | 10–15 Tage plus Inhalte (Videos, Texte); eher mehr, weil Bezahlung und Nachrichtenkanal in der ersten Schätzung fehlten |
| S4 Android | Capacitor-Android, Health Connect statt HealthKit | 10–20 Tage; kein Android-Testgerät vorhanden |
| S5 Betriebe | Lizenzcodes, Gesamtauswertung mit Mindestgruppe (ab 7 Personen), Datenschutzpaket | 10–15 Tage plus Rechtsprüfung |

**Summen:** Option 3 braucht Vorlauf und S1 (rund 27–36 Tage). Option 2 bis zum ersten Kurs: als fester Kurs nach Kapitel 5 (Vorlauf, S1, S3; Inhalte von der Fachperson) **rund 37–51 Arbeitstage**; mit eigenem Gesundheitsplan-Erzeuger (zusätzlich S2) **52–76**, mit der höheren Schätzung für S2 rund 60–90 – neben Studium, Nebenjobs und den offenen MyRace-Punkten. Option 1 braucht alles und zusätzlich eine eigene App-Hülle.

Der feste Kurs ist der schnellere Weg zu Stufe 2: Die Fachperson trägt die Inhalte, die App braucht nur S1 und S3. Er nutzt aber wenig von dem, was MyRace kann (siehe §2).

---

## 2. Optionsvergleich

Punkte von 1 (schwach) bis 5 (stark). Die Punkte sind eine Einschätzung; die Begründung zählt mehr als die Summe.

| Kriterium | Option 1: eigenständige neue App | Option 2: Ableger auf derselben Technik (Kassen-/Betriebsvariante) | Option 3: MyRace bleibt Läufer-App mit Schicht-Modus |
|---|---|---|---|
| **USP (Alleinstellungsmerkmal) jenseits von Code** | 3 – nur wenn Studie und Zertifikat dazukommen; die App allein ist kopierbar | **4** – Studie plus Zertifikat plus Partner; setzt auf Vorhandenem auf. Heute ist davon nichts vorhanden | 1 – ein Feature, das WHOOP, Garmin oder Google jederzeit nachziehen können |
| **Finanzierbarkeit** | 3 – dieselben Wege wie Option 2, aber später | **3** – Kurs (Kasse erstattet), Arbeitgeber, später Lizenz; der Kurs trägt laut Recherche ein kleines Unternehmen, kein großes | 1 – nur Selbstzahler; Wettkampfvorbereitung passt nicht in die Kassenlogik |
| **Aufwand bis zu einem zeigbaren Stand** | 1 – alles neu, zwei Apps pflegen | 2–3 – S1 zeigt schon etwas; bis zum Kurs je nach Ausbau rund 40–75 Tage | **4** – Vorlauf plus S1 |
| **Passung zum Ideathlon** | 4 | **5** – Sport, Bewegung, Gesundheit; Anschluss an BGF-Institut und Präventionsforschung; kein vergleichbares Start-up im Spoho-Portfolio. Für StarS zählt zusätzlich Skalierbarkeit; die hat erst Stufe 3 (Lizenzen), nicht der Kurs | 2 – „Feature einer Lauf-App“ ist keine Gründungsidee |
| **Risiko** (5 = gering) | 1 – höchster Einsatz, MyRace bleibt liegen | 2–3 – hängt an drei Voraussetzungen, die es noch nicht gibt | **4** – wenig Einsatz, wenig Ertrag |
| **Synergie mit MyRace** | 1 | 3 – Kalender, Tausch-Technik, Einwilligungen, Protokoll; der Plan-Kern selbst hilft kaum. MyRace bekommt den Schicht-Kern mit | **5** |

### Empfehlung

**Option 2 als befristeter Test, gebaut in der Reihenfolge von Option 3.** Zuerst der Schicht-Kern (S1) in der gemeinsamen Codebasis, dann – nur wenn die Bedingungen unten erfüllt sind – der Ableger.

Begründung:
1. **Option 3 allein erfüllt dein Ziel nicht.** Du suchst einen USP, der nicht nur Code ist. Ein Schicht-Modus ist nur Code.
2. **Option 1 kannst du allein nicht stemmen.** Zwei Apps neben Studium und Kellnern sind eine zu viel.
3. **Option 2 fügt hinzu, was Wettbewerber nicht in drei Monaten kopieren:** Studie, Zertifikat, Partner. Das gilt aber für dich genauso – du hast sie auch noch nicht.
4. **Der erste Schritt ist ohne Reue.** S1 verbessert MyRace auch dann, wenn die Gründungsidee scheitert. Sportler im Schichtdienst fordern die Funktion in den Foren von Garmin.

**Der Zielkonflikt, den du kennen musst.** Der schnelle Geldweg (Kurs nach Kapitel 5 des Kassen-Leitfadens) verlangt feste Inhalte unter Führung einer Kursleitung. Sobald die App selbst plant und anpasst, prüfen die Kassen sie als App nach Kapitel 7 – mit eigenem Sicherheitszertifikat (ISO 27001) und Studie. Das heißt: In Stufe 2 ist dein Vorteil nicht die Technik, sondern Thema, Fachperson und Zugang. Die Technik zahlt sich erst in Stufe 3 aus. Die gute Nachricht aus der Nachprüfung: Kapitel 7 erlaubt künstliche Intelligenz und persönlich angepasste Inhalte ausdrücklich, und mit AIMO gibt es eine geprüfte Bewegungs-App ohne feste Module. Der Weg ist also gangbar – nur nicht allein und nicht jetzt.

**Die Bedingung.** Option 2 trägt nur, wenn drei Dinge dazukommen:
- eine **anerkannte Fachperson** (abgeschlossenes sportwissenschaftliches Studium) als Partnerin oder Mitgründer. Du selbst kannst das im Studium nicht sein, und dein eigener Abschluss deckt die Anforderungen später vermutlich nicht vollständig ab (`research.md` §4.2);
- ein **Institut für eine Begleitstudie** (Giurgiu, Biallas, Schaller);
- ein **Pilotpartner** mit Zugang zu Schichtarbeitenden (BGF-Institut, TK, eine Klinik).

Fehlen am 31.01.2027 Fachperson **oder** Institut, bleibt es bei Option 3 als Funktion von MyRace, und die Schicht-Idee ist als Gründung vom Tisch. Das wäre kein Scheitern, sondern das Ergebnis der Prüfung.

**Mit welcher Gruppe anfangen?**

| Gruppe | Spricht dafür | Spricht dagegen | Passender Zahler |
|---|---|---|---|
| Pflegekräfte im Krankenhaus | große Gruppe (in der Krankenpflege arbeiten rund 94 % in Schicht); Kassenkurs und Kassenbudget für Betriebe greifen beide; MEHRWERT:PFLEGE als Kanal; Krankenhäuser sind weniger zersplittert als Heime | Erschöpfung als Hauptbarriere; 49 % Teilzeit in der Pflege; Carefit wirbt dort schon | Kasse (Kurs, BGF), Arbeitgeber |
| Polizei NRW, Wach- und Wechseldienst | ein Arbeitgeber; Dienstsport verankert; die Spoho hat dort geforscht (Goldmann, Projekt bis 02/2024) | klein (rund 12.000 Stellen, Stand 2021); Personalrat muss auch einem Piloten zustimmen; **kein Kassenweg** – Polizeivollzugsbeamte haben freie Heilfürsorge und sind nicht gesetzlich versichert (geprüft, `research.md` §4.4) | nur das Land NRW direkt |

Für das Bewerbungsformular empfehle ich **Pflegekräfte im Krankenhaus als Start** und die Polizei als zweites Testfeld. Das weicht von der Reihung in `research.md` §2.2 ab (dort Polizei vor Pflege): Dort ging es um den Zugang, hier um den Zahler. Die Krankenhaus-Pflege ist die einzige Gruppe, bei der Kassenkurs und Kassenbudget zusammenpassen. Wenn die Interviews zeigen, dass Pflegekräfte kein strukturiertes Training wollen, die Polizei aber schon, drehst du es um – dann aber ohne Kassen.

---

## 3. Die riskantesten Annahmen

Sortiert nach „wenn das falsch ist, ist die Idee tot“.

| Nr. | Annahme | Was dafür spricht | Was dagegen spricht | Wie testen |
|---|---|---|---|---|
| A1 | **Schichtarbeitende wollen strukturiert trainieren, nutzen dafür regelmäßig eine App und halten ein Programm über 8–12 Wochen durch** – auch die, die heute wenig Sport machen | Barrieren-Studien nennen Planung als Hürde; Forenwünsche bei Garmin; kleine Studien zeigen Nutzen von Training für Schlaf und Fitness | Erschöpfung ist die Hauptbarriere. Gewirkt haben bisher vor allem angeleitete Programme vor Ort mit bezahlter Zeit und Rückhalt der Leitung, nicht digitale Angebote für die Freizeit (Demou 2018). Bei Bewegungs-Apps hören 54–75 % in rund 100 Tagen auf. In der einzigen Schicht-App-Studie, die die Recherche im Original lesen konnte (51 Bergleute, 24 Tage), stieg die Bewegung an Nacht- und Spätschichten nicht. Die Kasse erstattet einen Selbstlernkurs nur bei vollständigem Abschluss. Forenwünsche kommen von Sportlern, nicht von Wenigbewegten | Interviews; später Pilot mit Nutzungs- und Abschlussquote |
| A2 | **Planung nach Dienstplan führt zu mehr regelmäßiger Bewegung als allgemeine Tipps** | plausibel aus Schlaf- und Leistungsforschung | nicht belegt; keine Studie prüft eine App, die Training am Dienstplan ausrichtet; die einzige gefundene randomisierte Studie zum Trainingszeitpunkt an echten Schichtarbeitenden (bewusst sehr leichtes Training vor der Nachtschicht) fand keinen Effekt | Einschätzung der Fachkontakte; Begleitstudie |
| A3 | **Ein am Dienstplan ausgerichtetes Programm ist zertifizierbar** (Online-Kurs nach Kapitel 5 mit flexibler Terminierung oder App nach Kapitel 7) | Kapitel 7 erlaubt ausdrücklich KI und starke Individualisierung; AIMO als Präzedenzfall. In Kapitel 5 ist ein abweichender Rhythmus begründbar. Schichtarbeitende kommen im Leitfaden mehrfach vor, im Betriebsteil sogar als Zielgruppe digitaler Angebote | Kapitel 5 erlaubt nur feste Module. Übernimmt die App Aufgaben der Kursleitung, gilt Kapitel 7 mit ISO 27001 und Studie. Wo die Grenze bei automatischer Terminplanung liegt, ist offen. Zum Dienstplan sagt der Leitfaden nichts | ZPP, GKV-Spitzenverband, Klein (TK) |
| A4 | **Du findest eine anerkannte Fachperson und ein Institut** | Spoho-Umfeld; StarS nennt Mitgründersuche als Ziel; die Arbeitsgruppe Giurgiu arbeitet an Bewegung, die über Uhren im richtigen Moment ausgelöst wird | bisher niemand angesprochen bzw. keine Zusage; das Zertifikat hängt an der Person (wechselt sie, ist ein neuer Kurseintrag nötig) | Gateway-Kontakt, Biallas, Giurgiu |
| A5 | **Ein Arbeitgeber oder BGF-Partner setzt ein digitales Schicht-Bewegungsangebot ein und zahlt dafür** | Kassen geben in Krankenhaus und Pflege weniger aus als vorgesehen; Bewegung kommt in 62 % der verhaltensbezogenen BGF-Maßnahmen vor (2024); der Leitfaden nennt Schichtarbeitende als Zielgruppe digitaler BGF | Kassen haben eigene Apps und feste Partner; sie kaufen über Ausschreibungen mit Umsatzhürden und langjährige Rahmenverträge (für die Pflege 2026 gerade neu ausgeschrieben); isolierte Angebote Externer sind ausgeschlossen; fast die Hälfte der befragten Organisationen hat unter 10.000 € oder kein BGM-Budget; Carefit wirbt um dasselbe Budget | BGF-Institut, Klein, Krämer, Kliniken, Stadt Köln |
| A6 | **Beschäftigte bekommen ihren Dienstplan mit wenig Aufwand in die App** | Schichtkalender-Apps schreiben in den Gerätekalender; Muster sind einfach einzugeben | kein öffentlicher Kalender-Export der Dienstplansysteme gefunden; der Supershift-Export kostet Geld; der Import von MyRace überspringt Ganztagstermine und Kalender-Abos; Pläne ändern sich kurzfristig | Interviewfragen 1 und 2; Supershift-Export selbst ausprobieren |
| A7 | **Betriebsrat oder Personalrat stimmen zu, und Beschäftigte vertrauen einer vom Arbeitgeber bezahlten Gesundheits-App** | „Arbeitgeber zahlt, sieht aber nichts“ ist rechtlich möglich (Einschätzung) | Gesundheits- und Dienstplandaten sind heikel; im EU-Projekt Shift2Health heißt ein Themenfeld der Befragungen „Techno-Fassade“ (nicht näher erläutert); in NRW ist der Personalrat schon beim Piloten zu beteiligen | GdP, Interviewfrage 8, Kliniken |
| A8 | **Du bist schnell genug und hast die Zeit** – bevor WHOOP, Garmin oder Google die Funktion nachziehen und bevor Carefit oder AIMO das Feld bei den Kassen besetzen | Zertifikat und Studie schützen, sobald sie da sind | frühes Semester, allein, MyRace nicht im Store; je nach Ausbau rund 40–75 Arbeitstage bis zum ersten Kurs; Kapitel 7 kostet 12–18 Monate; eine Studie mit Studierenden nennt fehlende Zeit neben Studium und Job als Hauptgrund, warum aus Gründungsabsicht nichts wird | ehrlicher Zeitplan; Entscheidung am 31.01. |

---

## 4. Welcher Kontakt testet welche Annahme?

| Nr. | Kontakt | Testet | Worauf in der Antwort achten |
|---|---|---|---|
| 1 | Dr. Krämer (BGM der DSHS) | A5, A7 | Wer entscheidet wirklich, wer bringt Vorschläge ein, welche Rolle hat die TK? |
| 2 | Markus Klein (TK) | A5, A3 | Fragen Betriebe mit Schicht nach Bewegung? Nennt er Bedingungen (Zertifikat, Evaluation, Datenschutz) oder winkt er ab („haben wir schon“)? |
| 3 | BGF-Institut | A5, A1 | Woran scheitern Angebote konkret? Gibt es Interesse an einem Baustein oder Piloten? Wird jemand genannt? Schichtarbeit steht bisher nicht in ihrem Leistungskatalog |
| 4 | MEHRWERT:PFLEGE | A1, A5 | Ist Bewegung im Schichtdienst ein Thema der Einrichtungen oder nachrangig? Kennen sie Carefit? Vermittlung von Pflegekräften? |
| 5 | Dr. Biallas | A2, A4 | Hält sie den Ansatz für tragfähig? Ist eine Abschlussarbeit oder Studie denkbar – und mit wem? |
| 6 | Dr. Goldmann | A1, A6 | Wie trainieren Beamte im Wechseldienst heute? Zugang zu Befragten? |
| 7 | GKV-Spitzenverband | A3 | Klare Aussage zur individuellen Anpassung an den Dienstplan |
| 8 | ZPP | A3 | abweichender Rhythmus; Grenze zwischen Kapitel 5 und 7 bei automatischer Terminplanung; Anschlussangebot; Zahl der anerkannten App-Konzepte |
| 9 | BKK Dachverband | A5, A1 | Wird die Broschüre genutzt? Gibt es Nachfrage nach mehr? |
| 10 | Prof. Froböse | A1, A2 | Was braucht ein Angebot, damit es im Alltag genutzt wird? |
| 11 | Dr. Quittmann | A2 | fachliche Regeln zur Belastungssteuerung bei wechselndem Schlaf |
| 12 | Prof. Kolbe-Alexander | A1, A2 | Sie ist Mitautorin der Meta-Analyse und der Schicht-App-Studie: Warum wirkte die App an Nachtschichten nicht? |
| 13 | Prof. Langhoff | A6, A1 | Wie planbar sind Dienste bei der Feuerwehr? Wie stehen Dienstpläne den Leuten zur Verfügung? |
| 14 | DBfK Nordwest | A1 (Zugang) | Aufruf im Newsletter ja oder nein |
| 15 | Uniklinik Köln | A5, A6, A7 | Wer ist zuständig? Welches Dienstplansystem, mit Kalender-Export? Wie steht die Personalvertretung dazu? |
| 16 | Kliniken der Stadt Köln | A5, A6, A7 | wie 15 |
| 17 | Stadt Köln, BGM (Berufsfeuerwehr) | A5, A7 | Interesse, Zuständigkeit, Personalrat; sind die Feuerwehrbeamten gesetzlich versichert oder über Beihilfe? |
| 18 | AOK Rheinland/Hamburg | A5, A3 | nur falls das BGF-Institut schweigt; die AOK arbeitet bei Kursen mit Gutscheinen und Partnern – wie wird man Partner? |
| 19 | Prof. Schaller | A2, A3 | Welches Studiendesign reicht für eine Kassenzertifizierung, mit welchem Aufwand? |
| 20 | Dr. Sweeney | A1, A2 | Was hätte ihren Befragten geholfen – Planung oder etwas anderes? |
| 21 | GdP NRW | A1, A7 | Sicht der Beschäftigtenvertretung auf eine solche App; Zugang zu Befragten |
| 22 | Pflegenetzwerk Deutschland | A1 (Zugang) | Aufruf ja oder nein |
| 23 | Runner's-World-Forum | A1, A6 | Wie planen Läufer im Schichtdienst heute, was nutzen sie? |

### 4.1 Lücken, die die 23 Kontakte nicht schließen

| Lücke | Warum sie zählt | Vorschlag |
|---|---|---|
| **A1 bei Wenigbewegten** | Das Forum erreicht nur Leute, die schon laufen. Die Kassen bezahlen aber Angebote für Menschen mit Bewegungsmangel | Interviews gezielt über MEHRWERT:PFLEGE, DBfK, GdP gewinnen; mindestens die Hälfte der Befragten sollte keinen regelmäßigen Sport machen |
| **A4 Fachperson** | Biallas testet nur den Instituts-Teil; die Fachperson testet kein Kontakt, und ohne sie gibt es kein Zertifikat | Gateway-Kontakt fragen; Nachricht an Absolventinnen und Absolventen des M.A. Rehabilitation, Prävention und Gesundheitsmanagement |
| **Prof. Dr. Marco Giurgiu fehlt** | Stiftungsprofessur für Bewegungsbezogene Präventionsforschung an der Spoho, getragen vom BGF-Institut; arbeitet mit Wearables im Betrieb | anschreiben – inhaltlich der passendste Kontakt an der Hochschule, für Studie (A2, A4) und Brücke zum BGF-Institut (A5) |
| **SHIFT2HEALTH (Uni Bremen)** | einzige gefundene laufende Studie mit App für Nachtschichtarbeitende und deutschen Standorten; Schlaf ist das Hauptziel, Bewegung ein Baustein | an schichtarbeit@uni-bremen.de schreiben (Dr. Hannah Jilani, Urte Klink): Was planen sie nach Studienende? Welche Erfahrungen mit Teilnahme und Abbruch? |
| **Carefit und AIMO** | die zwei Anbieter, die einer Kasse oder Klinik als „gibt es schon“ einfallen | beide ansehen; im Gespräch erklären können, was dein Angebot anders macht (Trainingsplan nach Dienstplan) – und offen sein für Zusammenarbeit |
| **Kurssuche der Kassen** | ob es schon einen Bewegungskurs für Schichtarbeitende gibt, ließ sich nicht maschinell prüfen | selbst in der Kurssuche von TK, AOK oder Barmer nach „Schicht“ suchen (10 Minuten) |
| **Betriebsrat und Datenschutz (A7)** | Nur die GdP deckt die Sicht der Beschäftigtenvertretung ab | in den Klinik-Antworten nach der Mitarbeitervertretung fragen |
| **Zahlungsbereitschaft** | niemand wird nach Geld gefragt | Interviewfrage 7 |

### 4.2 Hinweise zu den noch nicht verschickten Mails

- **GKV-Spitzenverband (Nr. 7):** Die Frage ist gut. Zur Sicherheit „Kapitel 7, digitale Angebote in der individuellen verhaltensbezogenen Prävention“ schreiben, weil die Unterkapitel in FAQ und aktueller Fassung unterschiedlich nummeriert sind.
- **ZPP (Nr. 8):** Die zweite Frage ist durch die Recherche schon beantwortet (ja: ohne Studie ein Jahr vorläufig, wenn ein registriertes Studiendesign vorliegt). Ersetze sie durch die präziseren Fragen aus `research.md` §4.2: (1) Erkennt die ZPP Schichtdienst als fachliche Begründung für eine abweichende Frequenz bei Online-Kursen an? (2) Ab wann gilt automatische Terminplanung nach Dienstplan als Aufgabe der Kursleitung, sodass Kapitel 7 statt Kapitel 5 greift?
- **Froböse (Nr. 10):** Er ist emeritiert, der Abteilung aber weiter zugeordnet; die Abteilung leitet laut DSHS-Seite Prof. Wollesen. In der Mail nichts zur Leitungsrolle von Frau Dr. Biallas behaupten.
- **Stadt Köln (Nr. 17) und GdP (Nr. 21):** Für Polizei und Feuerwehr nicht mit Krankenkassen argumentieren; dort zahlt, wenn überhaupt, der Dienstherr.
- **Runner's-World-Forum (Nr. 23):** Die Antworten dort beschreiben Läufer, nicht die Zielgruppe der Kassen. Getrennt auswerten.

---

## 5. Worauf du in den Antworten insgesamt achten solltest

1. **Sagen die Kassen- und BGF-Leute „interessant“ oder nennen sie einen nächsten Schritt?** Ein Name, ein Termin, eine Bedingung ist ein Signal. „Spannende Idee, viel Erfolg“ ist keines.
2. **Nennt jemand von sich aus die Hürde, die du lösen willst (Planung)?** Oder nennen alle etwas anderes – Erschöpfung, Personalmangel, fehlende Zeit im Dienst? Dann löst die App das falsche Problem.
3. **Verweist dich jemand an eine Stelle, die das schon macht** (zum Beispiel Carefit, AIMO oder ein Kassenprogramm)? Dann dort nachfassen; das ist Wettbewerb oder ein Partner.

---

## 6. Interviewleitfaden für Schichtarbeitende

Ziel: zehn Gespräche, mindestens fünf vor dem 04.12. Dauer etwa 15 Minuten. Regeln: nach Erlebtem fragen, nicht nach Wünschen oder Regeln. Die Idee erst am Ende nennen. Mitschreiben, was die Person **getan** hat. Mindestens die Hälfte der Befragten ohne regelmäßigen Sport, mindestens zwei Berufsgruppen, keine Freunde oder Familie.

Einstieg: „Ich studiere an der Sporthochschule und möchte verstehen, wie Bewegung und Schichtdienst im Alltag zusammengehen. Es gibt keine richtigen oder falschen Antworten, und ich verkaufe nichts.“

1. Wie sieht dein Dienst aus: welche Schichten, in welcher Folge? Wie weit im Voraus kennst du deinen Plan, und wie oft ändert er sich kurzfristig?
2. Wo steht dein Dienstplan – auf Papier, in einer App des Arbeitgebers, im eigenen Kalender, in einer Schichtkalender-App oder woanders?
3. Erzähl mir von deinen letzten sieben Tagen: Wann hast du dich bewegt oder Sport gemacht, und was genau?
4. Wann hattest du dir zuletzt vorgenommen, dich zu bewegen, und es ist nichts daraus geworden? Was ist passiert?
5. Wie entscheidest du an einem Tag, ob und was du machst? Erzähl mir vom letzten Mal.
6. Hast du in den letzten zwei Jahren etwas ausprobiert, um dich regelmäßiger zu bewegen (Studio, Verein, App, Kurs)? Was machst du davon noch, was nicht mehr, und warum?
7. Wofür gibst du im Moment Geld aus, wenn es um Sport oder Gesundheit geht? Hast du schon einmal einen Gesundheitskurs der Krankenkasse genutzt?
8. Hat dir dein Arbeitgeber schon einmal ein Gesundheitsangebot oder eine App angeboten? Hast du es genutzt? Warum (nicht)?
9. Wann hast du zuletzt schlecht geschlafen, obwohl Bewegung geplant war? Was hast du dann gemacht?
10. Wenn du eine Sache ändern könntest, damit Bewegung im Schichtdienst leichter wird: Was wäre das? (Ausklang, wird nicht ausgewertet.)

Abschluss: Idee in zwei Sätzen nennen. Reaktion wörtlich notieren. Dann: „Würdest du das nutzen, wenn dein Arbeitgeber es bezahlt – und was würde dich abhalten?“, „Dürfte ich dich anschreiben, wenn es etwas zum Ausprobieren gibt?“ und „Wen sollte ich noch fragen?“

**Auswertung je Interview (ja/nein).** „Ungefragt“ heißt: Die Person nennt den Grund in den Antworten auf Frage 3, 4 oder 5 von sich aus, ohne dass du nach Gründen, Planung oder Schlaf fragst. Dass es um Schichtdienst geht, weiß sie aus Einstieg und Frage 1; das lässt sich nicht vermeiden.

| Merkmal | Aus Frage |
|---|---|
| nennt ungefragt Planung, wechselnde Zeiten oder Unregelmäßigkeit als Grund | 3, 4, 5 |
| nennt ungefragt Erschöpfung oder Schlaf als Grund | 3, 4, 5 |
| welcher der beiden Gründe wiegt für die Person schwerer? (Planung / Erschöpfung / anderes) | 4, 5 |
| hat schon mindestens einen eigenen Lösungsversuch unternommen | 6 |
| macht derzeit regelmäßig Sport (mindestens einmal pro Woche) | 3 |
| Dienstplan liegt digital vor oder folgt einem festen Muster | 1, 2 |
| gibt heute Geld für Sport oder Gesundheit aus | 7 |
| nennt Bedenken wegen Arbeitgeber und Daten | 8, Abschluss |
| gibt Kontakt für einen Test | Abschluss |

---

## 7. Weitermachen, umbauen oder lassen

Die Schwellen sind eine Setzung, damit die Entscheidung vorher feststeht und nicht nachträglich schöngeredet wird. Stichtag: **31.01.2027** (nach dem Ideathlon). Zwischenstand für das Bewerbungsformular: 04.12.2026. Gezählt wird in Anteilen, damit die Regel auch bei weniger als zehn Gesprächen gilt; unter fünf Gesprächen wird nicht entschieden, sondern weiter befragt.

### Weitermachen mit Option 2, wenn alles Folgende zutrifft

| Kriterium | Schwelle |
|---|---|
| Problem bestätigt | mindestens 60 % der Befragten nennen ungefragt Planung oder Unregelmäßigkeit – darunter mindestens drei Personen ohne regelmäßigen Sport |
| Planung wiegt | bei mindestens so vielen Befragten wiegt Planung schwerer wie Erschöpfung |
| Leidensdruck | mindestens 50 % haben einen eigenen Lösungsversuch hinter sich |
| Bereitschaft | mindestens 30 % geben ihren Kontakt für einen Test |
| Dienstplan verfügbar | mindestens 70 % haben den Plan digital oder als festes Muster |
| Kassen-Passung | ZPP oder GKV-Spitzenverband haben geantwortet und schließen ein am Dienstplan ausgerichtetes Programm nicht grundsätzlich aus. Ohne Antwort bis 31.01. gilt das Kriterium als offen: einmal telefonisch nachfassen (ZPP: 0201 5658290), dann entscheiden |
| Fachliche Rückendeckung | mindestens eine Person aus der Wissenschaft hält den Ansatz schriftlich oder im Gespräch für tragfähig und nennt eine Form der Betreuung (Abschlussarbeit, Studie, Sprechstunde) |
| Zahler | mindestens ein Kontakt aus Kasse, BGF oder Arbeitgeber nennt einen konkreten nächsten Schritt (Name, Termin oder Bedingung) |
| Fachperson | mindestens eine Person mit abgeschlossenem sportwissenschaftlichem Studium hat einem Gespräch über eine Mitarbeit zugesagt |

### Noch nicht entscheiden, wenn

- 30 bis 59 % die Planung nennen: fünf weitere Gespräche führen, dann neu zählen.
- weniger als vier der 23 Kontakte geantwortet haben: Dann liegt es eher am Zugang als an der Idee – erst nachfassen.
- das Problem bestätigt ist, aber genau eine der Schwellen Leidensdruck, Bereitschaft, Dienstplan oder Zahler verfehlt wird: fünf weitere Gespräche bzw. einmal nachfassen, dann neu zählen. Werden zwei oder mehr verfehlt: Option 3.

### Umbauen, wenn das Problem bestätigt ist, aber ein Baustein kippt

| Befund | Umbau |
|---|---|
| Nur die Sportlichen nennen die Planung (weniger als drei Wenigbewegte) | Option 3: Schicht-Modus als Funktion von MyRace, Selbstzahler. Als Gründungsidee für StarS dann zu schwach |
| Polizei und Feuerwehr wollen es, die Pflege nicht | Startgruppe wechseln; Zahler wird der Dienstherr, der Kassenweg entfällt |
| Kassen sagen „nur als fester Kurs“ | das ist nach der Recherche der wahrscheinliche Fall: Produkt ist ein Online-Kurs mit Planungshilfe; die App ist Werkzeug, nicht Produkt. Entscheidend wird dann die Fachperson |
| Arbeitgeber wollen es, Kassen nicht | direkter Pilot mit einem Betrieb; Zertifikat später |
| Erschöpfung wiegt bei mehr Befragten schwerer als Planung | anderes Feld mit anderer Fachqualifikation und starkem Wettbewerb (Timeshifter, Schlafkurse der Kassen, Carefit). Für dich vermutlich das Ende der Idee |

### Lassen, wenn eines davon zutrifft

- Weniger als 30 % der Befragten nennen ungefragt Planung oder Unregelmäßigkeit.
- Bis 31.01. liegt von keinem Fach- oder Kassenkontakt eine Antwort vor, die eine Bedingung, einen Namen oder einen nächsten Schritt nennt – obwohl mindestens vier geantwortet haben.
- ZPP und GKV-Spitzenverband schließen das Konzept aus **und** kein Arbeitgeber zeigt Interesse.
- Am 31.01. fehlt die Fachperson oder das Institut (siehe §2, „Die Bedingung“). Dann bleibt Option 3.
- MyRace ist bis dahin nicht in TestFlight, und du merkst, dass die Schicht-Idee Zeit vom Launch abzieht. Dann hat MyRace Vorrang.

**Was in jedem Fall bleibt:** die Teilnahme am Ideathlon (frühphasig, Feedback, erspart die Ideenskizze für StarS, nicht das Auswahlgespräch), die Kontakte zu BGF-Institut und TK und der Schicht-Kern als künftige Funktion von MyRace.

---

## 8. Annahmen und Entscheidungen

Getroffen ohne Rückfrage; bitte gezielt widersprechen.

| Nr. | Annahme oder Entscheidung | Folge, falls falsch |
|---|---|---|
| 1 | Du bist zu zehn Interviews und später zu einem kleinen Piloten mit Begleitstudie bereit (bei der Ideensuche hattest du Feldtests zunächst ausgeschlossen – ohne einen kleinen Piloten gibt es aber weder Nutzungsdaten noch Studie) | Ohne Pilot und Studie trägt Option 2 nicht; dann bleibt Option 3 |
| 2 | Bis zur Abgabe am 04.12. entsteht kein Code für die Schicht-Idee; bis zum Ideathlon höchstens ein klickbarer Entwurf ohne App-Code. Der Fahrplan von MyRace (Readiness, TestFlight) bleibt unberührt | – |
| 3 | Der Ableger bekommt einen eigenen Namen; „Race“ passt nicht zu einem Angebot, das die Kassen als Gesundheitssport prüfen | bei Verzicht auf den Kassenweg unerheblich |
| 4 | Startgruppe im Entwurf: Pflegekräfte im Krankenhaus; Polizei NRW als zweites Testfeld | Formularfelder 3, 7 und 8 anpassen |
| 5 | Aufwandsschätzungen in §1.3 und alle Zeitangaben bis zum ersten Euro sind Schätzungen | Reihenfolge der Stufen bleibt, Dauer ändert sich |
| 6 | Preise sind geschätzt: Kurs rund 100–120 € (gerechnet mit 99–119 €; Vergleichspreise 69–130 €), Arbeitgeberlizenz 1–3 € je berechtigter Person und Monat (belegtes Band 0,5–3 €) | Marktgröße in `research.md` §4.9 verschiebt sich |
| 7 | **Semester:** Im Auftrag stand „2. Semester“. Nach deinem Studienbeginn im Wintersemester 2025/26 wäre das laufende Semester das dritte. Die Dokumente schreiben deshalb „frühes Semester“ bzw. im Entwurf einen Platzhalter | bitte selbst eintragen |
| 8 | Die Punkte im Optionsvergleich und die Schwellen in §7 sind Setzungen | – |
| 9 | Die erste Fassung entstand ohne zweite Suche (Suchkontingent erschöpft). Am 16.11. haben sechs unabhängige Prüfungen nachgeprüft; die Befunde sind eingearbeitet (`research.md` §9). Alle Zahlen und Zitate sind weiterhin maschinell ausgelesen | Kernzahlen vor dem Poster im Original nachschlagen (`research.md` §8) |
| 10 | Zusätzlich zu den drei beauftragten Dokumenten liegen Rohbefunde und Prüfprotokolle unter `anhang/` | kann gelöscht werden |
| 11 | Rechtliche und steuerliche Aussagen geben den gelesenen Stand wieder und ersetzen keine Beratung | vor einem Vertrag mit Arbeitgeber oder Kasse prüfen lassen |
| 12 | Die Uhr- und Kalenderfunktionen von MyRace sind laut Roadmap auf dem iPhone noch nicht abgenommen; die Fit-Analyse beschreibt den Code, nicht geprüftes Verhalten auf dem Gerät | Aufwand S1 steigt |
| 13 | Die Fit-Analyse beschreibt `main` (`78109aa`). Was auf nicht gemergten Branches liegt (z. B. Uhr-Signale, neuere Zustimmungstexte), ist nicht berücksichtigt | einzelne Zeilen in §1.1 wären günstiger |
