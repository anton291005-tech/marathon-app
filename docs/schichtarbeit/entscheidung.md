# Schichtarbeiter-Idee – Entscheidung

> Stand: 16.11.2026. Grundlage: `research.md` (Fakten und Quellen) und der Code auf `main` (Commit `78109aa`).
> Dieses Dokument bewertet. Wo etwas eine Einschätzung ist und kein Befund, steht es dabei.

## Kurzfassung für Anton

**Lohnt sich die Idee?** Für den Ideathlon ja. Als Unternehmen nur unter Bedingungen. Das Problem ist echt und groß: Rund 5,7 Millionen Menschen in Deutschland arbeiten in Schicht, und Studien nennen immer dieselben Hürden für Sport – unregelmäßige Pläne, Erschöpfung, Angebote zu Bürozeiten. Aber: Als reine App ist die Idee schwach. 2026 sind mehrere kleine Apps erschienen, die genau das tun, und der Programmierteil ist in wenigen Wochen nachgebaut. Außerdem ist nicht belegt, dass Training nach Dienstplan mehr bringt als allgemeine Tipps.

**In welcher Form?** Als zweites Produkt auf dem Rechenkern von MyRace – nicht als ganz neue App und nicht nur als Schalter in MyRace. Derselbe Kalender, dieselbe Tagesform, dieselbe Logik zum Verschieben von Einheiten. Anders sind Inhalt (Gesundheitssport mit Ausdauer und Kraft statt Wettkampfvorbereitung), Verpackung (ein Programm über 8 bis 12 Wochen) und Zahler. Der erste Bauschritt ist derselbe wie für einen Schicht-Modus in MyRace; du verlierst also nichts, wenn es beim Modus bleibt.

**Der USP, der nicht aus Code besteht**, sind drei Dinge, die du heute noch nicht hast: eine Studie mit der Spoho, ein Zertifikat der Krankenkassen und ein Partner mit Zugang zu Betrieben. Die Spoho bietet dafür ungewöhnlich gute Türen (das BGF-Institut der AOK ist An-Institut und bezahlt dort seit April 2026 eine Professur für Bewegung und Prävention).

**Über welchen Finanzierungsweg?** In drei Stufen:
1. Ein kleiner Pilot über einen Partner (BGF-Institut, TK oder eine Klinik). Bringt kaum Geld, aber Daten.
2. Ein zertifizierter Online-Kurs „Bewegung im Schichtdienst“ mit einer ausgebildeten Fachperson. Etwa 100 € je Teilnahme, die Kasse erstattet den größten Teil, Arbeitgeber können ihn steuerfrei bezahlen. Machbar in vier bis acht Monaten.
3. Lizenzen an Arbeitgeber und später die Zertifizierung als App. Das braucht ein Team, eine Studie und Fördergeld.

Nicht tragfähig: ein Abo für Endkunden als Hauptweg, die Kasse als Zahler eines Abos, eine App auf Rezept.

**Größtes Risiko:** Die Zielgruppe nutzt es nicht. Wer nach der Nachtschicht erschöpft ist, öffnet keine weitere App. In der einzigen passenden Studie stieg die Bewegung gerade an Nacht- und Spätschichten nicht. Das zweitgrößte Risiko bist du selbst: zweites Semester, allein, MyRace noch nicht im Store.

**Die nächsten drei Schritte:**
1. **Bis 06.12. kein Code.** Zehn Schichtarbeitende befragen (Leitfaden in §6), mindestens fünf vor der Frist, und die Antworten der Kontakte zählen. Das Bewerbungsformular fragt genau danach.
2. **Drei Lücken schließen:** Prof. Giurgiu (neue Professur, vom BGF-Institut getragen) und das Projekt SHIFT2HEALTH der Uni Bremen anschreiben; über deinen Gateway-Kontakt eine Absolventin oder einen Absolventen der Sportwissenschaft als Fachpartner suchen.
3. **Formular bis 06.12. abschicken** (Entwurf in `ideathlon-entwurf.md`). Danach nach den Kriterien in §7 entscheiden: weitermachen, umbauen oder lassen – spätestens Ende Januar.

---

## 1. Fit mit MyRace

Geprüft am Code auf `main` und an `docs/roadmap.md`, `docs/plan-spec.md`, `docs/readiness-spec.md`, `docs/readiness-plan.md`.

### 1.1 Was sich direkt nutzen lässt

| Baustein | Wo | Nutzen für Schichtarbeitende | Stand |
|---|---|---|---|
| Kalender-Import vom Gerät | `src/calendar/**` (EventKit, 28-Tage-Fenster) | Schichtkalender-Apps wie Supershift exportieren in den Gerätekalender. Damit kommt der Dienstplan ohne Arbeitgeber-Schnittstelle in die App | Code fertig, Gerätetest offen (Roadmap Schritt 4) |
| Erkennung von Arbeitsterminen | `src/calendar/eventClassifier.ts` | „Schicht“ und „Dienst“ werden schon als Arbeit erkannt | fertig, bisher ohne Wirkung auf die Planung |
| Einheiten verschieben innerhalb der Planregeln | `src/ai/mutations/assignSessionToBestCapacityDay.ts`, Wochen-Scan, Diff-Screen | genau die Kernfunktion: Einheit auf einen passenden Tag legen, nie gegen die Trainingsregeln, nur nach Bestätigung | fertig bzw. UI in Arbeit |
| Regelwerk für Schlaf und Arbeit | `docs/readiness-spec.md` §7: kurze Ruhezeit unter 11 Stunden, Schlafgelegenheit, körperliche Schicht ab 6 Stunden, Etiketten per Rückfrage, Grund `late_shift` | die fachliche Vorarbeit für „nach der Spätschicht anders als vor dem Frühdienst“ | Spec fertig; im Code nur Typen (`src/readinessCore`), Logik der Schritte 5–10 offen |
| Morgen-Check-in und Anstrengungsfrage | `src/features/checkin`, Migrationen 016/017 | misst Erschöpfung direkt, auch ohne Uhr | in `main`, hinter Schalter |
| Bauweise „Spec, Invarianten, Tests“ | `src/planCore`, `docs/plan-spec.md` | ein offenes Regelwerk statt Blackbox – das, was eine Prüfstelle als „Trainingskonzept“ sehen will (Einschätzung) | Muster vorhanden |
| Einwilligungen, Kontolöschung, Datentrennung je Nutzer | `src/features/aiConsent`, Gesundheits-Zustimmung v2, Supabase RLS | Grundlage für das Datenschutzpaket, das Arbeitgeber und Kassen verlangen | in `main` |
| KI-Coach mit Einwilligung | `api/_lib/coachHandlers.js` | Erklärungen und Rückfragen; für Kassen eher Nebensache | läuft |

### 1.2 Was fehlt oder heute nicht passt

| Lücke | Befund am Code | Gewicht |
|---|---|---|
| **Nachtschicht wird heute falsch behandelt** | Das Tagesfenster ist 06–22 Uhr (`src/scheduling/capacityScore.ts`). Termine über Mitternacht werden am Tageswechsel geteilt (`eventToScheduleBlocks.ts`); der Teil von 0 bis 6 Uhr liegt außerhalb des Fensters. Eine Nachtschicht 22–6 Uhr belegt damit rechnerisch null Minuten. Die Readiness-Spec setzt die Schlafgelegenheit bei Nachtschicht ausdrücklich auf „unbekannt“ (§7.2). Schlaf am Tag sieht niemand | hoch – Kern der Idee |
| **Kein Schichtmodell** | Es gibt keinen Datentyp für Früh/Spät/Nacht/Frei, keine Eingabe von Rotationsmustern, keinen Foto- oder PDF-Import. Das Preset „Schichtarbeit“ ist eine Näherung „Mo–Fr 6–14 Uhr“ (`src/calendar/presets.ts`) | hoch |
| **Plan-Kern kennt nur feste Wochen** | `CoreInputs.availableDays` ist eine feste Menge von Wochentagen (`src/planCore/types.ts`). Wechselschicht hat keine festen Wochentage. `PlanRules.maxMinutesByDay` existiert als Typ, die Regeln sind im MVP leer | hoch |
| **Plan-Kern kennt nur Laufen mit Rennziel** | 5 km bis Marathon, Renndatum Pflicht, 3–6 Lauftage. Kein Krafttraining (`docs/plan-spec.md` §0), kein Plan ohne Rennen, kein Geh-Lauf-Einstieg, keine Mindestdosis wie „150 Minuten pro Woche“ | hoch für Option 1 und 2 |
| **Keine Uhrzeit** | Eine Einheit hat einen Tag, keine Uhrzeit. Für Schichtarbeit ist „wann am Tag“ die halbe Frage | mittel |
| **Nur iOS** | `@capacitor/ios`, HealthKit-Plugin; Android steht unter „Post-TestFlight“ | hoch für Betriebe und Kassen |
| **Keine Funktionen für Betriebe** | keine Lizenzcodes, keine Gruppen, keine Gesamtauswertung | mittel (erst ab Stufe 3) |
| **Kein Kursformat, keine Auswertung** | keine Module, keine Teilnahmebescheinigung, kein Kanal zur Fachperson, keine Fragebögen zu drei Messzeitpunkten | hoch für den Kassenweg |
| **MyRace selbst ist nicht fertig** | Apple-Developer-Account fehlt, TestFlight offen, Readiness-Kern nicht gebaut | Kapazitätsrisiko |

### 1.3 Grober Aufwand (Schätzung, nicht belegt)

In „Arbeitstagen“ wie im Readiness-Plan (ein Tag = ein konzentrierter Auftrag an Claude Code plus deine Abnahme).

| Paket | Inhalt | Aufwand |
|---|---|---|
| S1 Schicht-Kern | Schichtmodell, Eingabe per Muster oder Kalender-Etikett, Tageseignung mit Nachtschicht und Tagschlaf, Regeln nach Schichttyp, Tests | 8–12 Tage, zusätzlich zu den ohnehin geplanten Readiness-Schritten 7, 8 und 12 |
| S2 Gesundheitsplan | Plan ohne Rennziel, Kraft- und Einsteiger-Bibliothek, Wochenplanung nach Dienstfolge statt Wochentag | 15–25 Tage plus fachliche Zuarbeit einer ausgebildeten Person |
| S3 Kursformat | 8–12 Module mit Inhalten, Teilnahmebescheinigung, Kanal zur Fachperson, Auswertungsfragebögen | 10–15 Tage plus Inhalte (Videos, Texte) |
| S4 Android | Capacitor-Android, Health Connect statt HealthKit | 10–20 Tage |
| S5 Betriebe | Lizenzcodes, Gesamtauswertung mit Mindestgruppe, Datenschutzpaket | 10–15 Tage plus Rechtsprüfung |

Option 3 braucht nur S1. Option 2 braucht S1 bis S3, später S4 und S5. Option 1 braucht alles und zusätzlich eine eigene App-Hülle.

---

## 2. Optionsvergleich

Punkte von 1 (schwach) bis 5 (stark). Die Punkte sind eine Einschätzung; die Begründung zählt mehr als die Summe.

| Kriterium | Option 1: eigenständige neue App | Option 2: Ableger auf demselben Kern (Kassen-/Betriebsvariante) | Option 3: MyRace bleibt Läufer-App mit Schicht-Modus |
|---|---|---|---|
| **USP jenseits von Code** | 3 – nur wenn Studie und Zertifikat dazukommen; die App allein ist kopierbar | **4** – Regelwerk plus Studie plus Zertifikat plus Partner; setzt auf Vorhandenem auf | 1 – ein Feature, das WHOOP oder Garmin jederzeit nachziehen können |
| **Finanzierbarkeit** | 3 – dieselben Wege wie Option 2, aber später | **3–4** – Kurs (Kasse erstattet), Arbeitgeber steuerfrei, später Lizenz | 1 – nur Selbstzahler; Wettkampfvorbereitung ist bei den Kassen ausgeschlossen |
| **Aufwand bis zu einem zeigbaren Stand** | 1 – alles neu, zwei Apps pflegen | 3 – S1 zeigt schon etwas, S2/S3 folgen | **5** – nur S1 |
| **Passung zum Ideathlon** | 4 | **5** – Sport, Bewegung, Gesundheit; Anschluss an BGF-Institut und Präventionsforschung; kein vergleichbares Start-up im Spoho-Portfolio | 2 – „Feature einer Lauf-App“ ist keine Gründungsidee |
| **Risiko** (5 = gering) | 1 – höchster Einsatz, MyRace bleibt liegen | 3 – hängt an Partnern, die es noch nicht gibt | **4** – wenig Einsatz, wenig Ertrag |
| **Synergie mit MyRace** | 1 | 4 – gleicher Kern, gleiche Tests; MyRace bekommt den Schicht-Kern mit | **5** |

### Empfehlung

**Option 2, gebaut in der Reihenfolge von Option 3.** Zuerst der Schicht-Kern (S1) in der gemeinsamen Codebasis, dann der Ableger.

Begründung:
1. **Option 3 allein erfüllt dein Ziel nicht.** Du suchst einen USP, der nicht nur Code ist. Ein Schicht-Modus ist nur Code, und die Kassen bezahlen keine Wettkampfvorbereitung.
2. **Option 1 kannst du allein nicht stemmen.** Zwei Apps neben Studium und Kellnern sind eine zu viel. Außerdem würdest du Kalender, Tagesform und Verschiebe-Logik ein zweites Mal bauen.
3. **Option 2 nutzt genau das, was MyRace besonders macht** (Kalender plus Tagesform plus regelgebundenes Verschieben) und fügt hinzu, was Wettbewerber nicht in drei Monaten kopieren: Studie, Zertifikat, Partner.
4. **Der erste Schritt ist ohne Reue.** S1 verbessert MyRace auch dann, wenn die Gründungsidee scheitert. Läufer im Schichtdienst fordern die Funktion in den Foren von Garmin und TrainerRoad seit Jahren.

**Die Bedingung.** Option 2 trägt nur, wenn drei Dinge dazukommen:
- eine **anerkannte Fachperson** (abgeschlossenes sportwissenschaftliches Studium) als Partnerin oder Mitgründer. Du selbst kannst das im zweiten Semester nicht sein;
- ein **Institut für eine Begleitstudie** (Biallas, Giurgiu, Schaller);
- ein **Pilotpartner** mit Zugang zu Schichtarbeitenden (BGF-Institut, TK, eine Klinik, Polizei NRW über das DSHS-Projekt).

Kommt bis Ende Januar keines davon in Sicht, bleibt es bei Option 3 als Funktion von MyRace, und die Schicht-Idee ist als Gründung vom Tisch. Das wäre kein Scheitern, sondern das Ergebnis der Prüfung.

**Mit welcher Gruppe anfangen?** Offen, und die Interviews sollen es klären. Ausgangslage:

| Gruppe | Spricht dafür | Spricht dagegen | Passender Zahler |
|---|---|---|---|
| Pflegekräfte im Krankenhaus | größte Gruppe; eigenes Kassenbudget, das nicht ausgeschöpft wird; MEHRWERT:PFLEGE als Kanal | Erschöpfung als Hauptbarriere; in der Pflege insgesamt 49 % Teilzeit | Kasse (Kurs, BGF) |
| Polizei NRW, Wach- und Wechseldienst | ein Arbeitgeber; Dienstsport und Fitnessnachweis verankert; Spoho forscht dort | klein; Personalrat; Beamte sind nach meinem Kenntnisstand meist nicht gesetzlich versichert (nicht geprüft) – der Kassenweg greift dann nicht | Land NRW direkt |

Für das Bewerbungsformular empfehle ich **Pflegekräfte im Krankenhaus als Start** (Größe, Budget, Kassenlogik) und die Polizei als zweites Testfeld. Wenn die Interviews zeigen, dass Pflegekräfte kein strukturiertes Training wollen, die Polizei aber schon, drehst du es um.

---

## 3. Die riskantesten Annahmen

Sortiert nach „wenn das falsch ist, ist die Idee tot“.

| Nr. | Annahme | Was dafür spricht | Was dagegen spricht | Wie testen |
|---|---|---|---|---|
| A1 | **Schichtarbeitende wollen strukturiert trainieren und nutzen dafür regelmäßig eine App** – auch die, die heute wenig Sport machen | Barrieren-Studien nennen Planung als Hürde; Forenwünsche bei Garmin und TrainerRoad | Erschöpfung ist die Hauptbarriere; die einzige Schicht-App-Studie wirkte an Nacht- und Spätschichten nicht; Forenwünsche kommen von Sportlern, nicht von Wenigbewegten | 10 Interviews; später Pilot mit Nutzungsdaten |
| A2 | **Planung nach Dienstplan führt zu mehr regelmäßiger Bewegung als allgemeine Tipps** | plausibel aus Schlaf- und Leistungsforschung | nicht belegt; einzige RCT zu Training vor der Nachtschicht ohne Effekt | Einschätzung der Fachkontakte; Begleitstudie |
| A3 | **Ein am Dienstplan ausgerichtetes Programm ist zertifizierbar** (Online-Kurs nach Kapitel 5 mit flexibler Terminierung oder App nach Kapitel 7) | Kapitel 7 erlaubt ausdrücklich starke Individualisierung; Schichtarbeit ist im Leitfaden als Zielgruppe genannt | Kapitel 5 verlangt feste Module im Wochenrhythmus; Kapitel 7 verlangt ISO 27001 und Studie | ZPP, GKV-Spitzenverband, Klein (TK) |
| A4 | **Du findest eine anerkannte Fachperson und ein Institut** | Spoho-Umfeld; StarS nennt Mitgründersuche als Ziel | bisher niemand angesprochen | Gateway-Kontakt, Biallas, Giurgiu |
| A5 | **Ein Arbeitgeber oder BGF-Partner setzt ein digitales Schicht-Bewegungsangebot ein und zahlt dafür** | Budget in Krankenhaus und Pflege wird nicht ausgeschöpft; Bewegung ist das häufigste Thema in der BGF | Kassen haben Gratis-Apps und feste Partner; isolierte Angebote Externer sind ausgeschlossen; fast die Hälfte der Organisationen hat unter 10.000 € BGM-Budget | BGF-Institut, Klein, Krämer, Kliniken, Stadt Köln |
| A6 | **Beschäftigte bekommen ihren Dienstplan mit wenig Aufwand in die App** | Schichtkalender-Apps exportieren in den Gerätekalender; Muster sind einfach einzugeben | kein öffentlicher Kalender-Export der Dienstplansysteme gefunden; Pläne ändern sich kurzfristig | Interviewfragen 1 und 2 |
| A7 | **Betriebsrat oder Personalrat stimmen zu, und Beschäftigte vertrauen einer vom Arbeitgeber bezahlten Gesundheits-App** | Modell „Arbeitgeber zahlt, sieht aber nichts“ ist üblich | Gesundheits- und Dienstplandaten sind heikel; Shift2Health berichtet Misstrauen gegenüber Technik | GdP, Interviewfrage 9, Kliniken |
| A8 | **Du bist schnell genug und hast die Zeit** – bevor WHOOP oder Garmin die Funktion nachziehen und bevor SHIFT2HEALTH ein fertiges Programm liefert | Zertifikat und Studie schützen | zweites Semester, allein, MyRace nicht im Store; Kapitel 7 kostet 12–18 Monate | ehrlicher Zeitplan; Kontakt zu SHIFT2HEALTH |

---

## 4. Welcher Kontakt testet welche Annahme?

| Nr. | Kontakt | Testet | Worauf in der Antwort achten |
|---|---|---|---|
| 1 | Dr. Krämer (BGM der DSHS) | A5, A7 | Wer entscheidet wirklich, wer bringt Vorschläge ein, welche Rolle hat die TK? |
| 2 | Markus Klein (TK) | A5, A3 | Fragen Betriebe mit Schicht nach Bewegung? Nennt er Bedingungen (Zertifikat, Evaluation, Datenschutz) oder winkt er ab („haben wir schon“)? |
| 3 | BGF-Institut | A5, A1 | Woran scheitern Angebote konkret? Gibt es Interesse an einem Baustein oder Piloten? Wird jemand genannt? |
| 4 | MEHRWERT:PFLEGE | A1, A5 | Ist Bewegung im Schichtdienst ein Thema der Einrichtungen oder nachrangig? Vermittlung von Pflegekräften? |
| 5 | Dr. Biallas | A2, A4 | Hält sie den Ansatz für tragfähig? Ist eine Abschlussarbeit oder Studie denkbar – und mit wem? |
| 6 | Dr. Goldmann | A1, A6 | Wie trainieren Beamte im Wechseldienst heute? Zugang zu Befragten? |
| 7 | GKV-Spitzenverband | A3 | Klare Aussage zur individuellen Anpassung an den Dienstplan |
| 8 | ZPP | A3, A4 | flexibler Rhythmus; Anschlussangebot; Zahl der anerkannten App-Konzepte |
| 9 | BKK Dachverband | A5, A1 | Wird die Broschüre genutzt? Gibt es Nachfrage nach mehr? |
| 10 | Prof. Froböse | A1, A2 | Was braucht ein Angebot, damit es im Alltag genutzt wird? |
| 11 | Dr. Quittmann | A2 | fachliche Regeln zur Belastungssteuerung bei wechselndem Schlaf |
| 12 | Prof. Kolbe-Alexander | A1, A2 | Sie ist Mitautorin der Meta-Analyse und der Schicht-App-Studie: Warum wirkte die App an Nachtschichten nicht? |
| 13 | Prof. Langhoff | A6, A1 | Wie planbar sind Dienste bei der Feuerwehr? Wie stehen Dienstpläne den Leuten zur Verfügung? |
| 14 | DBfK Nordwest | A1 (Zugang) | Aufruf im Newsletter ja oder nein |
| 15 | Uniklinik Köln | A5, A6, A7 | Wer ist zuständig? Welches Dienstplansystem, mit Kalender-Export? |
| 16 | Kliniken der Stadt Köln | A5, A6, A7 | wie 15 |
| 17 | Stadt Köln, BGM (Berufsfeuerwehr) | A5, A7 | Interesse, Zuständigkeit, Personalrat |
| 18 | AOK Rheinland/Hamburg | A5, A3 | nur falls das BGF-Institut schweigt |
| 19 | Prof. Schaller | A2, A3 | Welches Studiendesign reicht für eine Kassenzertifizierung, mit welchem Aufwand? |
| 20 | Dr. Sweeney | A1, A2 | Was hätte ihren Befragten geholfen – Planung oder etwas anderes? |
| 21 | GdP NRW | A1, A7 | Sicht der Beschäftigtenvertretung auf eine solche App; Zugang zu Befragten |
| 22 | Pflegenetzwerk Deutschland | A1 (Zugang) | Aufruf ja oder nein |
| 23 | Runner's-World-Forum | A1, A6 | Wie planen Läufer im Schichtdienst heute, was nutzen sie? |

### 4.1 Lücken, die die 23 Kontakte nicht schließen

| Lücke | Warum sie zählt | Vorschlag |
|---|---|---|
| **A1 bei Wenigbewegten** | Das Forum erreicht nur Leute, die schon laufen. Die Kassen bezahlen aber Angebote für Menschen mit Bewegungsmangel | Interviews gezielt über MEHRWERT:PFLEGE, DBfK, GdP gewinnen; mindestens fünf der zehn Befragten sollten keinen regelmäßigen Sport machen |
| **A4 Fachperson** | Kein Kontakt testet das, und ohne sie gibt es kein Zertifikat | Gateway-Kontakt fragen; Aushang oder Nachricht an Absolventinnen und Absolventen des M.A. Rehabilitation, Prävention und Gesundheitsmanagement |
| **A8 Wettbewerb in der Forschung** | SHIFT2HEALTH (Uni Bremen) baut gerade ein App-Programm mit Studie | Projekt anschreiben: Was planen sie nach Studienende? Wäre ein Bewegungsbaustein denkbar? |
| **Prof. Dr. Marco Giurgiu fehlt** | Stiftungsprofessur für Bewegungsbezogene Präventionsforschung an der Spoho, getragen vom BGF-Institut; arbeitet mit Wearables im Betrieb | anschreiben – inhaltlich der passendste Kontakt an der Hochschule, für Studie (A2, A4) und Brücke zum BGF-Institut (A5) |
| **Betriebsrat und Datenschutz (A7)** | Nur die GdP deckt die Sicht der Beschäftigtenvertretung ab | in den Klinik-Antworten nach der Mitarbeitervertretung fragen |
| **Zahlungsbereitschaft** | niemand wird nach Geld gefragt | Interviewfrage 8 |

### 4.2 Hinweise zu den noch nicht verschickten Mails

- **GKV-Spitzenverband (Nr. 7):** Die Frage ist gut. Zur Sicherheit „Kapitel 7, digitale Angebote in der individuellen verhaltensbezogenen Prävention“ schreiben, weil die Unterkapitel in FAQ und aktueller Fassung unterschiedlich nummeriert sind.
- **ZPP (Nr. 8):** Die zweite Frage ist durch die Recherche schon beantwortet (ja: ohne Studie ein Jahr vorläufig, wenn ein registriertes Studiendesign vorliegt). Ersetze sie durch die offenen Fragen aus `research.md` §4.2: flexibler Rhythmus bei Schichtplänen, Gestaltung eines freiwilligen Anschlussangebots, Zahl der anerkannten App-Konzepte im Handlungsfeld Bewegung.
- **Froböse (Nr. 10):** Er ist emeritiert, der Abteilung aber weiter zugeordnet; die Abteilung leitet laut DSHS-Seite Prof. Wollesen. In der Mail nichts zur Leitungsrolle von Frau Dr. Biallas behaupten.
- **Runner's-World-Forum (Nr. 23):** Die Antworten dort beschreiben Läufer, nicht die Zielgruppe der Kassen. Getrennt auswerten.

---

## 5. Worauf du in den Antworten insgesamt achten solltest

1. **Sagen die Kassen- und BGF-Leute „interessant“ oder nennen sie einen nächsten Schritt?** Ein Name, ein Termin, eine Bedingung ist ein Signal. „Spannende Idee, viel Erfolg“ ist keines.
2. **Nennt jemand von sich aus die Hürde, die du lösen willst (Planung)?** Oder nennen alle etwas anderes – Erschöpfung, Personalmangel, fehlende Zeit im Dienst? Dann löst die App das falsche Problem.
3. **Verweist dich jemand an eine Stelle, die das schon macht?** Dann dort nachfassen; das ist Wettbewerb oder ein Partner.

---

## 6. Interviewleitfaden für zehn Schichtarbeitende

Dauer etwa 15 Minuten. Regeln: nach Vergangenem fragen, nicht nach Wünschen. Die Idee erst am Ende nennen. Mitschreiben, was die Person **getan** hat. Mindestens fünf Befragte ohne regelmäßigen Sport, mindestens zwei Berufsgruppen.

Einstieg: „Ich studiere an der Sporthochschule und möchte verstehen, wie Bewegung und Schichtdienst im Alltag zusammengehen. Es gibt keine richtigen oder falschen Antworten, und ich verkaufe nichts.“

1. Wie sieht dein Dienst aus: welche Schichten, in welcher Folge, und wie weit im Voraus kennst du deinen Plan? Wie oft ändert er sich kurzfristig?
2. Wo steht dein Dienstplan – auf Papier, in einer App des Arbeitgebers, im eigenen Kalender, in einer Schichtkalender-App?
3. Erzähl mir von deinen letzten sieben Tagen: Wann hast du dich bewegt oder Sport gemacht, und was genau?
4. Wann ist bei dir zuletzt eine geplante Sporteinheit ausgefallen? Was war der Grund?
5. Wie entscheidest du an einem Tag, ob und was du machst – zum Beispiel nach einem Nachtdienst oder vor einem Frühdienst?
6. Was hast du schon ausprobiert, um Sport und Schicht unter einen Hut zu bekommen (Studio, Verein, App, Kurs, Angebot des Arbeitgebers)? Was davon machst du noch, was nicht mehr, und warum?
7. Wie geht es dir mit Schlaf und Erholung rund um die Schichten? Was machst du, wenn du schlecht geschlafen hast und eigentlich Sport geplant war?
8. Wofür gibst du im Moment Geld aus, wenn es um Sport oder Gesundheit geht (Studio, App, Uhr, Kurs)? Hast du schon einmal einen Gesundheitskurs der Krankenkasse oder ein Angebot deines Arbeitgebers genutzt?
9. Stell dir vor, dein Arbeitgeber bezahlt dir eine Gesundheits-App. Unter welchen Bedingungen würdest du sie nutzen, und was würde dich abhalten?
10. Wenn du eine Sache ändern könntest, damit Bewegung im Schichtdienst leichter wird: Was wäre das?

Abschluss: Idee in zwei Sätzen nennen. Reaktion wörtlich notieren. Dann: „Dürfte ich dich anschreiben, wenn es etwas zum Ausprobieren gibt?“ und „Wen sollte ich noch fragen?“

**Auswertung je Interview (ja/nein):**

| Merkmal | Aus Frage |
|---|---|
| nennt ungefragt Planung oder Unregelmäßigkeit als Grund für ausgefallenen Sport | 4, 5 |
| nennt ungefragt Erschöpfung oder Schlaf als Hauptgrund | 4, 7 |
| hat schon mindestens einen eigenen Lösungsversuch unternommen | 6 |
| macht derzeit regelmäßig Sport (mindestens einmal pro Woche) | 3 |
| Dienstplan liegt digital vor oder folgt einem festen Muster | 1, 2 |
| gibt heute Geld für Sport oder Gesundheit aus | 8 |
| nennt Bedenken wegen Arbeitgeber und Daten | 9 |
| gibt Kontakt für einen Test | Abschluss |

---

## 7. Weitermachen, umbauen oder lassen

Die Schwellen sind eine Setzung, damit die Entscheidung vorher feststeht und nicht nachträglich schöngeredet wird. Stichtag: **31.01.2027** (nach dem Ideathlon, vor dem StarS-Gespräch). Zwischenstand für das Bewerbungsformular: 04.12.2026.

### Weitermachen mit Option 2, wenn alles Folgende zutrifft

| Kriterium | Schwelle |
|---|---|
| Problem bestätigt | mindestens 6 von 10 nennen ungefragt Planung oder Unregelmäßigkeit als Grund |
| Leidensdruck | mindestens 5 von 10 haben einen eigenen Lösungsversuch hinter sich |
| Bereitschaft | mindestens 3 von 10 geben ihren Kontakt für einen Test |
| Dienstplan verfügbar | mindestens 7 von 10 haben den Plan digital oder als festes Muster |
| Kassen-Passung | ZPP oder GKV-Spitzenverband schließen ein am Dienstplan ausgerichtetes Programm nicht grundsätzlich aus |
| Fachliche Rückendeckung | mindestens eine Person aus der Wissenschaft hält den Ansatz für tragfähig und ist zu einer Betreuung oder Studie grundsätzlich bereit |
| Zahler | mindestens ein Kontakt aus Kasse, BGF oder Arbeitgeber nennt einen konkreten nächsten Schritt |
| Fachperson | eine anerkannte Fachperson ist namentlich in Sicht |

### Umbauen, wenn das Problem bestätigt ist, aber ein Baustein kippt

| Befund | Umbau |
|---|---|
| Nur die Sportlichen wollen es | Option 3: Schicht-Modus als Funktion von MyRace, Selbstzahler. Als Gründungsidee für StarS dann zu schwach |
| Polizei und Feuerwehr wollen es, die Pflege nicht | Startgruppe wechseln; Zahler wird der Dienstherr, der Kassenweg tritt zurück |
| Kassen sagen „nur als fester Kurs“ | Produkt wird ein Online-Kurs mit Planungshilfe; die App ist Werkzeug, nicht Produkt |
| Arbeitgeber wollen es, Kassen nicht | direkter Pilot mit einem Betrieb; Zertifikat später |
| Hauptproblem ist Schlaf und Erschöpfung, nicht Planung | anderes Feld mit anderer Fachqualifikation und starkem Wettbewerb (Timeshifter, Schlafkurse der Kassen). Für dich vermutlich das Ende der Idee |

### Lassen, wenn eines davon zutrifft

- Weniger als 3 von 10 beschreiben Planung als Problem.
- Keine einzige fachliche oder kassenseitige Rückmeldung mit Substanz bis Mitte Januar. Antworten weniger als vier der 23 Kontakte, liegt es eher am Zugang als an der Idee – dann erst nachfassen, bevor du entscheidest.
- ZPP und GKV-Spitzenverband schließen das Konzept aus **und** kein Arbeitgeber zeigt Interesse.
- Bis Ende Januar ist weder eine Fachperson noch ein Institut in Sicht.
- MyRace ist bis dahin nicht in TestFlight, und du merkst, dass die Schicht-Idee Zeit vom Launch abzieht. Dann hat MyRace Vorrang.

**Was in jedem Fall bleibt:** die Teilnahme am Ideathlon (frühphasig, Feedback, erspart die StarS-Bewerbung), die Kontakte zu BGF-Institut und TK und der Schicht-Kern als künftige Funktion von MyRace.

---

## 8. Annahmen und Entscheidungen

Getroffen ohne Rückfrage; bitte gezielt widersprechen.

| Nr. | Annahme oder Entscheidung | Folge, falls falsch |
|---|---|---|
| 1 | Du bist zu zehn Interviews und später zu einem kleinen Piloten mit Begleitstudie bereit | Ohne Pilot und Studie trägt Option 2 nicht; dann bleibt Option 3 |
| 2 | Bis zum Ideathlon entsteht kein Code für die Schicht-Idee; der Fahrplan von MyRace (Readiness, TestFlight) bleibt unberührt | – |
| 3 | Der Ableger bekommt einen eigenen Namen; „Race“ passt nicht zu einem Angebot, das die Kassen als Gesundheitssport prüfen | bei Verzicht auf den Kassenweg unerheblich |
| 4 | Startgruppe im Entwurf: Pflegekräfte im Krankenhaus; Polizei NRW als zweites Testfeld | Formularfelder 2 und 7 anpassen |
| 5 | Aufwandsschätzungen in §1.3 und alle Zeitangaben bis zum ersten Euro sind Schätzungen | Reihenfolge der Stufen bleibt, Dauer ändert sich |
| 6 | Preise für Arbeitgeberlizenzen (2–3 € je berechtigter Person und Monat) sind geschätzt; öffentliche Preise reiner App-Lizenzen wurden nicht gefunden | Marktgröße in `research.md` §4.9 verschiebt sich |
| 7 | Polizeibeamte sind überwiegend nicht gesetzlich krankenversichert – aus Vorwissen, nicht geprüft | falls falsch, ist der Kassenweg auch für die Polizei offen |
| 8 | Die Punkte im Optionsvergleich und die Schwellen in §7 sind Setzungen | – |
| 9 | Das Suchkontingent war erschöpft; eine zweite, unabhängige Suche war nicht möglich. Geprüft wurde durch erneutes Lesen der geöffneten Quellen und Abgleich der Teilrecherchen | einzelne Zahlen können abweichen; Liste in `research.md` §8 |
| 10 | Zusätzlich zu den drei beauftragten Dokumenten liegen die Rohbefunde unter `anhang/` | kann gelöscht werden |
| 11 | Rechtliche und steuerliche Aussagen geben den gelesenen Stand wieder und ersetzen keine Beratung | vor einem Vertrag mit Arbeitgeber oder Kasse prüfen lassen |
| 12 | Die Uhr- und Kalenderfunktionen von MyRace sind auf dem iPhone noch nicht abgenommen (Roadmap); die Fit-Analyse beschreibt den Code, nicht geprüftes Verhalten auf dem Gerät | Aufwand S1 steigt |
