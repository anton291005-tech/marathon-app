# MyRace – Readiness-Recherche (Stand 12.11.2026)

> Zweck: wissenschaftliche Grundlage für `docs/readiness-spec.md` und `docs/readiness-plan.md`. Kein App-Code geändert.
> Aufbau: Teil A fasst zusammen und beantwortet Antons Fragen. Teil B enthält die sieben Recherche-Stränge im Detail (gegliedert nach Abschnitt 4 des Auftrags), jeder mit eigener Quellenliste. Teil C ist die Tabelle „Was wir übernehmen, was nicht, warum“.
> Evidenzstärke je Aussage: **stark** (mehrere konsistente Studien oder Meta-Analysen) · **mittel** (einzelne gute Studien, Meta-Analysen mit Einschränkungen) · **schwach** (kleine, einzelne, beobachtende Studien) · **Expertenmeinung** (Konsenspapiere, Lehrbücher, Praxis) · **Heuristik** (eigene Ableitung ohne direkten Beleg).

## Methode und Grenzen dieser Recherche

- Sieben parallele Recherche-Stränge (HRV; Ruhepuls/Schlaf/Krankheit; Trainingslast; subjektive Marker; Leben/Kalender; Modell/Daten; Wettbewerb), jeweils per Websuche und Abruf von Abstracts, Volltexten und Herstellerseiten am 11./12.11.2026.
- **PubMed/PMC und einige Verlagsseiten waren beim Abruf gesperrt.** Viele Arbeiten sind deshalb nur auf Abstract-Ebene, über Repositorien oder über Sekundärquellen geprüft. Das steht jeweils an der Quelle („Abstract“, „nicht verifiziert“, „Sekundärquelle“). Zahlen mit diesem Vermerk müssen vor einer Verwendung in App-Texten, Pitch oder Spoho-Review am Original geprüft werden.
- Die Wettbewerbsrecherche (Teil B7) ist unvollständig: Rund ein Drittel der gewünschten Produkte ließ sich nicht an einer Quelle prüfen und ist dort als „nicht geprüft“ gelistet.
- Nichts wurde aus dem Gedächtnis ergänzt, ohne es zu kennzeichnen. Wo eine im Auftrag genannte Startquelle nicht auffindbar war oder etwas anderes sagt als angenommen, steht das ausdrücklich im jeweiligen Strang (Beispiele: „Johnston 2020“ ist Cahalan et al. 2020; Campbell 2021 ist keine Meta-Analyse; „Smyth 2022“ ist Feely et al. 2023; Ruuska 2012 trägt einen anderen Titel).

---

# Teil A – Zusammenfassung

## A1. Die zwölf wichtigsten Befunde

1. **Kein zusammengesetzter Readiness-Score ist gegen Leistung validiert.** Eine Übersicht über 14 Scores von 10 Herstellern fand keine offengelegte Formel und kaum unabhängige Belege (Doherty et al. 2025). Zwei kleine unabhängige Studien fanden praktisch keinen Zusammenhang zwischen Whoop-Recovery bzw. Oura-Readiness und subjektiver Erholung oder Belastungsmarkern (Lundstrom 2023; De Bot 2025). Evidenz: mittel. → Ein weiterer Einzahl-Score wäre für MyRace wertlos. Der Wert liegt in Erklärung und Handlung.
2. **HRV-gesteuertes Training ist im Mittel nicht nachweisbar besser als ein fester Plan** (gepoolte Effekte 0,13–0,20, alle Konfidenzintervalle schließen 0 ein; Manresa-Rocamora 2021). Plausibler Nutzen: weniger harte Einheiten bei gleichem Ergebnis, weniger Negativ-Responder. Die deutlichste positive Studie (Nuuttila 2022, 10 km −6,2 % vs. −2,9 %) kombinierte HRV **mit subjektiven Angaben und einem Lauf-Index** und entschied nur zweimal pro Woche. Evidenz: mittel. → Kombination und seltene Entscheidungen statt täglicher HRV-Ampel.
3. **Apple-Watch-HRV ist das schwächste Glied.** Apple schreibt SDNN aus sporadischen Hintergrundmessungen; unter standardisierten Bedingungen lag der mittlere Fehler bei rund 29 %, beim Ruhepuls bei rund 6 % (O'Grady 2024). Keine einzige Interventionsstudie steuert mit Apple-SDNN. Evidenz: mittel. → HRV nur gemittelt, gedämpft und nie allein; Ruhepuls bzw. Schlaf-Herzfrequenz mindestens gleich gewichten. Die App mittelt heute alle SDNN-Werte des Tages – das ist methodisch falsch (Tageszeit- und Schlafphaseneffekt).
4. **Subjektive Maße reagieren auf Trainingslast konsistenter als objektive** (Saw et al. 2016, 56 Studien) – aber das gilt für validierte Mehr-Item-Fragebögen. App-Einzelitems sind kaum validiert (Jeffries 2020) und am Einzeltag teils wenig zuverlässig (Müdigkeit ICC 0,30, Muskelkater 0,77; Ryan 2019). Evidenz: mittel. → Wenige Items, gegen die eigene Baseline, Trend über 2–3 Tage, begrenztes Gewicht.
5. **Die größte Gefahr für den Check-in ist, dass ihn niemand ausfüllt.** Selbstorganisierte Einzelsportler kamen auf 28 ± 40 % Compliance, betreute Teams auf 84 ± 21 % (Saw 2015b). Der am besten belegte Hebel ist sofortiges, sichtbares Feedback. Streaks binden, solange sie halten, und demotivieren, wenn sie reißen (Silverman & Barasch 2023). Evidenz: mittel. → Kein Streak; jede Antwort verändert sichtbar etwas.
6. **Das heutige „Gefühl 1–5“ ist kein RPE-Ersatz.** Affekt und Anstrengung korrelieren nur mäßig (r = −0,56; Hardy & Rejeski 1989). Session-RPE (0–10 × Minuten) ist bei Läufern gegen Herzfrequenzmaße validiert (r ≈ 0,74–0,89) und braucht keine Uhr. Evidenz: stark für die Methode. → Eine zusätzliche Frage „Wie anstrengend?“ 0–10.
7. **ACWR-„Sweet-Spot“ nicht verwenden.** Die Kennzahl ist konzeptionell angreifbar (Impellizzeri 2020/2021) und war in der größten Läuferkohorte (5 205 Läufer) nicht bzw. invers mit Verletzungen assoziiert. Belegt war dort die **Einzellauf-Spitze**: ein Lauf mehr als 10 % länger als der längste der letzten 30 Tage (Hazard-Rate-Verhältnisse 1,5–2,3; Frandsen et al. 2025). Evidenz: mittel. → Das ist bereits im Plan-Kern (Long-Run-Steigerung) angelegt; Readiness darf es nie aushebeln, etwa durch Nachholen.
8. **Lebensstress und Erholung: plausibel, aber dünn belegt.** Die bekannten großen Effekte (Kraft-Erholung nach 48 h 95 % vs. 48 %) stammen aus einer einzigen Stichprobe von 31 Studierenden und betreffen Krafttraining. Für Läufer gibt es eine kleine Studie (Otter 2016, n = 16). Mentale Ermüdung senkt Ausdauerleistung laut älteren Meta-Analysen leicht (g ≈ −0,3), nach Bias-Korrektur etwa null (Holgado 2020). Es gibt **keinen RCT**, in dem Training nach Lebensstress oder Kalender angepasst wurde. Evidenz: schwach.
9. **Was am Kalender trägt, ist der Schlaf.** Kurze Ruhezeiten zwischen Schichten (< 11 h) verkürzen den Schlaf auf 5,0–6,5 h (Vedaa 2015); mehrere Nächte mit rund 5 h kosten etwa 3 % im Zeitfahren (Roberts 2019); akuter Schlafverlust kostet im Mittel 7,6 %, vor allem bei Belastungen am Abend, kaum am Morgen (Craven 2022). Evidenz: mittel. → Kalender nicht als „Stress-Punkte pro Termin“, sondern als Vorhersage von **Schlafgelegenheit, Zeitfenster und wenigen etikettierten Stressoren** (Prüfung, körperliche Schicht, Reise).
10. **Keine Studie validiert Termindichte als Prädiktor für Stress, HRV oder Erholung einer einzelnen Person.** Jedes Gewicht je Terminart ist Heuristik. Evidenz: nicht vorhanden. → Der tägliche Check-in ist die Grundwahrheit, der Kalender liefert Vorausschau und Erklärung.
11. **Krankheitsfrüherkennung aus Wearables funktioniert nur grob.** Bei 95 % Spezifität werden 44–47 % der Fälle erkannt (Natarajan 2020); Sensoren plus Symptome sind klar besser als Sensoren allein (AUC 0,80 vs. 0,72; Quer 2021). Evidenz: mittel, fast nur COVID-Daten. → Mehrere Signale über zwei Nächte, dann **fragen** statt behaupten; die Symptomangabe entscheidet.
12. **Schlafphasen aus Wearables sind unzuverlässig** (Apple Watch unterschätzt Tiefschlaf um rund 43 min; Vier-Phasen-Kappa 0,2–0,6), die Schlafdauer ist brauchbar. Evidenz: stark. → REM-/Tiefschlafanteile raus aus dem Score (heute fließen sie ein).

## A2. Antworten auf Antons Fragen

**Wie kann so ein System aussehen?** Kein Score, der beeindruckt, sondern ein kleines, offenes Zustandsmodell: Jeder Marker wird gegen den eigenen Normalbereich gelesen, verwandte Marker werden zu Blöcken zusammengefasst (Befinden, Körpersignale, Schlaf), die Blöcke zählen gleich, und Training sowie Kalender liefern die Erwartung für Tage ohne Messung. Ausgabe sind eine von vier Stufen, die Gründe und ein regelkonformer Vorschlag. Gleiche Gewichte sind bei wenig Daten pro Person nicht die bequeme, sondern die statistisch robuste Wahl (Dawes 1979; Teil B6).

**Welche Daten sind nötig?** Pflicht ist nichts außer Plan und erledigten Einheiten. Den größten Zugewinn pro Aufwand bringen in dieser Reihenfolge: (1) vier Morgenfragen plus eine Anstrengungsfrage nach der Einheit, (2) Schlafdauer und Schlaf-Herzfrequenz bzw. Ruhepuls aus der Uhr, (3) Kalender mit vom Nutzer etikettierten Terminarten, (4) HRV. Für HRV wäre rMSSD aus den Schlag-zu-Schlag-Daten (`HKHeartbeatSeriesSample`) oder der Series-12-Nachtmessung besser als Apples SDNN; ob das über das eingesetzte Plugin lesbar ist, muss am Gerät geklärt werden.

**Helfen große Datenbanken?** Wenig, und nicht für das, was man hofft. Kein offener Datensatz enthält Apple-Watch-SDNN, Kalenderbelastung und eine Leistungs-Zielgröße zugleich; ein eigenes Vorhersagemodell lässt sich daraus nicht trainieren. Nützlich sind sie für Plausibilitätsgrenzen (Ruhepuls 35–110), Streuungs-Startwerte für die ersten zwei Wochen, synthetische Testprofile und einen Trockenlauf des Algorithmus (bester Kandidat: PMData mit subjektiver Readiness 0–10; dazu LifeSnaps für nächtliche HRV-Reihen). Mittelwert-Priors aus der Bevölkerung bringen fast nichts, weil sich Menschen untereinander viel stärker unterscheiden als eine Person von Tag zu Tag (Teil B6, Abschnitt 2).

**Ist die Kalender-Idee tragfähig?** Ja, aber anders als ursprünglich gedacht. Nicht tragfähig: generische Belastungspunkte je Termin und jede Aussage wie „Kalender verbessert dein Training“. Tragfähig: Zeit- und Schlaffenster aus Terminen, wenige vom Nutzer bestätigte Stressor-Arten, vorausschauendes Platzieren harter Einheiten, und über Wochen vorsichtig formulierte persönliche Zusammenhänge. Der bessere Weg, Lebensbelastung zu **messen**, ist die tägliche Frage „Wie geht es dir im Kopf?“; der Kalender **erklärt** und **sieht voraus**.

## A3. Wo die Evidenz sich widerspricht

| Thema | Position 1 | Position 2 | Folge für MyRace |
|---|---|---|---|
| HRV oberhalb des Normalbereichs | „hoch = erholt“ (Produkte) | Überlastete Triathleten zeigten steigende HRV bei sinkender Leistung (Le Meur 2013) | Werte über dem Band nicht belohnen |
| Müdigkeits-Item | lastsensitivstes Item (Saw 2016) | am Einzeltag am wenigsten zuverlässig (Ryan 2019) | nur über mehrere Tage werten |
| Mentale Ermüdung | g = −0,38 (Brown 2020) | bereinigt ≈ 0 (Holgado 2020) | kein eigener Abzug für „Kopfarbeit“ |
| Eine kurze Nacht | −7,6 % (Craven 2022, viel Totalentzug) | Morgenleistung kaum betroffen | kleine Abwertung, kein Streichen; drei Nächte zählen |
| Schlaf und Verletzung | HR 1,51 bei < 7 h (Cahalan 2020) | Evidenz bei Erwachsenen unzureichend (Dobrosielski 2021) | Hinweis, keine Sperre |
| Prüfungsphase und HRV | plausibel niedriger | Oura-Studie: 1,5–1,7 ms, teils gegenläufig | Prüfung wirkt über Planung, nicht über erwartete HRV |
| 10-%-Regel | Praxis-Konsens | bei Anfängern nicht belegt (Nielsen 2014) | bleibt Zielwert im Plan-Kern, Readiness stützt sich nicht darauf |

---

# Teil B – Die Recherche-Stränge im Detail

Zuordnung zum Auftrag: B1–B3 = Abschnitt 4.1 (objektive Marker), B4 = 4.2 (subjektive Marker), B5 = 4.3 (Leben und Stress), B6 = 4.4 (Kombination und Modell), B7 = 4.5 (Was andere machen). Jeder Strang endet mit „Was für MyRace folgt“ und eigener Quellenliste (Autor, Jahr, Titel, Journal, DOI/Link). Vorschläge in den Strängen sind Rechercheergebnis; verbindlich ist, was `docs/readiness-spec.md` daraus macht (Abweichungen stehen in Teil C).


---

## B1 – HRV für die Trainingssteuerung


Stand: 11.11.2026. Evidenzstärke je Aussage: **stark / mittel / schwach / Expertenmeinung**. Wo ich nur Abstract, Repositoriums-Eintrag oder eine Sekundärquelle lesen konnte, steht das dabei. PubMed/PMC und einige Verlagsseiten waren beim Abruf gesperrt; betroffene Details sind als „nicht verifiziert“ markiert.

### Kurzfazit

1. HRV-gesteuertes Training ist im Mittel **nicht nachweisbar besser** als ein fester Plan bei VO2max und Wettkampfleistung (gepoolte SMD 0,13–0,20, alle Konfidenzintervalle schließen 0 ein). Der plausible Nutzen liegt in weniger Negativ-Respondern und weniger harten Einheiten bei gleichem Ergebnis. (mittel)
2. Die gesamte Interventionsliteratur nutzt **rMSSD (oder SD1/HF) aus standardisierten Morgen- oder durchgehenden Nachtmessungen**. Keine einzige Studie steuert mit sporadischem Apple-SDNN. Jede Übertragung auf Apple-Health-Daten ist Heuristik.
3. Apple-Watch-SDNN aus Hintergrundmessungen ist das schwächste Glied: wenige Messpunkte pro Nacht, zufälliger Zeitpunkt, ca. 29 % mittlerer Absolutfehler selbst unter standardisierten Bedingungen.
4. Für MyRace folgt: HRV als **ein** gedämpftes Signal neben Ruhepuls, Schlaf und subjektiven Angaben, mit 7-Tage-Mittel gegen individuelle Baseline, nie als alleiniger Auslöser auf Tagesbasis.

### 1. rMSSD vs. SDNN

- **Physiologie.** SDNN bildet die Gesamtvariabilität ab und enthält sympathische und parasympathische Anteile; rMSSD erfasst die Schlag-zu-Schlag-Varianz und ist das primäre Zeitbereichsmaß für vagal vermittelte Änderungen, mathematisch identisch mit SD1 (Shaffer & Ginsberg 2017). In kurzen Ruhemessungen wird auch SDNN überwiegend durch die vagal vermittelte Atemsinusarrhythmie getrieben, bei 24-h-Aufnahmen kommt viel niederfrequente Leistung hinzu (Shaffer & Ginsberg 2017). (stark, Lehrbuchwissen; Task Force 1996 als Standardreferenz, deren Text ich nicht abrufen konnte)
- **Warum Ln rMSSD der Feldstandard ist.** Buchheit (2014) nennt: erfassbar in sehr kurzen Fenstern (10 s bis 1 min), wenig atemabhängig, in einer Tabellenkalkulation berechenbar, Tag-zu-Tag-CV ca. 12 % gegenüber ca. 82 % für LF/HF. Spektralmaße rät er für das Feld ab. Einen direkten SDNN-Vergleich enthält der Artikel nicht. (mittel; narratives Review)
- **Kurzzeit-Validität.** 60-s-Fenster reichen für SDNN und rMSSD nach dem Kriterium r ≥ 0,90 gegenüber 5 min; 120 s ergaben r = 0,986 (rMSSD) und r = 0,956 (SDNN). In einer anderen Arbeit korrelierten 10-s- und 1-min-rMSSD akzeptabel mit 5 min, SDNN aber nicht (alle zitiert in Shaffer & Ginsberg 2017). rMSSD ist also robuster gegen kurze Fenster als SDNN. (mittel)
- **Korrelation SDNN–rMSSD in Ruhe/Nacht.** Einen belastbaren Koeffizienten aus einer Primärquelle habe ich **nicht gefunden**. Shaffer & Ginsberg berichten keinen. Altini schrieb 2018, SDNN könne bei kurzen Morgenmessungen ein brauchbarer Ersatz sein (eigene Datenanalyse, ohne Zahl), bezeichnet SDNN in späteren Texten aber als ungeeignet für die Verlaufskontrolle. (schwach, widersprüchlich)

### 2. Apple Watch konkret

- **Was gemessen wird.** Bis einschließlich Series 11 schreibt die Uhr SDNN aus PPG-Schlagintervallen nach Health (`heartRateVariabilitySDNN`); rMSSD liefert Apple dort nicht (Altini 2023). (stark)
- **Wann und wie oft.** Automatisch sporadisch tags und nachts; ein Dritthersteller nennt alle 2–5 Stunden, nicht im Stromsparmodus und nicht im Workout, mit AFib-Verlauf etwa alle 15 Minuten bei höherem Akkuverbrauch (PeakWatch-Doku). Apple dokumentiert diese Intervalle nicht selbst. Die Fensterlänge der Hintergrundmessung (oft mit ca. 60 s angegeben) konnte ich **nicht aus einer Primärquelle belegen**. Eine Atmen-/Achtsamkeits-Session löst zuverlässig eine Messung aus (Altini 2019, 2023). (mittel für Größenordnung, schwach für exakte Zahlen)
- **Beat-to-Beat-Zugriff.** `HKHeartbeatSeriesSample` existiert seit iOS 13/watchOS 6 und wird per `HKHeartbeatSeriesQuery` ausgelesen (Apple-Doku). Daraus lässt sich rMSSD selbst berechnen; HRV4Training macht genau das (Altini 2019). Einschränkungen: Laut einem Apple-Mitarbeiter im Entwicklerforum gibt es keine API, mit der Dritt-Apps eine Messung auf der Uhr auslösen können; Workouts erzeugten im dortigen Test keine Serien, 2-Minuten-Achtsamkeits-Sessions schon (Apple Developer Forums, Thread 777751). Ob zu jeder SDNN-Hintergrundmessung eine Heartbeat-Serie vorliegt, blieb ungeklärt. Lücken in der Serie müssen behandelt werden. (mittel)
- **Validierung.**
  - Hernando et al. (2018), n = 20, Polar H7 als Referenz: RR-Intervalle mit Übereinstimmung > 0,9; im Mittel ca. 5 Lücken je Aufnahme von je ca. 6,5 s; SDNN, rMSSD, pNN50 davon nicht signifikant betroffen, LF/HF-Leistung signifikant reduziert. (mittel; kleine Stichprobe, Atmen-App)
  - O'Grady et al. (2024), n = 39, 316 Morgenmessungen, Series 9/Ultra 2 per Atmen-App gegen Polar H10/Kubios: mittlere SDNN-Differenz 8,3 ms (95 %-KI 5,6–11,0), Limits of Agreement −53,8 bis +37,2 ms, MAPE 28,9 %; Ruhepuls dagegen MAPE 5,9 %, Bias ca. 0,1 bpm. Die Autoren raten von Absolutwerten ab, Trends seien eventuell nutzbar. Die Richtung des Bias war in meinem Abruf uneinheitlich dargestellt (Text: Unterschätzung; Mittelwerte Apple 93,3 vs. Referenz 85 ms) – **bitte im Original prüfen**. (mittel)
  - Bonneval et al. (2025), n = 78, Series 6 gegen 3-Kanal-EKG: mittlere Schlagintervalle in Ruhe sehr gut (MAPE 1,15 %, CCC 0,991), die Variabilitätskennzahl dagegen schlecht (MAPE ca. 31 % in Ruhe, bis ca. 93 % unter Bewegung/Gespräch); 43,6 % fehlende Aufzeichnungen beim Sprechen. (mittel)
  - Miller et al. (2022, sechs Wearables): Titel und DOI bestätigt, Volltext nicht abrufbar; wie Apple-HRV dort behandelt wurde, ist **nicht verifiziert**.
  - „Khushhal“: Die auffindbare Arbeit (Khushhal et al. 2017) validiert die Herzfrequenz unter Belastung, nicht HRV. Als HRV-Beleg ungeeignet.
- **Altinis Empfehlung** (Expertenmeinung, mit Eigeninteresse als App-Hersteller): Hintergrunddaten ignorieren; morgens nach dem Aufwachen im Sitzen 1–2 min per Atmen-App messen, rMSSD aus den Intervallen berechnen, gegen den eigenen Normalbereich aus 1–2 Monaten lesen. Begründung: HRV steigt im Nachtverlauf und hängt von der Schlafphase ab; ein Punkt um 1 Uhr und einer um 4 Uhr sind nicht vergleichbar. Automatische Messungen seien nicht validiert.
- **Vitals-App.** Bei Einführung (watchOS 11) nutzte Vitals Herzfrequenz, Atemfrequenz, Handgelenktemperatur, Blutsauerstoff und Schlafdauer – **kein HRV**. Laut Apple-Support (Stand 14.09.2026) ersetzt HRV die Schlafdauer nur auf Series 12 und Ultra 4; der typische Bereich braucht 7 Nächte; eine Mitteilung kommt, wenn mehrere Werte außerhalb liegen. Laut DC Rainmaker (10/2026) misst die Series 12 alle 5 Minuten, mittelt über Schlafphasen und nutzt für Nachtwerte **rMSSD**; ältere Uhren bekommen das nicht. Ob und wie diese Werte in HealthKit für Dritt-Apps erscheinen, ist **nicht verifiziert** und muss am Gerät geprüft werden. (mittel)

### 3. Mess-Methodik

- **Morgen vs. Nacht.** Buchheit (2014) empfiehlt 5 min nach dem Aufwachen; Nachtaufnahmen seien theoretisch am besten standardisiert, aber durch Schlafmuster gestört. Die Befundlage Nacht vs. Morgen nennt er widersprüchlich. Nuuttila et al. (2022) steuerten erfolgreich mit Nacht-Ln-rMSSD aus einem 4-h-Fenster ab 30 min nach Einschlafen (durchgehende Messung, Polar). Neuere Arbeiten zum direkten Vergleich (Nuuttila et al. 2022 IJSPP; 2024 Sports Med Open) konnte ich nur dem Titel nach bestätigen. (mittel; beide Wege vertretbar, sofern durchgehend bzw. standardisiert)
- **Ln-Transformation.** Standard in der Plews/Buchheit-Linie, weil rMSSD rechtsschief verteilt ist. Vesterinen et al. (2016) nutzten untransformiertes rMSSD. (mittel)
- **Mittelung.** Einzeltage sind zu verrauscht: Bei überlasteten Triathleten zeigten nur Wochenmittel einen Gruppenunterschied (ES 0,40 ± 0,28), Einzeltagswerte nicht (Le Meur et al. 2013). Rauschen sinkt mit 1/√n (Buchheit 2014). Das 7-Tage-gleitende Mittel stammt aus Plews et al. (2012) und Vesterinen et al. (2016). (mittel bis stark)
- **Mindestzahl Messungen.** Mindestens 3 gültige Werte pro Woche bei trainierten Triathleten (Plews et al. 2014, Abstract verifiziert); ca. 5 bei Freizeitsportlern wegen höherer Tag-zu-Tag-Streuung (nur über Sekundärquelle Flatt 2014 bestätigt). Buchheit (2014): mindestens 3–4 pro Woche. (mittel)
- **Tag-zu-Tag-Streuung.** CV von Ln rMSSD ca. 10–20 %, typischer Fehler ca. 12 % (Buchheit 2014).
- **SWC und Normalbereich.** Es gibt keinen Konsens: 0,5 × CV, 1 × CV oder Anteile der Zwischen-Athleten-SD; Buchheit (2014) hält fest, dass für keinen Anteil ein praktischer Bedeutungsnachweis vorliegt, und nennt ca. 3 % als SWC für Ln rMSSD. Verbreitet: individuelles Mittel ± 0,5 SD aus 4 Wochen (Vesterinen 2016; Nuuttila 2022). Kiviniemi (2007, 2010) nutzte 10-Tage-Mittel − 1 SD. HRV4Training nutzt 60 Tage; die genaue Breite nennt der gelesene Beitrag nicht (Altini 2021). (schwach: Konvention, nicht validierter Schwellenwert)
- **CV als Marker.** In einer Fallstudie mit zwei Elite-Triathleten über 77 Tage fielen beim später nicht-funktionell überlasteten Athleten das 7-Tage-Mittel (−0,17 ms/Woche) und dessen CV (−0,65 %/Woche) (Plews et al. 2012). Das ist n = 1 gegen n = 1. Flatt & Esco habe ich nicht primär geprüft. (schwach)

### 4. Evidenz: HRV-gesteuert vs. fester Plan

| Studie | n, Population, Dauer | Entscheidungsregel | Ergebnis |
|---|---|---|---|
| Kiviniemi 2007 | 26 mäßig fitte Männer, 4 Wo. | Morgen-HF-Leistung; fällt sie unter 10-Tage-Mittel − 1 SD oder sinkt 2 Tage in Folge → locker/Ruhe, sonst intensiv | Maximalgeschwindigkeit +0,9 vs. +0,5 km/h (p = 0,048); VO2peak-Änderung ohne Gruppenunterschied |
| Kiviniemi 2010 | 53 Männer und Frauen, 8 Wo. | SD1 gegen gleitendes 10-Tage-Mittel/SD; Frauen-Variante strenger (nur bei SD1 ≥ Mittel und steigend intensiv) | Männer: Loadmax besser (p = 0,033), VO2peak n. s. (p = 0,156). Frauen: gleiche Zuwächse bei weniger intensiven Einheiten (p < 0,001) |
| Vesterinen 2016 | 40 Freizeitläufer, 8 Wo. | 7-Tage-Mittel rMSSD (4 min, morgens, liegend) innerhalb Mittel ± 0,5 SD der 4-Wochen-Vorphase → moderat/intensiv; außerhalb (auch **darüber**) → nur locker; SWC einmal nach 4 Wo. neu berechnet | 3000 m +2,1 % vs. +1,1 % (ES zwischen Gruppen 0,42, klein); 13,2 vs. 17,7 harte Einheiten (p = 0,021) |
| Nuuttila 2017 | 24 trainierte Männer, 8 Wo. | HRV-gesteuerte Blockplatzierung (Regel im Abstract nicht genannt) | beide besser; relative Vmax-Änderung größer in HRV-Gruppe (p < 0,05) |
| Javaloyes 2019 | 17 Radsportler, 8 Wo. | 7-Tage-Mittel gegen SWC (Regel nur dem Titel/Review nach, im Abstract nicht ausgeführt) | HRV-Gruppe: PPO +5,1 %, 40-min-Zeitfahren +7,3 %; Gruppenvergleich **nicht signifikant** |
| Javaloyes 2020 | 20 Radsportler, 8 Wo., vs. Blockperiodisierung | wie oben (nicht verifiziert) | mehr Kenngrößen verbessert in HRV-Gruppe; Endzustand zwischen Gruppen ähnlich |
| Carrasco-Poyatos 2022 | 12 Profiläufer, 8 Wo. | tägliches Morgen-rMSSD (60 s, HRV4Training) | Maximalgeschwindigkeit nur in HRV-Gruppe gestiegen (d = 0,66); kein berichteter VO2max-Gruppenunterschied; n = 6 je Gruppe |
| Nuuttila 2022 | 30 Freizeitläufer, 12 Wo. | **multimodal**, zweimal pro Woche: 3-Tage-Nacht-Ln-rMSSD innerhalb 4-Wochen-Mittel ± 0,5 SD, Muskelkater und Müdigkeit ≤ 5 von 7, HF-Tempo-Index nicht mehr als 0,50 schlechter als 2-Wochen-Mittel → Last erhöhen (+5 %), halten oder senken (−25 %, weniger HIT) | 10 km −6,2 % vs. −2,9 % (p = 0,002; ES 1,23, 95 %-KI 0,42–2,02); 81 % vs. 23 % „High Responder“; 55 % der Entscheidungen „halten“, 35 % „erhöhen“, 10 % „senken“ |

**Meta-Analysen.**
- Manresa-Rocamora et al. (2021), 8 Studien, n = 199: VO2max SMD 0,13 (95 %-KI −0,12 bis 0,39), maximale aerobe Leistung 0,20 (−0,07 bis 0,47), Ausdauerleistung 0,20 (−0,09 bis 0,48) – **alle nicht signifikant**. Nur rMSSD/SD1 selbst stieg stärker (0,50; 0,09–0,91). Bias-Risiko überwiegend unklar bis hoch. Einzelbefunde zu Negativ-Respondern: 14,3 % vs. 37,5 % (Javaloyes) und 11,1 % vs. 50 % (VO2max-Abnahme) bei winzigen Gruppen. (mittel)
- Granero-Gallegos et al. (2020), 6 RCTs, n = 195: Prä-Post-Effekt VO2max 0,402 (0,273–0,531) vs. 0,215 (0,101–0,329). Das sind Innerhalb-Gruppen-Effekte bei I² = 94 %; genau diese Methodik kritisieren Manresa-Rocamora et al. (schwach bis mittel)
- Düking et al. (2021): Volltext nicht abrufbar. Laut Schaffarczyk & Sperlich (2026) kein signifikanter Vorteil bei VO2max/Leistung (gepoolte g 0,079–0,171), günstiger nur für Schwellenmaße (g = 0,296; 0,031–0,562) mit Hinweis auf Publikationsbias. (mittel, indirekt)
- Medellín Ruiz et al. (2020): nicht gesucht/verifiziert, daher nicht verwendet.

**Kritik zusammengefasst** (Schaffarczyk & Sperlich 2026; Manresa-Rocamora 2021): kleine Stichproben (6–20 je Gruppe), maximal ca. 8–12 Wochen, Frauen unterrepräsentiert, Regeln von Forschern manuell angewandt, heterogene Indizes und Baselines. Die deutlichste positive Studie (Nuuttila 2022) ist multimodal und erlaubt keine Aussage über HRV allein; sie wurde von Polar mitfinanziert.

### 5. Grenzen

- **Hohes HRV ist nicht immer gut.** Funktionell überlastete Triathleten (13 von 16 nach 3 Wochen +40 % Last) zeigten *steigendes* Ln rMSSD im Wochenmittel bei sinkender Leistung (Le Meur et al. 2013). Vesterinen (2016) behandelte deshalb auch Werte oberhalb des Bandes als Stoppsignal. (mittel)
- **Sättigung.** Bei niedriger Herzfrequenz (RR > ca. 1000 ms) sinken vagale Indizes trotz hoher Vagusaktivität; Buchheit (2014) empfiehlt, rMSSD zusammen mit dem RR-Intervall bzw. Ruhepuls zu lesen. Betrifft vor allem sehr Trainierte. (mittel)
- **Alkohol.** 4098 Personen, 12 411 Tage: rMSSD in den ersten 3 Schlafstunden −2,0 / −5,7 / −12,9 ms und Puls +1,4 / +4,0 / +8,7 bpm bei niedriger / mittlerer / hoher Dosis (Pietilä et al. 2018). (stark)
- **Menstruationszyklus.** Vagal vermitteltes HRV ist in der Lutealphase niedriger, gekoppelt an Progesteron (Schmalenberger et al. 2020; Meta-Analyse 2019 nur dem Titel nach bestätigt, Effektstärke nicht verifiziert). Ein 30–60-Tage-Fenster mittelt den Zyklus heraus, ein 7-Tage-Mittel nicht. (mittel)
- **Unspezifität.** HRV reagiert auf Krankheit, Schlaf, Hydrierung, Stress; Trinken direkt vor der Messung kann den Wert akut stark erhöhen (Altini 2023, Expertenmeinung). Ektopische Schläge können Indizes in 5 min um bis zu 50 % verändern (Buchheit 2014).
- **Für eine Verbraucher-App heißt das:** Ein Abfall ist ein Hinweis auf „irgendeine Belastung“, kein Beleg für Trainingsermüdung; Ursachenabfrage (Alkohol, Krankheit, Schlaf) und ein zweites Signal sind nötig.

### 6. Was für MyRace folgt

| Parameter | Vorschlag | Beleglage |
|---|---|---|
| Rolle von HRV | eines von mehreren Signalen; nie allein und nie auf Einzeltagsbasis eine harte Einheit streichen | gestützt: Le Meur 2013, Nuuttila 2022, Meta-Analysen |
| Kennzahl | wenn Heartbeat-Serien vorhanden: Ln rMSSD selbst berechnen; sonst Ln SDNN als Ersatz mit niedrigerem Vertrauen; beide nie mischen | rMSSD gestützt; SDNN-Ersatz **Heuristik** |
| Quelle | Rangfolge: (a) Series 12/Ultra 4 Nachtwerte, falls in HealthKit verfügbar; (b) angeleitete Morgenmessung per Achtsamkeit-App direkt nach dem Aufwachen; (c) Hintergrund-SDNN nur aus dem Schlaffenster | (b) gestützt (O'Grady, Hernando, Altini); (a) ungeprüft; (c) **Heuristik**, von Altini ausdrücklich abgelehnt |
| Nachtaggregation für (c) | Median aller Schlafwerte, nur wenn ≥ 3 Werte; sonst „keine HRV heute“; AFib-Verlauf als optionaler Hinweis für mehr Messpunkte | Median und Mindestzahl **Heuristik**; Schlafphasen-/Uhrzeiteffekt belegt das Problem |
| Transformation | natürlicher Logarithmus vor allen Mittelwerten | Konvention, gestützt |
| Kurzfenster | 7-Tage-gleitendes Mittel, gültig ab ≥ 4 Werten (konservativ zwischen 3 und 5) | gestützt: Plews 2014, Vesterinen 2016 |
| Baseline | gleitend 28 Tage als Start (wie in den Studien), optional 60 Tage als stabiler Langzeitbezug | 28 Tage gestützt; 60 Tage Praxis (Altini) |
| Aufwärmphase | mindestens 14 Tage mit ≥ 10 gültigen Werten, vorher kein HRV-Urteil | **Heuristik** (Apple Vitals nutzt 7 Nächte; Studien 4 Wochen) |
| Normalband | Baseline-Mittel ± 0,5 SD für das 7-Tage-Mittel; für Apple-SDNN eher ± 1 SD wegen Messrauschen | ± 0,5 SD Konvention aus Studien; ± 1 SD **Heuristik** |
| Regel | 7-Tage-Mittel unter Band **und** mindestens ein weiteres Signal auffällig (Ruhepuls erhöht, subjektiv schlecht) → harte Einheit zu locker tauschen; nur HRV auffällig → Hinweis, keine Änderung | Kombination gestützt durch Nuuttila 2022; genaue Verknüpfung **Heuristik** |
| Werte über dem Band | nicht als „super erholt“ belohnen; neutral, bei gleichzeitig schlechtem Befinden als Warnzeichen | gestützt: Le Meur 2013, Vesterinen 2016 |
| Entscheidungsrhythmus | Lastanpassung höchstens zweimal pro Woche, tägliche Anzeige rein informativ | gestützt: Nuuttila 2022 |
| CV des Ln-Werts | anzeigen oder intern mitführen, nicht für Entscheidungen | schwach (Fallstudie) |
| Kontext | Alkohol, Krankheit, Zyklusphase abfragen und den Tag markieren bzw. aus der Baseline nehmen | Effekt belegt; Ausschluss aus Baseline **Heuristik** |
| Ruhepuls | gleichwertig oder höher gewichten als Apple-HRV | gestützt: O'Grady 2024 (MAPE 5,9 % vs. 28,9 %) |
| Kommunikation | „deutet auf erhöhte Belastung hin“, keine Leistungs- oder Gesundheitsversprechen | folgt aus Abschnitt 4 und 5 |

**Offene Punkte zur Klärung am Gerät:** (1) Wie viele SDNN-Werte und Heartbeat-Serien fallen pro Nacht auf Antons Testgeräten tatsächlich an? (2) Liefert die Series 12 Nacht-rMSSD über HealthKit? (3) Wie stark streut der Nachtmedian von Tag zu Tag gegenüber einer Morgenmessung?

### Quellen

**Reviews, Methodik**
- Buchheit M (2014). Monitoring training status with HR measures: do all roads lead to Rome? *Front Physiol* 5:73. DOI 10.3389/fphys.2014.00073. (Volltext gelesen)
- Shaffer F, Ginsberg JP (2017). An Overview of Heart Rate Variability Metrics and Norms. *Front Public Health* 5:258. DOI 10.3389/fpubh.2017.00258. (Volltext teilweise gelesen)
- Task Force of the ESC and NASPE (1996). Heart rate variability: standards of measurement, physiological interpretation and clinical use. *Circulation* 93:1043–1065 / *Eur Heart J* 17:354–381. Existenz bestätigt; Band/Seiten und Inhalt nicht verifiziert.
- Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M (2013). Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring. *Sports Med*. Titel bestätigt; Band, Seiten, DOI nicht verifiziert; nicht gelesen.
- Plews DJ et al. (2012). Heart rate variability in elite triathletes, is variation in variability the key to effective training? A case comparison. *Eur J Appl Physiol* 112(11):3729–3741. DOI 10.1007/s00421-012-2354-4. (Abstract)
- Plews DJ et al. (2014). Monitoring training with heart-rate variability: how much compliance is needed for valid assessment? *Int J Sports Physiol Perform* 9(5):784–791 (anderswo 783–790 angegeben). DOI 10.1123/IJSPP.2013-0455. (Abstract)
- Flatt A (2014). HRV Measurement Frequency: Comparing 3 day to 7 day per week recordings. Blog. https://hrvtraining.com/2014/01/29/hrv-measurement-frequency-comparing-3-day-to-7-day-per-week-recordings/
- Le Meur Y et al. (2013). Evidence of parasympathetic hyperactivity in functionally overreached athletes. *Med Sci Sports Exerc* 45(11):2061–2071. DOI 10.1249/MSS.0b013e3182980125. (Abstract)
- Kiviniemi AM et al. (2004). Saturation of high-frequency oscillations of R-R intervals in healthy subjects and patients after acute myocardial infarction during ambulatory conditions. *Am J Physiol Heart Circ Physiol*. DOI 10.1152/ajpheart.00433.2004. Titel bestätigt, nicht gelesen.
- Schaffarczyk M, Sperlich B (2026). Heart rate variability–guided endurance training: evaluating strengths, weaknesses, opportunities, and threats for load prescription and adjustment. *Front Sports Act Living* 8. DOI 10.3389/fspor.2026.1858271. (Volltext teilweise gelesen)

**Interventionsstudien**
- Kiviniemi AM, Hautala AJ, Kinnunen H, Tulppo MP (2007). Endurance training guided individually by daily heart rate variability measurements. *Eur J Appl Physiol* 101(6):743–751. DOI 10.1007/s00421-007-0552-2. (Abstract)
- Kiviniemi AM et al. (2010). Daily exercise prescription on the basis of HR variability among men and women. *Med Sci Sports Exerc* 42(7):1355–1363. DOI 10.1249/MSS.0b013e3181cd5f39. (Abstract)
- Vesterinen V et al. (2016). Individual endurance training prescription with heart rate variability. *Med Sci Sports Exerc* 48(7):1347–1354. DOI 10.1249/MSS.0000000000000910. (Abstract und Methodenteil des Manuskripts)
- Nuuttila OP et al. (2017). Effects of HRV-guided vs. predetermined block training on performance, HRV and serum hormones. *Int J Sports Med* 38(12):909–920. DOI 10.1055/s-0043-115122. (Abstract)
- Javaloyes A, Sarabia JM, Lamberts RP, Moya-Ramón M (2019). Training prescription guided by heart-rate variability in cycling. *Int J Sports Physiol Perform* 14:23–32. DOI 10.1123/ijspp.2018-0122. (Abstract)
- Javaloyes A et al. (2020). Training prescription guided by heart rate variability vs. block periodization in well-trained cyclists. DOI 10.1519/JSC.0000000000003337 (vermutlich *J Strength Cond Res*; Band/Seiten nicht verifiziert). (Abstract)
- Carrasco-Poyatos M, González-Quílez A, Altini M, Granero-Gallegos A (2022). Heart rate variability-guided training in professional runners: effects on performance and vagal modulation. *Physiol Behav* 244:113654. DOI 10.1016/j.physbeh.2021.113654. (Abstract)
- Nuuttila OP, Nummela A, Korhonen E, Häkkinen K, Kyröläinen H (2022). Individualized endurance training based on recovery and training status in recreational runners. *Med Sci Sports Exerc* 54(10):1690–1701. DOI 10.1249/MSS.0000000000002968. (Volltext gelesen)
- Nuuttila OP et al. (2022). Reliability and sensitivity of nocturnal heart rate and heart-rate variability in monitoring individual responses to training load. *Int J Sports Physiol Perform* 17(8). DOI 10.1123/ijspp.2022-0145. Titel bestätigt, nicht gelesen.
- Nuuttila OP et al. (2024). Morning versus nocturnal heart rate and heart rate variability responses to intensified training in recreational runners. *Sports Med Open*. DOI 10.1186/s40798-024-00779-5. Titel bestätigt, nicht gelesen.

**Meta-Analysen**
- Granero-Gallegos A, González-Quílez A, Plews D, Carrasco-Poyatos M (2020). HRV-based training for improving VO2max in endurance athletes. *Int J Environ Res Public Health* 17(21):7999. DOI 10.3390/ijerph17217999.
- Manresa-Rocamora A, Sarabia JM, Javaloyes A, Flatt AA, Moya-Ramón M (2021). Heart rate variability-guided training for enhancing cardiac-vagal modulation, aerobic fitness, and endurance performance. *Int J Environ Res Public Health* 18(19):10299. DOI 10.3390/ijerph181910299.
- Düking P et al. (2021). Monitoring and adapting endurance training on the basis of heart rate variability monitored by wearable technologies: a systematic review with meta-analysis. *J Sci Med Sport*. PII S1440-2440(21)00108-0. Nicht gelesen; Zahlen nur indirekt.

**Apple Watch**
- Hernando D, Roca S, Sancho J, Alesanco Á, Bailón R (2018). Validation of the Apple Watch for heart rate variability measurements during relax and mental stress in healthy subjects. *Sensors* 18(8):2619. DOI 10.3390/s18082619. (Abstract)
- O'Grady B, Lambe R, Baldwin M, Acheson T, Doherty C (2024). The validity of Apple Watch Series 9 and Ultra 2 for serial measurements of heart rate variability and resting heart rate. *Sensors* 24(19):6220. DOI 10.3390/s24196220.
- Bonneval L et al. (2025). Validity of heart rate variability measured with Apple Watch Series 6 compared to laboratory measures. *Sensors* 25(8):2380. DOI 10.3390/s25082380.
- Miller DJ, Sargent C, Roach GD (2022). A validation of six wearable devices for estimating sleep, heart rate and heart rate variability in healthy adults. *Sensors* 22(16):6317. DOI 10.3390/s22166317. Nicht gelesen.
- Khushhal A et al. (2017). Validity and reliability of the Apple Watch for measuring heart rate during exercise. *Sports Med Int Open* 1(6):E206–E211. DOI 10.1055/s-0043-120195. Nicht gelesen; kein HRV-Thema.
- Apple. HKHeartbeatSeriesSample. https://developer.apple.com/documentation/healthkit/hkheartbeatseriessample
- Apple Developer Forums. Recording a HeartbeatSeries. https://developer.apple.com/forums/thread/777751
- Apple Support (14.09.2026). Track your overnight and daytime vitals with Apple Watch. https://support.apple.com/120142
- PeakWatch. Frequency of HRV measurement. https://doc.peakwatch.co/en/guide/frequency-of-hrv-measurement.html (Dritthersteller)
- DC Rainmaker (10/2026). Apple Watch Series 12 In-Depth Review. https://www.dcrainmaker.com/2026/10/apple-watch-series12-in-depth-review-worth-upgrade.html
- Altini M (2023, aktualisiert 2025). Apple Watch and Heart Rate Variability (HRV): a complicated relationship. https://marcoaltini.substack.com/p/apple-watch-and-heart-rate-variability
- Altini M (2018). On Heart Rate Variability and the Apple Watch. https://medium.com/@marco_alt/on-heart-rate-variability-and-the-apple-watch-24f50e8e7bc0
- Altini M (o. J., Stand iOS 16). How to make sense of your Apple Watch Heart Rate Variability (HRV) data. https://medium.com/@marco_alt/how-to-make-sense-of-your-apple-watch-heart-rate-variability-hrv-data-89bf4a510438
- Altini M (2019). Apple Watch update: improved HRV analysis using iOS 13, watchOS 6 and RR intervals. https://www.hrv4training.com/blog2/apple-watch-update-improved-hrv-analysis-using-ios13-watch-os6-and-rr-intervals-available-in-health
- Altini M (2021). Daily score, baseline and normal range: an overview. https://www.hrv4training.com/blog2/daily-score-baseline-and-normal-range-an-overview

**Störfaktoren**
- Pietilä J et al. (2018). Acute effect of alcohol intake on cardiovascular autonomic regulation during the first hours of sleep in a large real-world sample of Finnish employees. *JMIR Ment Health* 5(1):e23. DOI 10.2196/mental.9519.
- Schmalenberger KM et al. (2020). Menstrual cycle changes in vagally-mediated heart rate variability are associated with progesterone. *J Clin Med* 9(3):617. DOI 10.3390/jcm9030617. (Abstract)
- Schmalenberger KM et al. (2019). A systematic review and meta-analysis of within-person changes in cardiac vagal activity across the menstrual cycle. *J Clin Med* (Details nicht verifiziert, nicht gelesen).

---

## B2 – Ruhepuls, nächtliche Herzfrequenz, Atemfrequenz, Hauttemperatur, Schlaf und Krankheitserkennung


Stand: 11.11.2026. Strang für das deterministische Readiness-System von MyRace (HRV wird separat bearbeitet).

**Zur Methode und ihren Grenzen.** Recherche per Websuche und Seitenabruf. PubMed und ein Teil der PMC-Seiten waren durch eine Browserprüfung gesperrt. Mehrere Arbeiten konnte ich deshalb nur über Preprint, Repositorium, Verlagsseite oder Pressemitteilung prüfen. Das steht jeweils in der Quellenliste. Evidenzstufen: **stark** (Meta-Analyse oder mehrere große, übereinstimmende Studien), **mittel** (einzelne große oder mehrere kleine Studien), **schwach** (kleine, retrospektive oder widersprüchliche Studien), **Expertenmeinung** (Konsens ohne Validierung).

---

### 1. Ruhepuls und nächtliche Herzfrequenz als Ermüdungs- und Krankheitsmarker

**Normale Schwankung.** Quer et al. (2020) werteten 92.457 Erwachsene mit rund 32,7 Mio. Tageswerten aus. Die mittlere Standardabweichung des täglichen Ruhepulses innerhalb einer Person lag bei 3,03 Schlägen pro Minute (Frauen 3,10, Männer 2,90). Die mediane Spanne innerhalb einer Woche (Maximum minus Minimum) betrug etwa 3 Schläge. Rund 20 % der Personen hatten mindestens eine Woche mit einer Spanne von 10 Schlägen oder mehr. Zwischen Personen reichte der mittlere Ruhepuls von 39,7 bis 108,6; Alter, Geschlecht, BMI und Schlafdauer erklärten weniger als 10 % davon. Saisonal schwankte der Bevölkerungsmittelwert um etwa 2 Schläge (Hoch Anfang Januar, Tief Ende Juli). **Evidenz: stark** für die Größenordnung, aber Fitbit-Nutzer, keine Sportlerstichprobe.

Folge: Nur die persönliche Baseline taugt als Bezug. Eine Abweichung von 3 Schlägen ist Alltag, kein Signal. Quer et al. definierten einen „ungewöhnlichen Anstieg“ als mehr als 2 SD über dem Mittel der letzten 20 Messungen an mindestens drei aufeinanderfolgenden Messungen binnen 5 Tagen; das trat im Median 3-mal in zwei Jahren auf (IQR 2–5).

**Ermüdung und Überlastung.** Bosquet et al. (2008, Meta-Analyse): Kurzfristige Überlastung (bis 2 Wochen) erhöht den Ruhepuls moderat (SMD 0,55; p = 0,01) und senkt die maximale Herzfrequenz (SMD −0,75). Bei längerer Überlastung (über 2 Wochen) ändert sich der Ruhepuls nicht; nur submaximale und maximale Herzfrequenz sinken leicht (SMD −0,38 bzw. −0,33). Die Autoren halten die Effekte für klinisch begrenzt nutzbar, weil sie in der normalen Tagesschwankung liegen können. **Evidenz: mittel**, Richtung klar, Nutzen für den Einzelfall gering.

Der ECSS/ACSM-Konsens (Meeusen et al. 2013) bestätigt das: Veränderungen des Ruhepulses treten beim Übertrainingssyndrom nicht verlässlich auf, und kein physiologischer Marker trennt funktionelle Überlastung, nicht-funktionelle Überlastung und Übertraining. Zur nächtlichen Herzfrequenz äußert sich der Konsens nicht eigens. **Evidenz: Expertenmeinung auf Basis schwacher Daten.**

Buchheit (2014) gibt für die Ruhe-Herzfrequenz einen typischen Messfehler von etwa 10 % (Variationskoeffizient) bei einer kleinsten bedeutsamen Änderung von etwa 2 % an, also ein Signal-Rausch-Verhältnis unter 1 (0,7). Mittelung über mehrere Tage senkt das Rauschen um den Faktor 1/√n; Zusammenhänge mit Laufleistung zeigten sich erst bei Mittelung über mindestens 3–4 Tage. Er warnt, Herzfrequenzwerte ohne Trainingskontext zu deuten. **Evidenz: mittel** (Übersichtsarbeit eines Experten). Hinweis: Die 10 % beziehen sich auf kurze Morgenmessungen; eine über die ganze Nacht gemittelte Herzfrequenz ist erfahrungsgemäß stabiler, dafür habe ich aber keine eigene Primärquelle geprüft.

**Krankheit.** Radin et al. (2020, Lancet Digital Health) nutzten Fitbit-Daten von 47.249 Personen aus fünf US-Bundesstaaten. Wochen mit erhöhtem Ruhepuls und verändertem Schlaf verbesserten die Schätzung der Grippe-ähnlichen Erkrankungen auf Staatsebene (r = 0,84 bis 0,97 gegenüber CDC-Daten; Verbesserung im Mittel 0,12). Das ist ein Bevölkerungssignal, keine Einzelfalldiagnose. Die exakte Schwellendefinition konnte ich nicht am Volltext prüfen (**nicht verifiziert**). **Evidenz: mittel.**

**Widerspruch/Lücke:** Der Ruhepuls reagiert auf vieles. Alavi et al. (2022) nennen als Auslöser ohne Infekt Stress, intensives Training, Alkohol, Reisen, schlechten Schlaf und Impfungen; in den Winterfeiertagen gab es etwa 1,4-mal so viele Alarme.

---

### 2. Krankheitsfrüherkennung aus Wearables

| Studie | Signal | Stichprobe | Ergebnis |
|---|---|---|---|
| Mishra et al. 2020 | Ruhepuls, Schritte, Schlaf (Smartwatch) | 32 COVID-Fälle laut Publikation; im geprüften Preprint 31 Fitbit-Fälle | Auffällige Herzfrequenz bei 81 %; medianer Anstieg 7 Schläge; Signal im Median 3 Tage vor Symptombeginn; Echtzeit-Verfahren (CuSum) schlug bei 67 % am oder vor Symptomtag an. Spezifität nicht gemessen; 0,35–1 Fehlalarme pro Monat bei 10 Personen. |
| Alavi et al. 2022 | Nächtlicher Ruhepuls gegen laufenden Median („NightSignal“) | 84 COVID-Fälle mit Daten, 3.318 eingeschrieben | Gelb bei etwa +3 Schlägen, Rot bei mindestens +4 Schlägen an zwei Nächten in Folge. Alarm bei 80 % am oder vor Symptom-/Diagnosetag, median 3 Tage vorher. Spezifität etwa 87,7 % pro Tag. Alarme je 21 Tage: 3,42 (COVID-positiv) gegenüber 1,30 (negativ). |
| Quer et al. 2021 (DETECT) | Ruhepuls, Schlaf, Aktivität plus Symptome | 30.529 Teilnehmer, 333 Getestete mit Symptomen (54 positiv) | AUC 0,72 nur Sensoren, 0,71 nur Symptome, 0,80 kombiniert. Ruhepuls mehr als 2 SD erhöht nur bei 30,3 % der Positiven. |
| Miller et al. 2020 (Whoop) | Atemfrequenz im Schlaf | 271 Personen | 20 % vor Symptombeginn erkannt, 80 % bis zum dritten Symptomtag; in der größten Validierungsgruppe aber nur 34,2 % pro Person. Spezifitätswerte konnte ich nicht auslesen (**nicht verifiziert**). |
| Natarajan et al. 2020 (Fitbit) | Atemfrequenz, Herzfrequenz, HRV | 1.181 PCR-positive, 673 analysiert | AUC 0,77; Sensitivität 44–47 % bei 95 % Spezifität; am Tag vor Symptombeginn 21 % (bei 95 %) bzw. 29 % (bei 90 % Spezifität). Atemfrequenz zeigte den größten Effekt und normalisierte sich am langsamsten. |
| Smarr et al. 2020 (Oura) | Fingertemperatur | 50 Personen mit Symptomen, keine Kontrollgruppe | Fieberähnliche Tage vor Symptombeginn bei 38 von 50; mittlerer Anstieg +0,63 ± 1 °C. Keine Sensitivität/Spezifität; Machbarkeitsstudie, herstellerfinanziert. |
| Mason et al. 2022 (TemPredict) | Temperatur, Herzfrequenz, HRV, Atemfrequenz, Aktivität | 73 Trainings-, 10 Validierungsfälle | Sensitivität 82 %, Spezifität 63 %, AUC 0,819; mit Temperatur +4,9 Punkte AUC. Im Mittel 2,75 Tage vor dem Test. AUC bei Frauen 6,7 % niedriger. |

**Bewertung (Evidenz: mittel für „Signal existiert“, schwach für „Einzelfall-Erkennung taugt“).**
- Das Signal ist real, aber unspezifisch. Keine Studie unterscheidet COVID von Grippe, Alkohol oder hartem Training. Fast alle sind retrospektiv, klein und stammen aus 2020/21 (ungeimpfte Bevölkerung, frühe Varianten).
- Bei hoher Spezifität werden weniger als die Hälfte der Fälle erkannt (Natarajan). Wer mehr erkennen will, bezahlt mit Fehlalarmen: 87,7 % Tagesspezifität heißt rund ein Fehlalarm alle 2–3 Wochen pro gesunder Person (Alavi).
- Der Ruhepuls allein ist schwach (Quer 2021: nur 30 % über 2 SD). Mehrere Signale zusammen sind besser (Quer 2021, Mason 2022).
- Die einzige veröffentlichte, voll deterministische Regel ist NightSignal (Alavi): Abstand zum laufenden Median in Schlägen plus Zwei-Nächte-Bedingung.

**Herstellerfunktionen.**
- *Apple Vitals:* Herzfrequenz, Atemfrequenz, Handgelenkstemperatur, Blutsauerstoff und Schlafdauer über Nacht; typischer Bereich nach 7 Nächten; Hinweis am Morgen, wenn „mehrere“ Messwerte außerhalb liegen. Apple nennt als mögliche Ursachen Medikamente, Höhe, Alkohol und Krankheit und erklärt die Werte als nicht für medizinische Zwecke gedacht. Die oft genannte Schwelle „mindestens 2 Messwerte“ steht auf der geprüften Apple-Seite so nicht (**Zahl nicht verifiziert**).
- *Oura Symptom Radar:* Temperatur, Atemfrequenz, Ruhepuls, HRV und inaktive Zeit gegen die eigene Baseline; drei Stufen (keine, leichte, deutliche Anzeichen); empfiehlt Ruhe; kein Medizinprodukt. Der Algorithmus ist nicht offengelegt.
- *Whoop Health Monitor:* Atemfrequenz, Blutsauerstoff, Ruhepuls, HRV, Hauttemperatur im Schlaf; Ampel pro Messwert gegen den eigenen Bereich; ausdrücklich keine Diagnose, Hinweis auf Trends über mehrere Tage. Das Baseline-Fenster ist nicht dokumentiert.

Gemeinsames Muster: persönliche Baseline, mehrere Signale, vorsichtige Sprache, kein Krankheitsname.

**Neck Check und Rückkehr ins Training.** Die Regel „Symptome oberhalb des Halses: leichtes Training möglich; unterhalb oder Fieber: Pause“ ist laut IOC-Konsens (Schwellnus et al. 2022, Teil 1) historische Expertenmeinung ohne Validierung; ihre Gültigkeit wird in Frage gestellt. **Evidenz: Expertenmeinung.** Der Konsens setzt stattdessen auf Schweregrad und Stufen:
- Etwa 80 % der akuten Atemwegsinfekte bei Sportlern sind mild. Systemische Symptome (Fieber, Krankheitsgefühl, Muskelschmerzen, Erschöpfung) zeigen einen schwereren Verlauf an; bei schwerem Verlauf Ruhe bis zum Abklingen.
- Symptome erreichen meist nach 2–3 Tagen den Höhepunkt und klingen nach 7–10 Tagen ab; mehr als 7 Tage gelten als Zeichen eines schwereren Infekts.
- Vor der Steigerung ein selbst durchgeführter Belastungstest: 10–20 Minuten bei 60–70 % der üblichen Intensität. Abbruchzeichen: übermäßige Erschöpfung, Atemnot, Brustschmerz, Schwindel, Herzrasen, deutlich höhere Anstrengung bei gleicher Last.
- Herzmuskelentzündung ist selten (nach SARS-CoV-2 in größeren Studien unter 3 %), die Datenlage dünn.

Snyders et al. (2022, Meta-Analyse, 54 Arbeiten, 31.065 Personen): 20,4 % der Infekte kosten mehr als einen Trainingstag; Symptome dauern im Mittel 7,1 Tage; nur vier Studien nennen Tage bis zur Rückkehr (0 bis 8,5). **Evidenz: mittel** für Dauer und Ausfall, **schwach** für Rückkehrkriterien.

---

### 3. Atemfrequenz im Schlaf und Handgelenkstemperatur

**Atemfrequenz.** In 25.000 Whoop-Nutzern (750.000 Nächte) lag die mittlere Standardabweichung innerhalb einer Person über 30 Nächte bei 0,51 ± 0,20 Atemzügen pro Minute; der Variationskoeffizient war niedriger als bei Ruhepuls und HRV (Miller et al. 2020). Ein Anstieg um 1 Atemzug entspricht also rund 2 SD. Bei COVID zeigte die Atemfrequenz den größten und am längsten anhaltenden Effekt (Natarajan et al. 2020). **Evidenz: mittel** (große Datensätze, aber Herstellerstudien und nur COVID). Für Erkältungen oder Grippe fand ich keine vergleichbaren Zahlen.

**Temperatur.** Wearables messen Hauttemperatur als Abweichung von der eigenen Baseline, keine Kerntemperatur; die Sensoren sind teils unkalibriert (Smarr 2020). Mit Temperatur stieg die Erkennungsgüte bei Mason et al. um 4,9 AUC-Punkte. Zur Nacht-zu-Nacht-Streuung der Apple-Handgelenkstemperatur fand ich keine unabhängige Primärquelle (**Lücke**).

**Menstruationszyklus.** Maijala et al. (2019; 22 Frauen, 41 Zyklen, Oura-Ring): Die nächtliche Hauttemperatur lag in der Lutealphase im Mittel 0,30 °C (SD 0,12) höher als in der Follikelphase; oral 0,23 °C. **Evidenz: mittel** (kleine Pilotstudie, Effekt aber physiologisch gut etabliert). Die im Auftrag genannte Spanne 0,3–0,5 °C ist damit am unteren Ende belegt. Mason et al. fanden bei Frauen eine um 6,7 % niedrigere AUC, was zu dieser Störgröße passt.

**Deterministischer Umgang ohne Zyklusdaten:**
1. Baseline über mindestens 28 Nächte (Median). Dann enthält sie beide Zyklusphasen, und die lutealen Nächte liegen nur etwa 0,15–0,3 °C über dem Median.
2. Temperaturschwelle über dem Zykluseffekt ansetzen: mindestens +0,5 °C.
3. Temperatur nie allein werten, sondern nur zusammen mit Herzfrequenz oder Atemfrequenz.
4. Plötzlicher Sprung (von einer Nacht zur nächsten) statt langsamer Drift über mehrere Tage als Kriterium.

Das ist mein Vorschlag, abgeleitet aus den Zahlen; eine Studie, die genau diese Regel prüft, habe ich nicht gefunden. Ob auch der Ruhepuls zyklisch schwankt, habe ich nicht recherchiert.

---

### 4. Schlaf, Ausdauerleistung und Verletzung

**Akuter Schlafverlust.** Craven et al. (2022, Meta-Analyse; 69 Arbeiten, 227 Messgrößen, 959 Teilnehmer, 89 % Männer): mittlerer Leistungsverlust 7,56 % (95 %-KI −11,9 bis −3,13), bei extremer Heterogenität (I² = 98,1 %). Wichtige Differenzierungen:
- Durchgängig negativ nur bei komplettem Schlafentzug und bei früherem Aufstehen. Späteres Einschlafen zeigte keine einheitliche Wirkung.
- Pro zusätzlicher Stunde Wachzeit vor der Belastung etwa 0,4 % Verlust.
- Leistung am Nachmittag/Abend litt, am Morgen weitgehend nicht.
- Alle Kategorien waren betroffen, auch Ausdauer (22 Messgrößen). Den Einzelwert für Ausdauer konnte ich nicht auslesen (**nicht verifiziert**).

**Evidenz: mittel.** Der Mittelwert stammt großteils aus Totalentzug und ist nicht auf „eine Nacht mit 5,5 Stunden“ übertragbar. Walsh et al. (2021, BJSM-Konsens) nennen die Wirkung von 1–3 Nächten Teil-Schlafentzug ausdrücklich unklar. Fullagar et al. (2015) bewerten die Befunde als uneinheitlich; manche Maximalleistungen bleiben erhalten.

**Eine schlechte Nacht: Leistung oder Anstrengungsempfinden?** Roberts et al. (2019; 9 Radsportler/Triathleten, Zeitfahren an aufeinanderfolgenden Tagen): Mit rund 5 Stunden Schlaf pro Nacht war das Zeitfahren am Ende etwa 3 % langsamer, mit rund 8,5 Stunden etwa 3 % schneller als mit 7 Stunden. Die empfundene Anstrengung war in allen Bedingungen gleich; Stimmung und Reaktionsfähigkeit litten bei Schlafmangel. **Evidenz: schwach bis mittel** (n = 9; Zahlen aus der Pressemitteilung der Universität, Abstract nicht abrufbar). Die verbreitete Annahme „eine schlechte Nacht wirkt nur über das Anstrengungsempfinden“ konnte ich mit den geprüften Quellen weder belegen noch widerlegen; Roberts spricht eher dafür, dass über mehrere Nächte die Leistung selbst sinkt.

**Kumulierte Schlafschuld.** Van Dongen et al. (2003; 48 Erwachsene, 14 Tage): 6 Stunden oder weniger pro Nacht führten zu kognitiven Defiziten wie nach bis zu zwei durchwachten Nächten. Die empfundene Schläfrigkeit stieg dabei kaum weiter an; die Teilnehmer bemerkten ihr Defizit nicht. **Evidenz: mittel**, aber kognitiv, nicht Ausdauer. Für MyRace wichtig: Das Gefühl ist bei chronischem Schlafmangel kein verlässlicher Maßstab, also ist die gemessene Dauer über mehrere Tage ein sinnvolles eigenes Signal.

**Schlafverlängerung.** Mah et al. (2011; 11 Basketballer, kein Kontrollarm, Ziel 10 Stunden über 5–7 Wochen): Sprint 16,2 auf 15,5 s, Freiwürfe +9 %, Dreier +9,2 %. **Evidenz: schwach** (unkontrolliert, Lerneffekte möglich).

**Schlaf und Infekt.** Prather et al. (2015; 164 Personen, Aktigraphie, experimentelle Virusgabe): unter 6 Stunden 4,2-mal, unter 5 Stunden 4,5-mal so häufig erkältet wie über 7 Stunden. **Evidenz: mittel** (experimentell, aber eine Studie).

**Schlaf und Verletzung.**
- Milewski et al. (2014): 112 Schüler der Klassen 7–12, Fragebogen. Wer regelmäßig mindestens 8 Stunden schlief, verletzte sich deutlich seltener (Kongressbericht: 68 % weniger wahrscheinlich; die publizierte Fassung wird üblicherweise mit „1,7-mal häufiger unter 8 Stunden“ zitiert, die Zahl und ihr Konfidenzintervall konnte ich nicht am Abstract prüfen, **nicht verifiziert**). Pro Klassenstufe stieg das Risiko um das 2,3-Fache. Selbstauskunft, Jugendliche.
- von Rosen et al. (2017): 340 jugendliche Leistungssportler; mehr als 8 Stunden an Wochentagen ging mit 61 % geringerer Verletzungswahrscheinlichkeit einher (OR 0,39; 95 %-KI 0,16–0,99, also knapp signifikant).
- Gao et al. (2019, Meta-Analyse Jugendliche; 7 Studien): OR 1,58 (95 %-KI 1,05–2,37) bei chronisch schlechtem Schlaf; alle Schlafdaten selbstberichtet, gepoolt aus nur drei Studien.
- Ausdauersportler: Die im Auftrag genannte Arbeit fand ich als **Cahalan et al. 2020** (Johnston ist Koautor), Titel „General health complaints and sleep associated with new injury within an endurance sporting population“ (95 Athleten, 52 Wochen). Unter 7 Stunden Schlaf: Hazard Ratio 1,51 (95 %-KI 1,13–2,02) mit 14 Tagen Verzögerung; über 7 Stunden: 0,63. Die Arbeit mit dem im Auftrag genannten Titel („Training Load and Baseline Characteristics…“, Cahalan et al. 2019) behandelt im Abstract Trainingslast und Vorverletzung, nicht Schlaf. Autorenreihenfolge laut Repositorium, **am Verlagstext nicht verifiziert**.
- **Kritisch:** Dobrosielski et al. (2021, systematische Übersicht, 12 prospektive Kohorten bei Erwachsenen) kommen zum Schluss, dass die Evidenz schlechten Schlaf als eigenständigen Risikofaktor für Verletzungen bei erwachsenen Sportlern derzeit nicht stützt.

**Gesamturteil Verletzung: schwach.** Bei Jugendlichen ein konsistenter, aber auf Selbstauskunft beruhender Zusammenhang; bei Erwachsenen unzureichend, mit einer positiven Ausdauerstudie. Kausalität ist nicht gezeigt. Arbeiten von Lastella habe ich nicht eigens geprüft.

---

### 5. Schlafregelmäßigkeit

- Windred et al. (2024; UK Biobank, rund 61.000 Personen, 7 Tage Beschleunigungsmesser): Die oberen vier Fünftel der Regelmäßigkeit hatten ein 20–48 % geringeres Sterberisiko als das unregelmäßigste Fünftel (Index unter 71,6); Regelmäßigkeit sagte Sterblichkeit besser vorher als Dauer. **Evidenz: mittel** (groß, aber Beobachtungsstudie, Alter 40–69, Endpunkt Sterblichkeit). Genaue Hazard Ratios und DOI **nicht verifiziert**.
- Phillips et al. (2017; 61 Studierende, 30 Tage Schlaftagebuch): Einführung des Sleep Regularity Index; unregelmäßige Schläfer hatten einen deutlich späteren Melatoninanstieg (etwa 00:08 gegenüber 21:32 Uhr) und schlechtere Noten (r = 0,37). **Evidenz: schwach bis mittel.**
- Für Erholung oder Leistung bei Ausdauersportlern fand ich **keine belastbare Primärstudie**. Dass Regelmäßigkeit die Trainingsbereitschaft verändert, ist plausibel, aber nicht belegt.

**Berechnung.** Fischer, Klerman und Phillips (2021) vergleichen fünf Maße: Standardabweichung der Schlafzeiten, Interdaily Stability, sozialer Jetlag, Composite Phase Deviation und den Index. Standardabweichung und Interdaily Stability brauchen mehr als eine Woche Daten für unverzerrte Werte. Sozialer Jetlag erfasst nur den Wochenrhythmus, nicht tägliche Sprünge.
- *Sleep Regularity Index:* Anteil der Zeitpunkte, an denen der Zustand (schlafend/wach) derselbe ist wie 24 Stunden zuvor, skaliert auf 0 (zufällig) bis 100 (völlig regelmäßig). Die Skala ist verifiziert; die genaue Formel gebe ich aus Fachwissen wieder, **am Originaltext nicht verifiziert**. Er braucht minutengenaue Schlaf-Wach-Daten.
- *Einfache Alternative für MyRace:* Schlafmittelpunkt = Einschlafzeit + halbe Schlafdauer. Regelmäßigkeit = Standardabweichung des Schlafmittelpunkts über die letzten 14 Nächte (mindestens 8 gültige), in Minuten. Uhrzeiten über Mitternacht vorher auf eine durchgehende Skala bringen (z. B. Minuten ab 18:00 Uhr). Sozialer Jetlag = Betrag der Differenz zwischen mittlerem Schlafmittelpunkt an freien und an Arbeitstagen.

---

### 6. Zuverlässigkeit von Wearable-Schlafdaten

| Quelle | Befund |
|---|---|
| Miller et al. 2022 (53 Erwachsene, 6 Geräte) | Schlaf/Wach-Übereinstimmung 86–89 %. Gesamtschlafzeit: Apple Watch S6 +39,5 min, Garmin +43,8 min, Oura +1,5 min, Whoop −12,2 min, Polar −0,8 min. Phasen-Übereinstimmung 50–65 % (Apple Watch 53 %, Kappa 0,20). Alle Geräte brauchen bei Phasen Verbesserung. |
| Robbins et al. 2024 (35 Erwachsene, eine Nacht; von Oura finanziert) | Schlaf-Sensitivität 95–97 %. Vier-Phasen-Kappa: Oura 0,65, Apple Watch S8 0,60, Fitbit 0,55. Apple Watch: Gesamtschlaf +8 min (n. s.), Leichtschlaf +45 min, Tiefschlaf −43 min, REM +6 min (n. s.). |
| Chinoy et al. 2021 (34 Erwachsene, 7 Geräte) | Sensitivität für Schlaf mindestens 0,93, Spezifität für Wach nur 0,18–0,54. Leichtschlaf durchweg überschätzt; schlechter bei gestörtem Schlaf. |
| de Zambotti et al. 2024 (Übersicht) | Schlaf-Sensitivität meist über 90 %, Wach-Erkennung 20–70 %; Gesamtschlafzeit teils um mehr als eine Stunde überschätzt. Trefferquote Tiefschlaf und REM je etwa 30–80 %, Leichtschlaf 50–90 %. |
| Apple (Whitepaper, Stand Okt. 2025; Herstellerangabe) | 299 Nächte, 166 Personen. Sensitivität 97,9 %, Spezifität 75,0 % (Update 2025: 96,8 % / 78,9 %). Vier-Phasen-Kappa 0,63, im Update 0,68. Häufigster Fehler: echter Tiefschlaf wird als „Kern“ gewertet. Keine Angabe zur Abweichung in Minuten; nicht für klinische Zwecke. |

**Fazit (Evidenz: stark).** Die Schlafdauer ist brauchbar, mit Tendenz zur Überschätzung (Apple Watch je nach Studie +8 bis +40 Minuten), weil ruhiges Wachliegen als Schlaf zählt. Phasen sind unzuverlässig; besonders der Tiefschlaf wird von der Apple Watch um rund 40 Minuten unterschätzt, und die Werte sind zwischen Geräten nicht vergleichbar. **Widerspruch:** Apples eigenes Kappa (0,63–0,68) liegt weit über dem unabhängigen Wert von Miller (0,20, älteres Modell) und nahe an Robbins (0,60).

**Folge:** Ein Readiness-Wert sollte REM- und Tiefschlafanteile nicht verwenden. Dauer, Zeitpunkte und Regelmäßigkeit genügen. Die nächtliche Herzfrequenz ist dagegen gut gemessen (Apple Watch S6: Abweichung 0,5 Schläge; Miller 2022).

---

### 7. Ohne Uhr: selbstberichteter Schlaf

- Lauderdale et al. (2008; 669 Erwachsene): Selbstauskunft 6,8 Stunden gegenüber 6,0 Stunden gemessen (Aktigraphie), Korrelation 0,47. Wer 5 Stunden schlief, gab 1,2 Stunden zu viel an; bei 7 Stunden waren es 0,4. Die Überschätzung ist also gerade bei Kurzschläfern am größten. **Evidenz: mittel bis stark.**
- Sportler: Caia et al. (63 Rugby-Profis, 641 Nächte; zitiert nach O'Donnell et al. 2018): Überschätzung im Mittel 19,8 Minuten, Korrelation 0,85. **Evidenz: mittel**, nur über die Sekundärquelle geprüft. Tägliche Abfrage am Morgen ist offenbar genauer als die pauschale Frage nach dem „üblichen“ Schlaf.
- Van Dongen (2003): Das subjektive Müdigkeitsgefühl bildet chronischen Schlafmangel schlecht ab.

Zur selbstberichteten Schlaf*qualität* habe ich keine Validierungsstudie geprüft (**Lücke**).

---

### Was für MyRace folgt

Alle Schwellen sind Startwerte. „Beleg“ nennt, worauf sie sich stützen; wo nichts steht, ist es ein pragmatischer Vorschlag.

#### Baselines
| Parameter | Vorschlag | Beleg |
|---|---|---|
| Fenster | Median der letzten 28 Nächte, mindestens 14 gültige; die zu bewertende Nacht ausgeschlossen | 28 Tage: Mishra 2020; Median: Alavi 2022; deckt einen Zyklus ab |
| Streuung | Robuste SD (aus dem mittleren absoluten Abstand zum Median), mit Untergrenze: Herzfrequenz 2,0 Schläge, Atemfrequenz 0,4 pro Minute | Typische SD 3,03 Schläge (Quer 2020) und 0,51 pro Minute (Miller 2020); Untergrenze ist Vorschlag gegen Überempfindlichkeit |
| Bevorzugtes Herzsignal | Mittlere Herzfrequenz im Schlaf statt Tages-Ruhepuls | Alavi 2022 nutzt Nachtwerte; gute Messgenauigkeit (Miller 2022) |
| Mittelung für Ermüdung | 7-Tage-Mittel gegen 28-Tage-Baseline, nie Einzelwert | Buchheit 2014, Bosquet 2008 |

#### Einzelsignale
| Signal | „erhöht“ | „deutlich erhöht“ | Beleg |
|---|---|---|---|
| Schlaf-Herzfrequenz | +3 Schläge oder +1,5 SD (das Größere) | +5 Schläge oder +2 SD (das Größere) | Alavi: +3/+4; Mishra: median +7; Quer: 2 SD |
| Atemfrequenz | +1,0 pro Minute | +1,5 pro Minute | etwa 2 bzw. 3 SD nach Miller 2020 |
| Handgelenkstemperatur | +0,5 °C | +0,8 °C | über Zykluseffekt 0,30 °C (Maijala 2019); Krankheitsanstieg im Mittel +0,63 °C (Smarr 2020) |

Ein einzelnes erhöhtes Signal führt nur zu einem neutralen Hinweis und einer kleinen Abwertung der Readiness, nie zu einem Krankheitsverdacht. Erhöhte Herzfrequenz allein nach hartem Training, Alkohol oder kurzer Nacht ist erwartbar (Alavi 2022).

#### Konservative Regel „Hinweis auf mögliche Belastung des Körpers“
Auslösen, wenn **eine** der Bedingungen erfüllt ist:
- **A (zwei Nächte):** Schlaf-Herzfrequenz „deutlich erhöht“ an zwei Nächten in Folge **und** in mindestens einer dieser Nächte Atemfrequenz oder Temperatur „erhöht“.
- **B (eine Nacht, drei Signale):** Herzfrequenz, Atemfrequenz und Temperatur in derselben Nacht alle mindestens „erhöht“, davon eines „deutlich“.
- **C (Symptome):** Die Nutzerin oder der Nutzer meldet Fieber, Gliederschmerzen, Husten mit Brustbeteiligung oder starkes Krankheitsgefühl. Das gilt unabhängig von den Messwerten und ist die einzige Möglichkeit ohne Uhr.

Temperatur allein löst nie aus (Zyklus, Raumtemperatur, Alkohol). Zyklusdaten werden nicht erhoben.

Beleglage: Die Kombination mehrerer Signale und die Zwei-Nächte-Bedingung sind aus Alavi 2022, Quer 2021 und Mason 2022 abgeleitet und entsprechen dem Muster von Apple, Oura und Whoop. Die konkrete Regel ist **nicht validiert**. Zu erwarten ist, dass sie viele leichte Infekte nicht vorab erkennt (bei hoher Spezifität liegt die Erkennung unter 50 %; Natarajan 2020) und trotzdem einige Fehlalarme erzeugt. Die Fehlalarmrate sollte in der Testphase gezählt werden; Ziel höchstens etwa einer pro Monat und Person.

**Wortwahl in der App:** keine Diagnose, kein Krankheitsname. Vorschlag: „Deine Werte der letzten Nacht weichen deutlich von deinem üblichen Bereich ab. Das kann viele Gründe haben, zum Beispiel einen beginnenden Infekt, Alkohol, Stress oder eine harte Einheit. Wie fühlst du dich?“ Dazu der Hinweis, dass MyRace kein Medizinprodukt ist.

**Reaktion nach der Symptomabfrage:**
- Keine Symptome: harte Einheit durch lockere ersetzen oder um einen Tag verschieben; am Folgetag neu bewerten.
- Nur leichte Symptome oberhalb des Halses: höchstens lockeres, kurzes Training; als Erfahrungsregel kennzeichnen (IOC: nicht validiert).
- Fieber, Gliederschmerzen, Brustsymptome, starkes Krankheitsgefühl: Trainingspause vorschlagen, bis die Symptome abgeklungen sind. Bei Brustschmerz, Atemnot oder Herzrasen: Hinweis auf ärztliche Abklärung.
- Wiedereinstieg: nach Abklingen ein Testlauf von 10–20 Minuten bei 60–70 % der üblichen Intensität; ohne Warnzeichen schrittweise Steigerung über mehrere Tage, zuerst Umfang, dann Intensität (IOC 2022; Expertenmeinung). Bei Symptomen über 7 Tage ärztliche Abklärung empfehlen.

#### Schlaf
| Regel | Vorschlag | Beleg |
|---|---|---|
| Phasen | REM- und Tiefschlafanteile nicht in den Wert einrechnen, höchstens anzeigen | Abschnitt 6; stark |
| Eine kurze Nacht (unter 6 h oder mehr als 1,5 h unter eigenem Mittel) | Nur kleine Abwertung; keine automatische Streichung; Empfehlung, harte Einheit eher früh am Tag zu laufen | Craven 2022 (Morgen kaum betroffen, 0,4 % je Wachstunde); Walsh 2021 (Wirkung unklar) |
| Drei-Nächte-Mittel unter 6 h | Deutliche Abwertung; Intensität reduzieren oder tauschen | Roberts 2019 (rund 3 % langsamer); schwach bis mittel |
| 14-Tage-Mittel unter 7 h | Hinweis auf erhöhtes Belastungsrisiko, keine harte Sperre | Cahalan 2020 (HR 1,51); Prather 2015 (Infekt); schwach bzw. mittel |
| Bezugswert | Eigenes 28-Tage-Mittel plus absolute Untergrenzen; kein festes Ziel von 8 h | Walsh 2021 (individueller Bedarf) |
| Regelmäßigkeit | SD des Schlafmittelpunkts über 14 Nächte: unter 45 min gut, 45–90 min mittel, über 90 min unregelmäßig; geringes Gewicht | Stufen sind Vorschlag; Evidenz für Leistung fehlt, für Gesundheit mittel (Windred 2024) |
| Uhr-Schlafdauer | Unverändert übernehmen; wissen, dass sie eher zu hoch ist | Miller 2022, Robbins 2024 |
| Manuelle Eingabe | Tägliche Morgenabfrage (Einschlaf-/Aufwachzeit, Qualität 1–5); geringeres Gewicht als Messung; Schwellen gleich lassen, aber Angaben unter 6 h ernst nehmen | Lauderdale 2008, Caia 2018 |

#### Was unsicher bleibt
- Keine der Krankheitsregeln ist für Erkältung oder Grippe, für geimpfte Personen oder für Ausdauersportler validiert.
- Streuung der Apple-Handgelenkstemperatur von Nacht zu Nacht: keine unabhängige Quelle gefunden.
- Wirkung einer einzelnen kurzen Nacht auf Ausdauerleistung: uneinheitlich.
- Schlaf und Verletzung bei Erwachsenen: unzureichend belegt.
- Regelmäßigkeit und sportliche Erholung: keine direkte Evidenz.
- Zyklische Schwankung des Ruhepulses: nicht recherchiert.

---

### Quellen

Alle Einträge wurden per Suche gefunden; „geprüft über“ nennt die tatsächlich gelesene Seite.

1. Alavi A, Bogu GK, Wang M, et al. (2022). Real-time alerting system for COVID-19 and other stress events using wearable data. *Nature Medicine* 28(1):175–184. DOI 10.1038/s41591-021-01593-2. Geprüft über PMC: https://pmc.ncbi.nlm.nih.gov/articles/PMC8799466
2. Apple Inc. (2022, aktualisiert Okt. 2025). Estimating Sleep Stages from Apple Watch (Whitepaper, Herstellerangabe). https://www.apple.com/kr/health/pdf/Estimating_Sleep_Stages_from_Apple_Watch_Oct_2025.pdf
3. Apple Support. Track your overnight vitals with Apple Watch. https://support.apple.com/en-ke/120142
4. Bosquet L, Merkari S, Arvisais D, Aubert AE (2008). Is heart rate a convenient tool to monitor over-reaching? A systematic review of the literature. *British Journal of Sports Medicine* (Journal, Band und DOI nicht verifiziert). PubMed 18308872; Abstract geprüft über eine Wiedergabe: https://miketnelson.blogspot.com/2009/01/is-heart-rate-convenient-tool-to.html
5. Buchheit M (2014). Monitoring training status with HR measures: do all roads lead to Rome? *Frontiers in Physiology* 5:73. DOI 10.3389/fphys.2014.00073. https://pmc.ncbi.nlm.nih.gov/articles/PMC3936188
6. Cahalan R, O'Sullivan K, Comyns T, Johnston R, et al. (2019). Training load and baseline characteristics associated with new injury/pain within an endurance sporting population: a prospective study. *Int J Sports Physiol Perform* 14(5):590–597. DOI 10.1123/ijspp.2018-0644. Geprüft über Repositorium: https://pure.ul.ie/en/publications/training-load-and-baseline-characteristics-associated-with-new-in-2/
7. Cahalan R, O'Sullivan K, Comyns T, Johnston R, et al. (2020). General health complaints and sleep associated with new injury within an endurance sporting population: a prospective study. *J Sci Med Sport* 23(3):252–257. DOI 10.1016/j.jsams.2019.10.013. Geprüft über Repositorium (Autorenreihenfolge nicht am Verlagstext verifiziert): https://pure.ul.ie/en/publications/general-health-complaints-and-sleep-associated-with-new-injury-wi-2/
8. Caia J, et al. (2018). Does self-perceived sleep reflect sleep estimated via activity monitors in professional rugby league athletes? *Journal of Sports Sciences* (Details nicht verifiziert). Zahlen zitiert nach Quelle 22.
9. Chinoy ED, et al. (2021). Performance of seven consumer sleep-tracking devices compared with polysomnography. *Sleep* (Band und DOI nicht verifiziert). Geprüft über Bericht: https://www.neurologylive.com/view/consumer-sleep-tracking-devices-perform-equally-or-better-than-actigraphy
10. Craven J, McCartney D, Desbrow B, Sabapathy S, Bellinger P, Roberts L, Irwin C (2022). Effects of acute sleep loss on physical performance: a systematic and meta-analytical review. *Sports Medicine* 52(11):2669–2690. DOI 10.1007/s40279-022-01706-y. Abstract geprüft über https://lida.sport-iat.de/ta/Record/4078085 und https://www.strongerbyscience.com/research-spotlight-sleep-loss/
11. de Zambotti M, Goldstein C, Cook J, Menghini L, Altini M, Cheng P, Robillard R (2024). State of the science and recommendations for using wearable technology in sleep and circadian research. *Sleep* 47(4):zsad325. DOI 10.1093/sleep/zsad325. https://sleepresearchsociety.org/wp-content/uploads/2024/08/zsad325.pdf
12. Dobrosielski DA, Sweeney L, Lisman PJ (2021). The association between poor sleep and the incidence of sport and physical training-related injuries in adult athletic populations: a systematic review. *Sports Medicine* 51:777–793. DOI 10.1007/s40279-020-01416-3. https://link.springer.com/article/10.1007/s40279-020-01416-3
13. Fischer D, Klerman EB, Phillips AJK (2021). Measuring sleep regularity: theoretical properties and practical usage of existing metrics. *Sleep* 44(10):zsab103. DOI 10.1093/sleep/zsab103. Abstract geprüft über https://research.monash.edu/en/publications/measuring-sleep-regularity-theoretical-properties-and-practical-u/
14. Fullagar HHK, Skorski S, Duffield R, Hammes D, Coutts AJ, Meyer T (2015). Sleep and athletic performance: the effects of sleep loss on exercise performance, and physiological and cognitive responses to exercise. *Sports Medicine* 45(2):161–186. DOI 10.1007/s40279-014-0260-0. Abstract geprüft über https://opus.lib.uts.edu.au/handle/10453/34275
15. Gao B, Dwivedi S, Milewski MD, Cruz AI Jr (2019). Chronic lack of sleep is associated with increased sports injury in adolescents: a systematic review and meta-analysis. *Orthop J Sports Med* 7(3 Suppl):2325967119S00132. DOI 10.1177/2325967119S00132. https://pmc.ncbi.nlm.nih.gov/articles/PMC6446394
16. Lauderdale DS, et al. (2008). Self-reported and measured sleep duration: how similar are they? *Epidemiology* 19(6):838–845 (DOI nicht verifiziert). Abstract geprüft über https://stafforini.com/works/lauderdale-2008-selfreported-measured-sleep/
17. Mah CD, Mah KE, Kezirian EJ, Dement WC (2011). The effects of sleep extension on the athletic performance of collegiate basketball players. *Sleep* 34(7):943–950 (DOI nicht verifiziert). Geprüft über https://www.sciencedaily.com/releases/2011/07/110701083506.htm
18. Maijala A, Kinnunen H, Koskimäki H, Jämsä T, Kangas M (2019). Nocturnal finger skin temperature in menstrual cycle tracking: ambulatory pilot study using a wearable Oura ring. *BMC Women's Health* 19:150. DOI 10.1186/s12905-019-0844-9. https://pmc.ncbi.nlm.nih.gov/articles/PMC6883568
19. Mason AE, Hecht FM, Davis SK, et al. (2022). Detection of COVID-19 using multimodal data from a wearable device: results from the first TemPredict Study. *Scientific Reports* 12:3463. DOI 10.1038/s41598-022-07314-0. https://pmc.ncbi.nlm.nih.gov/articles/PMC8891385
20. Meeusen R, Duclos M, Foster C, et al. (2013). Prevention, diagnosis, and treatment of the overtraining syndrome: joint consensus statement of the ECSS and the ACSM. *Med Sci Sports Exerc* 45(1):186–205 (Endseite nicht verifiziert). DOI 10.1249/MSS.0b013e318279a10a. https://sportgeneeskunde.com/wp-content/uploads/Meeusen-et-al-2013-Overtraining-Consensus-ECSS-ACSM.pdf
21. Milewski MD, Skaggs DL, Bishop GA, Pace JL, Ibrahim DA, Wren TA, Barzdukas A (2014). Chronic lack of sleep is associated with increased sports injuries in adolescent athletes. *J Pediatr Orthop* 34(2):129–133 (DOI und der Wert „1,7-fach“ nicht verifiziert). Stichprobe und 68-%-Angabe geprüft über Kongressbericht: https://www.edweek.org/leadership/study-sleep-deficits-lead-to-increased-injury-risk-for-student-athletes/2012/10
22. Miller DJ, Capodilupo JV, Lastella M, Sargent C, Roach GD, Capodilupo ER, et al. (2020). Analyzing changes in respiratory rate to predict the risk of COVID-19 infection. *PLoS ONE* 15(12) (Autorenliste, Artikelnummer und DOI nicht verifiziert). Geprüft über Preprint: https://www.medrxiv.org/content/10.1101/2020.06.18.20131417.full.pdf
23. Miller DJ, Sargent C, Roach GD (2022). A validation of six wearable devices for estimating sleep, heart rate and heart rate variability in healthy adults. *Sensors* 22(16):6317. DOI 10.3390/s22166317. https://mdpi.com/1424-8220/22/16/6317
24. Mishra T, Wang M, Metwally AA, et al. (2020). Pre-symptomatic detection of COVID-19 from smartwatch data. *Nature Biomedical Engineering* 4:1208–1220 (Band/Seiten nicht verifiziert). DOI 10.1038/s41551-020-00640-6. Zahlen geprüft über Preprint: https://medrxiv.org/content/10.1101/2020.07.06.20147512v1.full
25. Natarajan A, Su HW, Heneghan C (2020). Assessment of physiological signs associated with COVID-19 measured using wearable devices. *npj Digital Medicine* 3:156 (Autoren, Band und DOI nicht verifiziert). Geprüft über Preprint: https://www.medrxiv.org/content/10.1101/2020.08.14.20175265.full.pdf
26. O'Donnell S, Beaven CM, Driller MW (2018). From pillow to podium: a review on understanding sleep for elite athletes. *Nature and Science of Sleep* 10:243–253. DOI 10.2147/NSS.S158598. https://pmc.ncbi.nlm.nih.gov/articles/PMC6112797
27. Oura Symptom Radar: Bericht über die Einführung. https://www.androidauthority.com/oura-ring-symptom-radar-rollout-3505767
28. Phillips AJK, Clerx WM, O'Brien CS, Sano A, Barger LK, Picard RW, Lockley SW, Klerman EB, Czeisler CA (2017). Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. *Scientific Reports* 7:3216 (Artikelnummer nicht verifiziert). DOI 10.1038/s41598-017-03171-4. https://dspace.mit.edu/handle/1721.1/113615
29. Prather AA, Janicki-Deverts D, Hall MH, Cohen S (2015). Behaviorally assessed sleep and susceptibility to the common cold. *Sleep* 38(9):1353–1359 (Band/Seiten nicht verifiziert). DOI 10.5665/sleep.4968. Geprüft über https://www.sciencedaily.com/releases/2015/08/150831163729.htm
30. Quer G, Gouda P, Galarnyk M, Topol EJ, Steinhubl SR (2020). Inter- and intraindividual variability in daily resting heart rate and its associations with age, sex, sleep, BMI, and time of year: retrospective, longitudinal cohort study of 92,457 adults. *PLoS ONE* 15(2):e0227709. DOI 10.1371/journal.pone.0227709. Volltext geprüft über https://escholarship.org/content/qt6xw443rs/qt6xw443rs.pdf
31. Quer G, Radin JM, Gadaleta M, et al. (2021). Wearable sensor data and self-reported symptoms for COVID-19 detection. *Nature Medicine* 27:73–77 (Band/Seiten und DOI nicht verifiziert). Zahlen geprüft über https://mobihealthnews.com/news/pairing-wearables-data-self-reported-symptoms-could-improve-covid-19-prediction
32. Radin JM, Wineinger NE, Topol EJ, Steinhubl SR (2020). Harnessing wearable device data to improve state-level real-time surveillance of influenza-like illness in the USA: a population-based study. *Lancet Digital Health* 2(2):e85–e93 (Titel, Seiten und DOI nicht verifiziert). Geprüft über https://www.scripps.edu/news-and-events/press-room/2020/20200116-wearable-flu.html und https://mobihealthnews.com/node/147596
33. Robbins R, Weaver MD, Sullivan JP, et al. (2024). Accuracy of three commercial wearable devices for sleep tracking in healthy adults. *Sensors* 24(20):6532. DOI 10.3390/s24206532. https://www.mdpi.com/1424-8220/24/20/6532
34. Roberts SSH, Teo WP, Aisbett B, Warmington SA (2019). Extended sleep maintains endurance performance better than normal or restricted sleep. *Med Sci Sports Exerc* (Autorenliste, Band und DOI nicht verifiziert). Geprüft über Pressemitteilung: https://www.deakin.edu.au/about-deakin/news-and-media-releases/articles/more-sleep-secret-weapon-to-elite-cycling-performance-deakin-study
35. Schwellnus M, Adami PE, Bougault V, et al. (2022). International Olympic Committee (IOC) consensus statement on acute respiratory illness in athletes part 1: acute respiratory infections. *Br J Sports Med* (Band/Seiten nicht verifiziert; DOI vermutlich 10.1136/bjsports-2022-105759, aus der URL abgeleitet). https://bjsm.bmj.com/content/early/2022/07/21/bjsports-2022-105759
36. Schwellnus M, Adami PE, Bougault V, et al. (2022). IOC consensus statement on acute respiratory illness in athletes part 2: non-infective acute respiratory illness. *Br J Sports Med* 56:1089–1103. DOI 10.1136/bjsports-2022-105567. (Nur zur Abgrenzung geprüft; enthält keine Rückkehrregeln für Infekte.)
37. Smarr BL, Aschbacher K, Fisher SM, et al. (2020). Feasibility of continuous fever monitoring using wearable devices. *Scientific Reports* 10:21640. DOI 10.1038/s41598-020-78355-6. https://pmc.ncbi.nlm.nih.gov/articles/PMC7736301
38. Snyders C, Pyne DB, Sewry N, Hull JH, Kaulback K, Schwellnus M (2022). Acute respiratory illness and return to sport: a systematic review and meta-analysis by a subgroup of the IOC consensus on „acute respiratory illness in the athlete“. *Br J Sports Med* 56(4):223–232 (Seiten nicht verifiziert). DOI 10.1136/bjsports-2021-104719. https://bjsm.bmj.com/content/early/2021/12/15/bjsports-2021-104719
39. Van Dongen HPA, Maislin G, Mullington JM, Dinges DF (2003). The cumulative cost of additional wakefulness: dose-response effects on neurobehavioral functions and sleep physiology from chronic sleep restriction and total sleep deprivation. *Sleep* 26(2):117–126 (DOI nicht verifiziert). Abstract geprüft über https://read.qxmd.com/read/12683469/
40. von Rosen P, Frohm A, Kottorp A, Fridén C, Heijne A (2017). Too little sleep and an unhealthy diet could increase the risk of sustaining a new injury in adolescent elite athletes. *Scand J Med Sci Sports* 27(11):1364–1371 (Autorenliste nicht verifiziert). DOI 10.1111/sms.12735. Abstract geprüft über https://lida.sport-iat.de/twm/Record/4045545
41. Walsh NP, Halson SL, Sargent C, et al. (2021). Sleep and the athlete: narrative review and 2021 expert consensus recommendations. *Br J Sports Med* 55(7):356–368. DOI 10.1136/bjsports-2020-102025. https://researchonline.ljmu.ac.uk/id/eprint/16297/
42. WHOOP. Health Monitor (Herstellerseite). https://www.whoop.com/ae/en/thelocker/health-monitor-feature/
43. Windred DP, Burns AC, Lane JM, Saxena R, Rutter MK, Cain SW, Phillips AJK (2024). Sleep regularity is a stronger predictor of mortality risk than sleep duration: a prospective cohort study. *Sleep* 47(1):zsad253 (Artikelnummer und DOI nicht verifiziert). Geprüft über Zusammenfassung: https://sci-sport.com/en/sleep-health-regularity-versus-duration-250/

**Nicht auffindbar oder abweichend von der Annahme im Auftrag:**
- „Johnston et al. 2020, Training Load and Baseline Characteristics Associated With New Injury/Illness“: Unter diesem Titel fand ich Cahalan et al. 2019 (ohne Schlafbefund im Abstract). Der Schlafbefund (unter 7 Stunden) steht in Cahalan et al. 2020, Johnston ist dort Koautor.
- Dobrosielski 2021 erschien in *Sports Medicine*, nicht in einem anderen Journal, und bewertet die Evidenz als unzureichend.
- Milewski 2014: Der Wert „1,7-fach“ ließ sich nicht an der Primärquelle prüfen.
- Apple Vitals: „mindestens 2 Messwerte“ ist auf der Apple-Seite nicht beziffert („mehrere“).
- Arbeiten von Lastella zum Schlaf von Sportlern: nicht eigens geprüft.

---

## B3 – Trainingslast-Quantifizierung und Belastungsmodelle


Stand: 11.11.2026. Recherche per Websuche; Abstracts und Repositorien-Einträge wurden gelesen, Volltexte nur wo frei zugänglich (Foster 2001, Tanaka 2001, Haddad 2017, Impellizzeri 2021, Williams 2017). PubMed/PMC waren technisch gesperrt, deshalb stammen viele Angaben aus Abstracts über Zweitkataloge (SPONET, Uni-Repositorien). Was nicht geprüft werden konnte, ist als „nicht verifiziert“ markiert.

Evidenzstufen: **stark** (mehrere konsistente Studien/Reviews), **mittel** (einzelne gute Studien oder konsistente Abstract-Lage), **schwach** (kleine Stichproben, andere Sportarten, widersprüchlich), **Expertenmeinung** (Bücher, Herstellerartikel).

### Kurzfazit

- Kein Lastmaß ist als „Dosis“ validiert (Passfield et al. 2022). Alle Maße sind brauchbare Buchhaltung, keine Messung der Ermüdung.
- Für MyRace ist **sRPE (CR-10 × Minuten)** das robusteste Primärmaß; es braucht keine Uhr und ist bei Läufern gegen HF-Maße validiert (r ≈ 0,74–0,89; Mann et al. 2019).
- Das heutige „Gefühl 1–5“ ist **kein** RPE-Ersatz: Affekt und Anstrengung korrelieren nur mäßig (r = −0,56; Hardy & Rejeski 1989).
- ACWR-„Sweet Spot“ 0,8–1,3 ist nicht belegt und bei Läufern in der größten Kohorte nicht bzw. invers mit Verletzungen assoziiert (Frandsen et al. 2025). Belegt ist dort die **Einzelsession-Distanzspitze** gegenüber dem längsten Lauf der letzten 30 Tage.
- CTL/ATL/TSB sind eine nützliche Heuristik, kein belegter Readiness-Marker.

---

### 1. Session-RPE

**Methode.** Sitzungslast = RPE (0–10) × Dauer in Minuten, in willkürlichen Einheiten (AU) (Foster et al. 2001). Foster nutzt Borgs Category-Ratio-Skala mit amerikanisierten Ankern: 0 Ruhe, 1 sehr, sehr leicht, 2 leicht, 3 mäßig, 4 etwas schwer, 5 schwer, 7 sehr schwer, 10 maximal (Haddad et al. 2017, Tabelle 1). Gefragt wird nach einer Gesamtnote für die ganze Einheit.

**Zeitpunkt.** Foster fragte etwa 30 min nach Ende, damit das letzte Teilstück die Note nicht dominiert (Foster et al. 2001). Spätere Studien relativieren das:

- Christen et al. (2016): 15 gut trainierte Personen, Abfrage 5, 10, 15, 20, 25, 30, 60 min und 24 h nach Dauer- und Intervallfahrt, keine signifikanten Unterschiede. Evidenz: **mittel** (klein, Radfahren).
- Uchida et al. (2014): 8 Boxer, 10 vs. 30 min ohne signifikanten Unterschied. Evidenz: **schwach**.
- Mann et al. (2019): 15 jugendliche Distanzläufer, 0/15/30 min. Die 30-min-Werte lagen im Mittel rund 26,5 % unter den Sofortwerten; die Korrelation mit HF-Kriterien war bei Sofortabfrage am höchsten (r = 0,74–0,89). Alle drei Zeitpunkte gelten den Autoren als valide. Evidenz: **mittel**.

**Widerspruch:** Christen findet keinen Zeiteffekt, Mann einen deutlichen Niveauunterschied. Konsequenz: Der Zeitpunkt ist frei wählbar, muss aber **konstant** sein. Für eine App ist die Abfrage direkt beim Abhaken praktikabel und vertretbar.

**Validität gegenüber HF-Maßen.** Haddad et al. (2017) fanden 36 Validitäts-/Reliabilitätsstudien mit der modifizierten CR-10. Korrelationen mit Banister-/Edwards-TRIMP liegen bei Ausdauerbelastungen meist zwischen r ≈ 0,5 und 0,9 (z. B. Schwimmen 0,55–0,92), bei stark intermittierender Belastung teils nahe null (Taekwondo-Intervalle r = 0,14–0,20). Evidenz: **stark** für „valide im Gruppenmittel“, **mittel** für Läufer speziell.

**Einschränkung:** Wallace et al. (2014) fanden im Labor für sRPE die schlechteste Test-Retest-Reliabilität (CV 28,1 %; Banister-TRIMP 15,6 %, Lucia-TRIMP 10,7 %, Herzfrequenz 3,9 %); externe Arbeit korrelierte am besten mit der Sauerstoffaufnahme (r = 0,88–0,97 vs. RPE-Methoden 0,55–0,89). sRPE ist also valide, aber verrauscht. Einzelwerte nicht überinterpretieren, Trends glätten.

**Monotonie und Strain** (Foster 1998):

```
Monotonie = Mittelwert(Tageslast über 7 Tage) / Standardabweichung(Tageslast über 7 Tage)
Strain    = Wochenlast × Monotonie
```

Foster beobachtete 25 Athleten und berichtet, dass ein hoher Anteil der Infekte auftrat, wenn individuelle Schwellen – vor allem des Strain – überschritten wurden. Die oft zitierten Zahlen (Monotonie > 2,0 als Warnwert, „84 % der Erkrankungen“) konnte ich im Abstract **nicht verifizieren**. Ein systematischer Review im Profifußball (2024, 27 Studien) nennt typische Monotoniewerte von etwa 0,5–2,0 und hält fest, dass die Daten keine belastbare Trennung Verletzter/Nichtverletzter erlauben. Evidenz für Schwellen: **schwach**; fixe Grenzwerte sind Heuristik. Rechnerisches Problem: Bei drei bis vier Läufen pro Woche mit Ruhetagen (Last 0) ist die Streuung groß und die Monotonie fast immer niedrig; bei identischen Tageslasten geht sie gegen unendlich.

### 2. TRIMP-Varianten

**Banister** (Banister 1991; Morton et al. 1990 – Formel hier über Sekundärquelle bestätigt, Primärquelle nicht eingesehen):

```
TRIMP = Dauer[min] × x × k(x)
x     = (HF_Belastung − HF_Ruhe) / (HF_max − HF_Ruhe)
k(x)  = 0,64 × e^(1,92·x)   (Männer)
k(x)  = 0,86 × e^(1,67·x)   (Frauen)
```

Der Exponentialfaktor bildet den Laktatanstieg mit steigender Intensität nach.

**Edwards (1993), 5 Zonen:** Minuten in 50–60 / 60–70 / 70–80 / 80–90 / 90–100 % HFmax, multipliziert mit 1 / 2 / 3 / 4 / 5 und summiert (so beschrieben in Foster et al. 2001; Edwards’ Buch selbst nicht eingesehen).

**Lucia et al. (2003), 3 Zonen:** Zeit unter der ventilatorischen Schwelle, zwischen Schwelle und respiratorischem Kompensationspunkt, darüber – jeweils mit phasenspezifischem Multiplikator. Die üblichen Gewichte 1 / 2 / 3 standen im geprüften Abstract nicht; **nicht aus Primärquelle verifiziert**. Kontro et al. (2025) nennen die Gewichte von Edwards und Lucia „etwas willkürlich“.

**Individualisierter TRIMP** (Manzi et al. 2009): Gewichtung aus individueller HF-Laktat-Kurve. Bei 8 Freizeitläufern über 8 Wochen korrelierte die Wochensumme mit Verbesserungen der Geschwindigkeit bei 2 und 4 mmol/l (r = 0,87 bzw. 0,74) und mit 5.000-/10.000-m-Leistung (r = −0,77 / −0,82). Evidenz: **schwach bis mittel** (n = 8); ohne Laktattest für MyRace nicht umsetzbar.

**Nur Durchschnittspuls + Dauer.** Rechenbar ist allein Banister-TRIMP mit mittlerer HF. Weil k(x) konvex ist, unterschätzt der Mittelwert jede Einheit mit wechselnder Intensität. Eigene Beispielrechnung (Mann): 30 min bei x = 0,9 plus 30 min bei x = 0,5 ergeben 97,3 + 25,1 = 122,4; mit dem Mittel x = 0,7 über 60 min nur 103,1 – rund 16 % zu wenig. Bei kurzen Intervallen kommt die HF-Trägheit hinzu. Zonen-TRIMPs (Edwards, Lucia) brauchen den HF-Verlauf und sind mit einem Durchschnittswert nicht berechenbar.

**HFmax und HFruhe** sind für Banister nötig. Tanaka et al. (2001): HFmax = 208 − 0,7 × Alter (Metaanalyse, 351 Studien, 18.712 Personen; Laborstudie 209 − 0,7 × Alter, n = 514). Streuung etwa 7–11 Schläge/min (SD), also ±20 Schläge im 95-%-Bereich. Evidenz für die Formel: **stark**; für die individuelle Anwendung taugt sie nur als Startwert. Besser: höchster gemessener Puls aus Wettkampf/Intervallen überschreibt die Schätzung.

### 3. Pace-/Plan-basierte Last ohne Puls

**rTSS (TrainingPeaks, McGregor).** Laut Hersteller entspricht eine Stunde an der funktionellen Schwelle 100 Punkten; der Intensitätsfaktor ist normalisierte, steigungskorrigierte Pace relativ zur Schwellenpace. Die ausgeschriebene Gleichung stand auf den geprüften Seiten nicht; analog zum Rad-TSS ergibt sich:

```
IF   = Schwellenpace / normalisierte Pace   (als Geschwindigkeitsverhältnis)
rTSS = Dauer[h] × IF² × 100
```

Evidenz: **Expertenmeinung**; keine unabhängige Validierung gefunden.

**GOVSS (Skiba).** Schätzt Laufleistung aus Größe, Masse, Tempo und Steigung, gewichtet Leistung oberhalb der Testleistung stärker und skaliert so, dass eine Stunde Bestleistung 100 Punkte ergibt. Evidenz: **Expertenmeinung**; für MyRace ohne Mehrwert gegenüber rTSS.

**Daniels’ Punkte.** Daniels’ Running Formula enthält eine Tabelle mit Intensitätspunkten pro Minute je Zone. Aus dem Gedächtnis: etwa E 0,2, M 0,4, T 0,6, I 1,0, R 1,5. Diese Werte ließen sich per Suche **nicht verifizieren** (mehrere Buchzusammenfassungen geprüft, keine nennt sie) und müssen vor Verwendung im Buch nachgeschlagen werden. Verifiziert sind nur die Zonen: E 59–74 %, M 75–84 %, T 83–88 %, I 95–100 % VO2max.

**Wie gut ist Dauer × Zonengewicht?** Es gibt keine Studie, die ein bestimmtes Gewichtsset für Läufer validiert. Die Systeme widersprechen sich stark: IF² gewichtet flach (E ≈ 0,6, T = 1,0, I ≈ 1,2 pro Minute relativ zu T; eigene Rechnung mit E ≈ 78 %, I ≈ 109 % der Schwellengeschwindigkeit), Daniels und sRPE gewichten harte Minuten drei- bis fünfmal so hoch wie lockere. Passfield et al. (2022) argumentieren grundsätzlich, dass die meisten Lastmaße nicht mit der akuten Leistungseinbuße übereinstimmen und die Dauer die Berechnung verzerrt. Evidenz für jedes konkrete Gewichtsset: **Expertenmeinung/Heuristik**.

### 4. Fitness-Fatigue-Modell und CTL/ATL/TSB

**Modell** (Banister et al. 1975; Morton et al. 1990; Formulierung nach Kontro et al. 2025):

```
p(t) = k1·g(t) − k2·h(t)
g(t) = g(t−1)·e^(−1/τ1) + w(t)      (Fitness)
h(t) = h(t−1)·e^(−1/τ2) + w(t)      (Ermüdung)
```

Angepasste Zeitkonstanten: τ1 ≈ 40–50 Tage, τ2 ≈ 8–13 Tage (Morton 1990: 50/40 und 11; Busso 2003: 41 ± 15 bzw. 35 ± 12 und 9 ± 6 bzw. 13 ± 3; zitiert nach Kontro et al. 2025). Busso (2003) zeigte an 6 Untrainierten, dass ein Modell mit lastabhängiger Ermüdung besser passt und die Dosis-Wirkungs-Kurve umgekehrt U-förmig ist.

**Praxisableitung** (Coggan):

```
CTL(t) = CTL(t−1) + (Last(t) − CTL(t−1)) × (1 − e^(−1/42))
ATL(t) = ATL(t−1) + (Last(t) − ATL(t−1)) × (1 − e^(−1/7))
TSB(t) = CTL(t) − ATL(t)
```

Die Exponentialform der Glättung ist die übliche Umsetzung; Coggans Artikel nennt nur „exponentiell gewichtetes Mittel“ mit 42 bzw. 7 Tagen. Für eine Morgenanzeige die Werte vom Vortag verwenden.

Coggan strich die Gewichtungsfaktoren k1/k2 bewusst, weil das volle Modell viele Leistungstests braucht und instabile Parameter liefert; die Deutung sei damit mehr Urteil als Rechnung. Seine Richtwerte (TSB < −10 selten „frisch“, > +10 meist frisch; CTL-Anstieg über 5–7 TSS/Tag pro Woche über vier Wochen riskant) bezeichnet er selbst als nicht wörtlich zu nehmen.

**Kritik:**

- Hellard et al. (2006): 9 Spitzenschwimmer, gute Anpassung (R² = 0,79 ± 0,13), aber sehr breite Konfidenzintervalle der Zeitkonstanten (z. B. 38 [17–59] Tage) und stark korrelierte Parameter.
- Vermeire et al. (2022): Parameter hängen von Startwerten, Schätzverfahren und Lastmaß ab; von generischen Konstanten wird abgeraten.
- Marchal et al. (2025): Bayes-Analyse mit Kreuzvalidierung auf zwei Datensätzen; die Ermüdungskomponente verbessert die Vorhersage nicht signifikant (p > 0,40).
- Passfield et al. (2022): Trainingslast als Dosiskonzept nie validiert.

**Bewertung:** Gute Anpassung im Nachhinein, schwache Vorhersage. TSB ist **eine Heuristik**, kein belegter Readiness-Marker. Evidenz für 42/7 als „richtige“ Konstanten: **schwach**; sie liegen aber im Bereich der angepassten Werte.

### 5. ACWR und Verletzungsrisiko

**Ursprung.** Hulin et al. (2014): 28 Cricket-Fast-Bowler; Akutlast (1 Woche) über 200 % der chronischen Last (4-Wochen-Mittel) ging mit RR 4,5 (sRPE-Last) bzw. 3,3 (Würfe) einher. Gabbett (2016) verallgemeinerte das; die Zahlen 0,8–1,3 („Sweet Spot“) und > 1,5 („Gefahrenzone“) sowie das zwei- bis fünffache Risiko bei ≥ 15 % Wochensteigerung habe ich nur über eine Sekundärquelle bestätigt. Der IOC-Konsens (Soligard et al. 2016) nennt schlechtes Lastmanagement einen wesentlichen Risikofaktor; ob er die Schwellen wörtlich übernimmt: **nicht verifiziert**. Alle Daten stammen aus Mannschaftssport.

**EWMA-Variante.** Williams et al. (2017): EWMA(heute) = Last × λ + (1 − λ) × EWMA(gestern), λ = 2/(N + 1), N = 7 bzw. 28. Murray et al. (2017; 59 Australian-Football-Spieler) fanden das empfindlicher als gleitende Mittel. Achtung: λ = 2/(N + 1) mit N = 7 ergibt 0,25, die Coggan-Form mit τ = 7 nur 0,133 – beide „7 Tage“ sind nicht dasselbe.

**Kritik:**

- Lolli et al. (2019): Die Akutwoche steckt im Nenner – mathematische Kopplung erzeugt Scheinkorrelation.
- Impellizzeri et al. (2020): keine kausale Evidenz; das Verhältnis normalisiert nicht sauber und erzeugt Artefakte; keine Grundlage für den Einsatz im Lastmanagement.
- Wang et al. (2020): Probleme durch Verhältnisbildung, Diskretisierung, dünne Daten, Confounding.
- Impellizzeri et al. (2021): Reanalyse (34 Fußballer, 70 Verletzungen) – ersetzt man die chronische Last durch eine Konstante oder Zufallszahlen, bleiben signifikante Odds Ratios (1,95 vs. 2,45). Trennschärfe ACWR c = 0,574, Akutlast allein 0,544.

Evidenz **gegen** ACWR-Schwellen als Steuergröße: **stark**.

**Läufer:**

- Nielsen et al. (2014): 874 Laufanfänger, 202 Verletzte. Wochensteigerung > 30 % vs. < 10 %: insgesamt kein signifikanter Unterschied; für distanztypische Verletzungen HR 1,59 (95 %-KI 0,96–2,66; p = 0,07). Die 10-%-Regel ist damit **nicht** belegt; Evidenz: **schwach**.
- **Frandsen et al. (2025)** (Erstautor genau: Schuster Brandt Frandsen; Letztautor Nielsen): 5.205 Läufer, 588.071 Einheiten, 1.820 (35 %) mit Überlastungsverletzung; 77,9 % Männer, Mittel 45,8 Jahre. Exposition: Distanz der Einheit relativ zum längsten Lauf der letzten 30 Tage; Referenz: Rückgang oder Anstieg bis 10 %.
  - > 10–30 %: HRR 1,64 (1,31–2,05)
  - > 30–100 %: HRR 1,52 (1,16–2,00)
  - > 100 %: HRR 2,28 (1,50–3,48)
  - ACWR (1 Woche : Mittel der 3 Vorwochen): **negative** Dosis-Wirkungs-Beziehung. Woche-zu-Woche-Verhältnis: kein Zusammenhang. Die konkreten HRR dafür standen in keiner zugänglichen Quelle – **nicht verifiziert**.
  - Die angenommenen Schwellen und Hazard Ratios stimmen also. Einschränkungen: explorativ, Garmin-Nutzer, selbstberichtete Verletzung, nur Distanz (keine Intensität), keine monotone Dosis-Wirkung (1,64 → 1,52 → 2,28). Evidenz: **mittel** (groß, aber eine Beobachtungsstudie).
- Lövdal et al. (2021): 74 Leistungsläufer über 7 Jahre, XGBoost; AUC 0,724 (Tagesansatz) bzw. 0,678 (Wochenansatz). Für individuelle Warnungen zu ungenau; Evidenz: **schwach**.

### 6. Akute Ermüdung nach Einheitentyp

- Seiler et al. (2007): 9 hochtrainierte Läufer. HRV im Liegen normalisierte sich nach 60 oder 120 min unter VT1 in 5–10 min, nach Schwellen- oder Intervalleinheit (6 × 3 min bei 96 % VO2max) in etwa 30 min. Weniger Trainierte (n = 8) brauchten nach derselben Intervalleinheit ≥ 90 min. VT1 wirkt wie eine Schwelle; Dauer bis 120 min spielte unterhalb davon kaum eine Rolle. Evidenz: **mittel**.
- Stanley et al. (2013, Review): vollständige parasympathische Erholung bis 24 h nach niedriger Intensität, 24–48 h nach Schwellenintensität, ≥ 48 h nach hoher Intensität. Evidenz: **mittel**.

**Scheinwiderspruch:** Seiler misst Minuten bis zur HRV-Rückkehr bei Hochtrainierten, Stanley fasst Studien bis zur vollständigen Erholung zusammen. Gemeinsam: Intensität oberhalb VT1 bestimmt die Erholungsdauer, Fitness verkürzt sie. HRV-Erholung ist nicht muskuläre Erholung – lange Läufe sind autonom „billig“, mechanisch nicht.

**Marathon:** Martínez-Navarro et al. (2021; 64 Finisher) verfolgten CK, LDH und Sprungleistung bis 192 h; Laufen ab 48 h schadete der Erholung der Muskelschadensmarker nicht. Wann die Marker die Ausgangswerte erreichen, stand im Abstract nicht – **nicht verifiziert**. Feste Stundenwerte für Long Run und Marathon sind daher Heuristik.

### 7. Taugt „Gefühl 1–5“ als RPE-Ersatz?

Nein, nicht ohne Umbau.

- **Konstrukte:** RPE misst, wie anstrengend es war; die Feeling Scale (Hardy & Rejeski 1989) misst, wie gut oder schlecht man sich fühlt. Beide korrelierten nur mäßig (r = −0,56); RPE hing enger an physiologischen Signalen. Zufriedenheit ist ein drittes Konstrukt. Ein lockerer Lauf kann sich schlecht anfühlen, ein harter gut. Evidenz: **mittel**.
- **5-stufige Anstrengungsskala:** Eine validierte Version für Session-RPE habe ich nicht gefunden. Validiert sind CR-10, Borg 6–20 (untereinander r = 0,90; Arney et al. 2019) und CR-100.
- **Deutsche Anker:** Eine Validierungsstudie der deutschen CR-10 für sRPE habe ich nicht gefunden (**nicht verifiziert**). Die französische Übersetzung wurde validiert (ICC 0,77; 2013); Haddad et al. (2017) berichten zugleich über geringere Reliabilität einer übersetzten Skala. Wortlaut also festlegen und nie wieder ändern.
- **Geplant vs. empfunden:** Haddad et al. (2017) berichten, dass vom Trainer geplante und vom Athleten empfundene Intensität oft nur schwach übereinstimmen. Die Abweichung zum individuellen Normalwert je Einheitentyp ist als Ermüdungssignal plausibel, aber ohne belegte Schwelle (Heuristik).
- **HF-Pace-Entkopplung:** Friel/TrainingPeaks vergleichen das Verhältnis Pace zu HF der ersten und zweiten Hälfte; < 5 % gilt als gut, 5–10 % als mäßig, > 10 % als auffällig. Die Bänder sind dort keiner Studie zugeordnet (Expertenmeinung); Hitze und Dehydrierung treiben die Drift ebenfalls. Mit Splits, aber nur einem Durchschnittspuls ist die Entkopplung nicht berechenbar. Machbar: HF bei E-Pace über Wochen vergleichen – ohne belegte Schwelle.

### 8. Was für MyRace folgt

**A. Abfrage umbauen (höchste Priorität).** Zwei getrennte Fragen nach der Einheit:

1. „Wie anstrengend war die Einheit insgesamt?“ 0–10 mit festen Ankern: 0 Ruhe · 1 sehr, sehr leicht · 2 leicht · 3 mäßig · 4 etwas schwer · 5 schwer · 7 sehr schwer · 10 maximal (Foster-Anker, eigene Übersetzung). Beleglage: **stark** für die Skala, Übersetzung ungeprüft.
2. Bisheriges „Gefühl 1–5“ als Affekt behalten, nicht in die Last einrechnen. Alte Werte nicht rückwirkend in RPE umrechnen.

Abfrage immer zum selben Zeitpunkt (beim Abhaken). Beleglage: **mittel**.

**B. Lastmaß, drei Stufen:**

```
1. Primär:   Last = RPE(0–10) × Dauer[min]                      (belegt)
2. Fallback: Last = Σ Minuten_Zone × Gewicht_Zone                (Heuristik)
3. Optional: Banister-TRIMP aus Ø-HF, nur für E/LR/MLR/M/T-Dauerläufe
```

Fallback-Gewichte in sRPE-Einheiten, damit beide Maße dieselbe Skala haben (eigener Vorschlag, nicht belegt): E 2 · LR/MLR 3 · M 4 · T 6 · I 8 · R 8 · Trabpausen/Ein- und Auslaufen 2; Strides pauschal +5 bis +10 AU. Sobald etwa 10 Einheiten eines Typs mit RPE vorliegen, das Gewicht durch den persönlichen Median ersetzen. HF-TRIMP nie für I/R (Unterschätzung, siehe 2.) und nie mit sRPE mischen. HFmax: Tanaka als Start, gemessenes Maximum überschreibt.

**C. Zeitkonstanten.** EWMA mit τ = 7 Tagen (akut) und τ = 42 Tagen (chronisch), Coggan-Form aus Abschnitt 4. Beleglage: **Heuristik** im plausiblen Bereich. Mindestens 28, besser 42 Tage Daten, bevor „Form“ angezeigt wird; vorher mit Planlast vorbelegen. In der App als „Belastungsbilanz“ bezeichnen, nicht als Readiness.

**D. Warnschwellen:**

| Regel | Parameter | Beleglage |
|---|---|---|
| Einzellauf-Spitze | Distanz > 110 % des längsten Laufs der letzten 30 Tage → Hinweis; > 200 % → deutliche Warnung | **mittel** (Frandsen et al. 2025; eine Kohorte) |
| Wochenumfang | Steigerung > 30 % → Hinweis | **schwach** (Nielsen et al. 2014, n. s.) |
| 10-%-Regel | nicht als harte Regel | nicht belegt |
| ACWR 0,8–1,3 | **nicht verwenden** | widerlegt bzw. nicht belegt |
| Monotonie/Strain | nur anzeigen; Warnung relativ zum eigenen Verlauf, keine feste 2,0 | **schwach** |
| TSB | < −10 „eher ermüdet“, > +10 „eher frisch“ als weiche Einfärbung | Expertenmeinung (Coggan) |
| CTL-Anstieg | > 5–7 Punkte/Woche über 4 Wochen (in TSS-Skala; für AU neu skalieren) | Expertenmeinung |

**E. Erholungsfenster nach Einheitentyp** (Mindestabstand zur nächsten harten Einheit): E bis 24 h · T/M 24–48 h · I/R ≥ 48 h (Stanley et al. 2013, **mittel**, bezogen auf autonome Erholung). LR ≥ 48 h und Marathon 7–14 Tage ohne harte Einheit sind **Heuristik**.

**F. Abweichungssignale** (Heuristik): RPE ≥ 2 Punkte über dem persönlichen Median dieses Einheitentyps bei erreichter Zielpace, an zwei Einheiten in Folge → Ermüdungshinweis. HF bei E-Pace deutlich über dem eigenen 4-Wochen-Mittel → schwacher Zusatzhinweis, nie allein auslösend.

### Offene Punkte

- Daniels’ Punktwerte, Gewichte bei Lucia, Schwellen im IOC-Konsens, Fosters Monotonie-Schwelle und die ACWR-Hazard-Ratios bei Frandsen et al. konnten nicht an der Primärquelle geprüft werden.
- Keine validierte deutsche sRPE-Skala und keine validierte 5er-Anstrengungsskala gefunden.
- Kein Zonengewichts-Set für Läufer ist empirisch validiert.
- Marathon-Erholungszeiten (Rückkehr der Marker zur Baseline) nicht verifiziert.

### Quellen

Alle Einträge wurden per Suche gefunden; Einschränkungen stehen dabei.

1. Arney BE, Glover R, Fusco A, et al. (2019). Comparison of RPE scales for session RPE. *Int J Sports Physiol Perform* 14(7):994–996. DOI 10.1123/ijspp.2018-0637
2. Banister EW, Calvert TW, Savage MV, Bach T (1975). A systems model of training for athletic performance. *Aust J Sports Med* 7:57–61. Primärquelle nicht eingesehen; bibliografische Angaben nicht verifiziert.
3. Busso T (2003). Variable dose-response relationship between exercise training and performance. *Med Sci Sports Exerc* 35(7):1188–1195. Autor auf der geprüften Seite nicht genannt; DOI nicht verifiziert. https://sponet.de/sponet/Record/4008669
4. Christen J, Foster C, Porcari JP, Mikat RP (2016). Temporal robustness of the session rating of perceived exertion. *Int J Sports Physiol Perform* 11(8):1088–1093. DOI 10.1123/ijspp.2015-0438
5. Coggan AR (2022, aktualisiert 2023). The Science of the Performance Manager. TrainingPeaks. https://www.trainingpeaks.com/learn/articles/the-science-of-the-performance-manager/
6. Daniels J. *Daniels’ Running Formula* (4. Aufl., Human Kinetics). Zonen über Sekundärquellen bestätigt; Punktetabelle nicht verifiziert.
7. Edwards S (1993). *The Heart Rate Monitor Book*. Nicht eingesehen; Methode nach Foster et al. (2001).
8. Foster C (1998). Monitoring training in athletes with reference to overtraining syndrome. *Med Sci Sports Exerc* 30(7):1164–1168. DOI nicht verifiziert. https://www.sponet.de/sponet/Record/4001707
9. Foster C, Florhaug JA, Franklin J, et al. (2001). A new approach to monitoring exercise training. *J Strength Cond Res* 15(1):109–115. DOI nicht verifiziert.
10. Friel J. Aerobic Endurance and Decoupling. TrainingPeaks. https://www.trainingpeaks.com/learn/articles/aerobic-endurance-and-decoupling/
11. Gabbett TJ (2016). The training–injury prevention paradox: should athletes be training smarter and harder? *Br J Sports Med* 50(5):273–280. DOI 10.1136/bjsports-2015-095788. Schwellenwerte nur über Sekundärquelle bestätigt.
12. Haddad M, Stylianides G, Djaoui L, Dellal A, Chamari K (2017). Session-RPE method for training load monitoring: validity, ecological usefulness, and influencing factors. *Front Neurosci* 11:612. DOI 10.3389/fnins.2017.00612
13. Hardy CJ, Rejeski WJ (1989). Not what, but how one feels: the measurement of affect during exercise. *J Sport Exerc Psychol* 11(3):304–317. DOI nicht verifiziert.
14. Hellard P, Avalos M, Lacoste L, et al. (2006). Assessing the limitations of the Banister model in monitoring training. *J Sports Sci* 24(5):509–520. Autorenliste und DOI nicht verifiziert. https://sponet.de/sponet/Record/4010995
15. Hulin BT, Gabbett TJ, Blanch P, et al. (2014). Spikes in acute workload are associated with increased injury risk in elite cricket fast bowlers. *Br J Sports Med* 48(8):708–712. DOI 10.1136/bjsports-2013-092524
16. Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ (2020). Acute:chronic workload ratio: conceptual issues and fundamental pitfalls. *Int J Sports Physiol Perform* 15(6):907–913. DOI 10.1123/ijspp.2019-0864
17. Impellizzeri FM, Woodcock S, Coutts AJ, et al. (2021). What role do chronic workloads play in the acute to chronic workload ratio? Time to dismiss ACWR and its underlying theory. *Sports Med* 51(3):581–592. DOI 10.1007/s40279-020-01378-6
18. Kontro H, Mastracci A, Cheung SS, MacInnis MJ (2025). The three-dimensional impulse-response model. arXiv:2503.14841 (Preprint). https://arxiv.org/pdf/2503.14841
19. Lolli L, Batterham AM, Hawkins R, et al. (2019). Mathematical coupling causes spurious correlation within the conventional acute-to-chronic workload ratio calculations. *Br J Sports Med* 53(15):921–922. Seiten und DOI nicht verifiziert. https://bjsm.bmj.com/content/53/15/921.abstract
20. Lövdal SS, den Hartigh RJR, Azzopardi G (2021). Injury prediction in competitive runners with machine learning. *Int J Sports Physiol Perform* 16(10):1522–1532. DOI 10.1123/ijspp.2020-0518
21. Lucia A, Hoyos J, Santalla A, Earnest CP, Chicharro JL (2003). Tour de France versus Vuelta a España: which is harder? *Med Sci Sports Exerc* 35(5):872–878. DOI nicht verifiziert.
22. Mann RH, Williams CA, Clift BC, Barker AR (2019). The validation of session rating of perceived exertion for quantifying internal training load in adolescent distance runners. *Int J Sports Physiol Perform* 14(3). Band/Seiten und DOI nicht verifiziert (PMID 30160557).
23. Manzi V, Iellamo F, Impellizzeri F, D’Ottavio S, Castagna C (2009). Relation between individualized training impulses and performance in distance runners. *Med Sci Sports Exerc* 41(11). Band/Seiten und DOI nicht verifiziert (PMID 19812506).
24. Marchal A, Benazieb O, Weldegebriel Y, Méline T, Imbach F (2025). Statistical flaws of the fitness-fatigue sports performance prediction model. *Sci Rep*. DOI 10.1038/s41598-025-88153-7
25. Martínez-Navarro I, et al. (2021). The week after running a marathon: effects of running vs elliptical training vs resting on neuromuscular performance and muscle damage recovery. *Eur J Sport Sci* 21(12):1668–1674. DOI 10.1080/17461391.2020.1857441. Autorenliste nicht verifiziert.
26. McGregor S (2008, aktualisiert 2026). Running Training Stress Score (rTSS) Explained. TrainingPeaks. https://www.trainingpeaks.com/learn/articles/running-training-stress-score-rtss-explained/
27. Morton RH, Fitz-Clarke JR, Banister EW (1990). Modeling human performance in running. *J Appl Physiol* 69(3):1171–1177. Abstract nicht zugänglich; Band/Seiten nicht verifiziert (PMID 2246166).
28. Murray NB, Gabbett TJ, Townshend AD, Blanch P (2017). Calculating acute:chronic workload ratios using exponentially weighted moving averages provides a more sensitive indicator of injury likelihood than rolling averages. *Br J Sports Med* 51. DOI nicht verifiziert (PMID 28003238).
29. Nielsen RØ, Parner ET, Nohr EA, Sørensen H, Lind M, Rasmussen S (2014). Excessive progression in weekly running distance and risk of running-related injuries. *J Orthop Sports Phys Ther* 44(10):739–747. DOI 10.2519/jospt.2014.5164
30. Passfield L, Murias JM, Sacchetti M, Nicolò A (2022). Validity of the training-load concept. *Int J Sports Physiol Perform* 17(4):507–514. DOI 10.1123/ijspp.2021-0536
31. Schuster Brandt Frandsen J, Hulme A, Parner ET, et al., Nielsen RO (2025). How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study. *Br J Sports Med* 59(17):1203–1210. DOI 10.1136/bjsports-2024-109380
32. Seiler S, Haugen O, Kuffel E (2007). Autonomic recovery after exercise in trained athletes: intensity and duration effects. *Med Sci Sports Exerc* 39(8):1366–1373. DOI nicht verifiziert.
33. Skiba PF. What’s GOVSS? TopoFusion. https://topofusion.com/govss.php
34. Soligard T, Schwellnus M, Alonso JM, et al. (2016). How much is too much? (Part 1) International Olympic Committee consensus statement on load in sport and risk of injury. *Br J Sports Med* 50(17):1030–1041. Nur Abstract gelesen; Seiten und DOI nicht verifiziert (PMID 27535989).
35. Stanley J, Peake JM, Buchheit M (2013). Cardiac parasympathetic reactivation following exercise: implications for training prescription. *Sports Med* 43(12):1259–1277. DOI 10.1007/s40279-013-0083-4
36. Tanaka H, Monahan KD, Seals DR (2001). Age-predicted maximal heart rate revisited. *J Am Coll Cardiol* 37(1):153–156. DOI nicht verifiziert.
37. Uchida MC, Teixeira LFM, Godoi VJ, et al. (2014). Does the timing of measurement alter session-RPE in boxers? *J Sports Sci Med* 13(1):59–65.
38. Vermeire K, Ghijs M, Bourgois JG, Boone J (2022). The fitness-fatigue model: what’s in the numbers? *Int J Sports Physiol Perform* 17(5):810–813. DOI 10.1123/ijspp.2021-0494
39. Wallace LK, Slattery KM, Impellizzeri FM, Coutts AJ (2014). Establishing the criterion validity and reliability of common methods for quantifying training load. *J Strength Cond Res* 28(8):2330–2337. DOI 10.1519/JSC.0000000000000416
40. Wang C, Vargas JT, Stokes T, Steele R, Shrier I (2020). Analyzing activity and injury: lessons learned from the acute:chronic workload ratio. *Sports Med* 50. Band/Seiten und DOI nicht verifiziert (PMID 32125672).
41. Williams S, West S, Cross M, Stokes K (2017). Better way to determine the acute:chronic workload ratio? *Br J Sports Med* 51(3):209–210. DOI 10.1136/bjsports-2016-096589
42. Ohne Autorenangabe auf der geprüften Seite (2024). Acute:chronic workload ratio and training monotony variations over the season in professional soccer: a systematic review. *Proc IMechE Part P: J Sports Eng Technol* 238(4):401–416. DOI 10.1177/17543371231194283
43. Ohne Autorenangabe auf der geprüften Seite (2013). Validity and psychometric evaluation of the French version of RPE scale in young fit males when monitoring training loads. *Science & Sports* 28(2):e29–e35. https://sponet.de/sponet/Record/4028028

---

## B4 – Subjektive Marker, Wellness-Fragebögen und Check-in-Design


Stand: 11.11.2026. Recherche per Websuche; Primärquellen, soweit abrufbar. PubMed/PMC waren technisch überwiegend gesperrt, deshalb stammen viele Angaben aus Verlags-, Repositoriums- und Katalogseiten (meist Abstract-Ebene). Was ich nicht prüfen konnte, ist mit „nicht verifiziert“ markiert.

Evidenzstufen: **stark** = mehrere Reviews/konsistente Befunde; **mittel** = einzelne gute Studien oder Reviews mit heterogener Basis; **schwach** = kleine/einzelne Studien, Abstract-Ebene; **Expertenmeinung** = Praxis, Theorie, eigene Ableitung.

### Kurzfazit

- Subjektive Maße sind für ein Readiness-System brauchbar und für Nutzer ohne Uhr die einzige tägliche Quelle. Die Aussage „subjektiv schlägt objektiv“ (Saw et al. 2016) gilt aber für **validierte Mehr-Item-Fragebögen**, nicht für die 1–5-Einzelitems, die Apps typischerweise verwenden.
- Einzelitems sind kaum validiert (Jeffries et al. 2020), hängen nur schwach bis mäßig mit der Trainingslast zusammen (Duignan et al. 2020; Campbell et al. 2021) und sind als Einzelwert zum Teil wenig reliabel (Ryan et al. 2019).
- Konsequenz: wenige Items, getrennt auswerten, gegen die persönliche Baseline, als weiches Signal mit begrenztem Gewicht – nicht als Diagnose.
- Kein harter Streak. Compliance entsteht durch sichtbaren Nutzen, nicht durch Verlustangst.

### 1. Was Saw et al. 2016 zeigt – und was nicht

**Befund.** Saw, Main & Gastin (2016) werteten 56 Studien aus, die subjektive und objektive Maße gleichzeitig erhoben (Suche in fünf Datenbanken, Mai 2014). Beide Maßarten korrelierten meist nicht miteinander. Subjektive Maße bildeten akute und chronische Last empfindlicher und konsistenter ab: Das Befinden sank bei akuter Laststeigerung und bei chronischer Belastung und stieg bei Entlastung. *Evidenz: mittel* (systematisches Review, aber nur deskriptive Synthese).

**Welche Skalen reagierten?** Laut Volltext waren Subskalen zu Stress, Müdigkeit, Erholung, körperlicher Erholung, allgemeinem Wohlbefinden und „in Form sein“ in allen Lastbedingungen responsiv; der RESTQ-Sport war das einzige Instrument, das auf akute und chronische Last ansprach. Nicht responsiv waren u. a. Depression, Verwirrtheit, emotionaler Stress, soziale Erholung, Selbstwirksamkeit – und **Schlafqualität**. Gesamtscores waren weniger sensitiv als Einzelskalen (Saw et al. 2016). *Evidenz: mittel.*

**Grenzen (von den Autoren selbst genannt).** Keine Meta-Analyse wegen Heterogenität; schwankende Studienqualität; Auswertung über p-Werte bei kleinen Stichproben; Gruppenmittelwerte verdecken Einzelverläufe; möglicher Publikationsbias; unterschiedliche Bezugszeiträume (subjektiv „letzte Tage“, objektiv „jetzt“). Die Basis sind vor allem POMS, RESTQ-S und DALDA bei Leistungssportlern – keine App-Einzelitems, keine Hobbyläufer.

**Kritische Folgearbeiten.**

- **Jeffries et al. 2020** (COSMIN-Review): 310 Artikel zur Nutzung, 71 zur Messgüte. 46,1 % der eingesetzten Instrumente waren Einzelitems. Für Einzelitems fanden sich – abgesehen von zwei Studien zu Reliabilität/Responsivität – **keine Validierungsstudien**. Mehr-Item-Instrumente waren akzeptabel, mit Schwächen bei Inhaltsvalidität und Messfehler. Die Autoren nennen Schlussfolgerungen aus unvalidierten Einzelitems fragwürdig. *Evidenz: stark* (für die Aussage „nicht validiert“).
- **Duignan et al. 2020**: 21 Studien, 500 Teamsportler. Häufigste Items: Muskelkater (20 Studien), Müdigkeit (20), Schlafqualität (19), Stress (14), Stimmung (6). Zusammenhänge mit der Last reichten von keinem bis sehr groß; in den Studien mit den meisten Beobachtungen überwiegend trivial bis moderat. Skalen: 5, 7 oder 10 Stufen, einmal VAS; Polung uneinheitlich (11 Studien „höher = besser“, 7 umgekehrt). *Evidenz: mittel.*
- **Campbell et al. 2021**: **Keine Meta-Analyse**, wie im Auftrag angenommen, sondern eine Machine-Learning-Analyse von 14.109 Beobachtungen aus Cricket, Rugby League und Fußball. Wellness-Items erklärten unter 5 % der Varianz der Lastmaße; Fehlerraten über 0,89. *Evidenz: mittel.*
- **Ryan et al. 2019** (Australian Football, Reliabilität n = 14; 5 Items, 1–5, als individuelle z-Scores): ICC Muskelkater 0,77, Motivation 0,72, Schlafqualität 0,64, Stress 0,45, **Müdigkeit 0,30**. Stress und Muskelkater galten als brauchbarste Items; Schlaf, Motivation und Müdigkeit hatten ein Signal-Rausch-Verhältnis von nur 1,3–1,4. *Evidenz: schwach* (kleine Stichprobe, Manuskriptfassung).
- **Saw et al. 2017** (IJSPP 12, Suppl 2): Kommentar mit Leitlinien zur Auswahl, Implementierung und Berichterstattung; Details nur auf Abstract-Ebene geprüft. *Expertenmeinung.*
- **Coventry et al. 2023**: nicht auffindbar; keine Aussage dazu.

**Widerspruch, der bleibt:** Müdigkeit ist das am häufigsten als lastsensitiv beschriebene Item (Saw 2016; ten Haaf 2017), zeigte bei Ryan et al. aber die schlechteste Reliabilität. Schlafqualität ist fast überall dabei, war bei Saw 2016 aber nicht lastresponsiv – sie misst eher eine Ursache als eine Reaktion.

### 2. Instrumente

| Instrument | Aufbau | Bewertung für MyRace |
|---|---|---|
| **Hooper** | Schlafqualität, Müdigkeit, Stress, Muskelkater, je 1–7 (höher = schlechter) | Ursprung der meisten App-Check-ins |
| **McLean et al. 2010** | 5 Items (Müdigkeit, Schlaf, Muskelkater, Stress, Stimmung), 1–5 | De-facto-Standard im Teamsport, nie formal validiert |
| **RESTQ-Sport** | Mehrdimensional, 52/76 Items | Beste Evidenz (Saw 2016), aber viel zu lang |
| **AEB / KEB** | 32 Adjektive bzw. 8 Items, 0–6 | Deutsch, validiert, lizenziert |
| **POMS/BRUMS, DALDA** | Stimmungsprofile bzw. Stresssymptome | Für wöchentlich, nicht täglich |
| **TQR** (Kenttä & Hassmén 1998) | Erholungsskala analog Borg | Konzeptpapier; Skalendetails nicht verifiziert |
| **PRS** (Laurent et al. 2011) | Ein Item, 0–10 | Kürzeste Option mit Leistungsbezug |

**Hooper – Zitierfehler in der Literatur.** Die vier 1–7-Items stammen aus der Schwimmerstudie Hooper et al. 1995 (*Med Sci Sports Exerc*; 14 Schwimmer, 6 Monate): Wohlbefindens-Ratings erklärten den größten Varianzanteil der „Staleness“; Schlaf- und Müdigkeitswerte der Saisonmitte kündigten sie Wochen vor dem Leistungsabfall an; im Taper erklärten sie 72 % der Leistungsverbesserung. Das häufig zitierte Hooper & Mackinnon 1995 (*Sports Med* 20(5)) ist ein Empfehlungsartikel. Duignan et al. 2020 weisen ausdrücklich auf diese Verwechslung hin. *Evidenz: schwach* (n = 14), historisch prägend.

**McLean et al. 2010.** Zitation bestätigt (IJSPP 5(3), 367–383); Abstract war nicht abrufbar. Item- und Skalendetails daher **nicht verifiziert** (Sekundärwissen).

**KEB/AEB (Kellmann, Kölling & Hitzschke 2016; Neuauflage Kellmann & Kölling 2020).** Bestätigt aus dem Manual-Auszug: Antwortskala **„0 (trifft gar nicht zu) bis 6 (trifft voll zu)“**; acht Dimensionen im Wortlaut:

- Erholung: Körperliche Leistungsfähigkeit · Mentale Leistungsfähigkeit · Emotionale Ausgeglichenheit · Allgemeiner Erholungszustand
- Beanspruchung: Muskuläre Beanspruchung · Aktivierungsmangel · Emotionale Unausgeglichenheit · Allgemeiner Beanspruchungszustand

Das AEB umfasst 32 Adjektive (4 je Dimension); in der KEB steht je Dimension ein Item, erläutert durch diese Adjektive. Die Adjektivlisten und der Instruktionstext waren **öffentlich nicht abrufbar** (Dissertation Hitzschke 2018 für Crawler gesperrt) und sind hier bewusst nicht wiedergegeben. Validierung: Faktorenstruktur, konvergente Validität zum EBF-Sport/RESTQ-Sport, Veränderungssensitivität im Hockey-Monitoring (Hitzschke et al. 2015; Stichprobengrößen und Alpha-Werte nicht verifiziert). In einer Jugendstichprobe (n = 1.052, 10–16 Jahre) lag die interne Konsistenz der Kurzskala bei etwa 0,72–0,80 (Kölling et al. 2019). *Evidenz: mittel.*

Zwei Punkte für MyRace: (a) Die KEB ist ein urheberrechtlich geschütztes, in der BISp-Schriftenreihe publiziertes Verfahren – wörtliche Übernahme in eine kommerzielle App braucht eine Klärung mit den Autoren. (b) Kölling & Kellmann (2020) bewerten die Reduktion auf wenige Werte oder ein **Ampelsystem ausdrücklich als sehr kritisch** und empfehlen Einzelfallanalyse der intraindividuellen Streuung.

**PRS (Laurent et al. 2011).** 16 Personen, wiederholte Sprintserien nach 24/48/72 h. Die vor der Einheit abgegebene Erholungseinschätzung korrelierte mit der Leistungsänderung (r = −0,63), unabhängig von RPE, Herzfrequenz und Laktat. *Evidenz: schwach* (n = 16, Sprint, nicht Ausdauer).

**Welche Einzelitems wofür?**

- **Trainingslast:** Müdigkeit/Energie und Muskelkater (Saw 2016; Duignan 2020; Ryan 2019 für Muskelkater). *Evidenz: mittel*, Effekte klein bis moderat.
- **Lebensstress:** Stress und Stimmung. Sie reagieren kaum auf Last (Saw 2016: emotionaler Stress nicht responsiv), hängen aber mit Verletzung und Krankheit zusammen (siehe 3). *Evidenz: schwach bis mittel.*
- **Schlaf:** Ursache, nicht Reaktion. Unverzichtbar, wenn keine Uhr vorhanden ist. *Expertenmeinung.*

### 3. Vorhersagekraft

**Leistung/Output am selben Tag.** Gallo et al. 2016 (36 Australian-Football-Spieler, 15 Einheiten): Ein Wellness-z-Score von −1 am Morgen ging mit 4,9 ± 3,1 % weniger Player Load einher. *Evidenz: schwach bis mittel* – kleiner Effekt, Teamsport, und „weniger Output“ ist nicht „schlechtere Leistung“.

**HRV.** Flatt et al. 2018 (17 Sprintschwimmer, 4 Wochen täglich): LnRMSSD war höher an Tagen mit überdurchschnittlichem Schlaf, Müdigkeit, Stress und Stimmung; 15 von 17 zeigten mindestens einen signifikanten Zusammenhang. Muskelkater war nicht dabei. Subjektiv und HRV überlappen also teilweise, sind aber nicht redundant – passend zu Saw 2016 („korrelieren meist nicht“). *Evidenz: schwach.*

**Overreaching früher erkennen.** ten Haaf et al. 2017: 30 Hobbyradfahrer (Alter 40,8 ± 10,8), 8 Tage, 1.300 km. 15 entwickelten funktionelles Overreaching. Die Veränderung von **Müdigkeit und „Readiness to train“ nach 3 Tagen** klassifizierte 78 % korrekt (Sensitivität 79 %, Spezifität 77 %). Ruhepuls und Einzelparameter trennten die Gruppen nicht. *Evidenz: schwach bis mittel* – passende Population (Freizeitsportler mittleren Alters), aber kleines n, Extrembelastung, Modell nicht extern validiert.

**Verletzung und Krankheit.** Hamlin et al. 2019 (182 Uni-Athleten, 4 Jahre): niedrigere Stimmung (OR 0,89), kürzerer Schlaf (OR 0,94) und mehr akademischer Stress (OR 0,91) gingen mit höherem Verletzungsrisiko einher; Schlafqualität nicht (OR 1,01); Krankheit häufte sich in Prüfungsphasen. Watson et al. 2017 (75 Jugendfußballerinnen, 20 Wochen): schlechtere Tagesstimmung und höhere Last sagten Verletzungen voraus, Krankheit hing nur an der Last. *Evidenz: schwach* – Effekte pro Skalenpunkt klein, nicht für Einzelfallprognosen geeignet. Wellness-Werte taugen als Risikofaktor im Hintergrund, nicht als Warnsystem.

### 4. Minimaler Check-in: Designfragen

**Anzahl und Auswahl.** Vier Dimensionen decken die Evidenz ab: Schlaf (Ursache), Energie/Müdigkeit und Muskelgefühl (Lastreaktion), Stress/Stimmung (Lebenslast). Ein fünftes Item „Bereitschaft“ hat mit ten Haaf 2017 und Laurent 2011 die beste Vorhersage-Evidenz, überlappt aber mit Energie. *Expertenmeinung auf Basis der genannten Studien.*

**Skalenformat.** Preston & Colman 2000 (n = 149): Retest-Reliabilität am höchsten bei 7–10 Stufen (0,93–0,94), am niedrigsten bei 2–4 (0,86–0,89); 5 Stufen wurden als am leichtesten empfunden, 2–4 als am schnellsten. Die Unterschiede sind klein. In der Sportpraxis kommen 5, 7 und 10 Stufen sowie VAS vor, ohne belegten Vorteil eines Formats (Duignan 2020). ten Haaf nutzte VAS. *Evidenz: mittel* (allgemeine Psychometrie), *schwach* (sportspezifisch). Für < 15 Sekunden auf dem Handy sind 5 verbal verankerte Stufen der pragmatische Kompromiss; der Preis ist geringere Auflösung und das Risiko, dass die persönliche Streuung gegen null geht.

**Polung.** Einheitlich „höher = besser“. Die uneinheitliche Polung in der Literatur (Duignan 2020) ist eine bekannte Fehlerquelle. *Expertenmeinung.*

**Bezugsrahmen.** Für „im Vergleich zu deinem Normalzustand“ gegenüber absoluter Abfrage habe ich **keine vergleichende Studie gefunden**. Ein Anker „wie gewohnt“ in der Skalenmitte normalisiert bereits in der Frage; zusätzlich z-Scores zu rechnen wäre doppelte Normalisierung. Empfehlung: absolute Zustandsanker, Normalisierung nur rechnerisch. *Expertenmeinung, dünne Evidenz.*

**Zeitpunkt.** Im Leistungssport bevorzugt das Personal die Abfrage vor dem Training; Athleten können ihren Zustand oft erst nach der Einheit einschätzen und bevorzugen das Tagesende (Saw et al. 2015a). Für ein Readiness-System, das den Tag steuert, bleibt nur der Morgen. *Evidenz: schwach* (qualitativ).

**Individuelle z-Scores.** Üblich in der Forschungspraxis: Gallo 2016, Ryan 2019 und Flatt 2018 (Schwellen ±0,5) rechnen mit individuellen z-Scores; Kölling & Kellmann 2020 empfehlen intraindividuelle Analyse. Für ein bestimmtes Fenster (z. B. 28 Tage) fand ich **keine Evidenz** – das ist Konvention. *Evidenz: mittel* (Prinzip), *Expertenmeinung* (Fensterlänge).

### 5. Compliance und Abnutzung

- **Selbstorganisierte Sportler brechen ein.** Saw et al. 2015b: Von 131 Athleten nutzten 53 % das Instrument überhaupt. Compliance: betreute Teamsportler 84 ± 21 %, **selbstorganisierte Einzelsportler 28 ± 40 %**, mit weiterem Abfall bis Woche 16, besonders bei Freizeitsportlern. Zeitaufwand war das größte Hindernis; Selbstorganisierten war der Inhalt wichtig. Das ist die MyRace-Zielgruppe. *Evidenz: mittel.*
- **Fehlendes Feedback ist der Hauptgrund für schlechte Akzeptanz.** Neupert et al. 2019 (9 Nationalkader-Sprinter, qualitativ): fehlende Rückmeldung als Hauptursache; als unverhältnismäßig empfundene Trainingsänderungen führten zu **unehrlichen Angaben**. Prozentwerte nennt die Studie nicht. Neupert et al. 2022 (30 Praktiker, 599 Athleten): 44 % sagten, Athleten bekämen zu wenig Feedback. Barboza et al. 2017: Rücklauf nur 50–61 %; Athleten wünschten sich visualisierte Rückmeldung. *Evidenz: mittel* (konsistent, aber qualitativ/klein).
- **Verfälschung und Abstumpfung.** Saw et al. 2015a (30 Interviews, davon 8 Athleten): etwa die Hälfte der Athleten gab an, nicht immer ehrlich zu antworten; Strafen führten zu achtlosem Ausfüllen; beschrieben werden „Fragebogenmüdigkeit“ und eingeschliffene Antworten. In einer App ohne Trainer entfällt der soziale Druck, aber ein neuer Anreiz entsteht: Wer weiß, dass „müde“ die Einheit streicht, antwortet strategisch. *Evidenz: schwach.*
- **EMA-Forschung.** Gepoolte Compliance um 79 % (Davanzo et al. 2023, klinische Stichprobe, 18 Studien) – aber in bezahlten, kurzen Studien; Vergütung hebt die Compliance laut Sekundärquelle um rund 7 Prozentpunkte (Ottenstein & Werner 2022, nicht verifiziert). Designmerkmale wie Itemzahl zeigten bei Davanzo keinen signifikanten Effekt. Wrzus & Neubauer 2023 war nicht abrufbar. Übertragbarkeit auf eine freiwillige Dauer-App: gering. Zu Straight-Lining in Sport-Check-ins fand ich keine quantitative Studie.

**Streak: nein.** Silverman & Barasch 2023 (7 Studien): Intakte Streaks erhöhen die Wiederholung, gebrochene senken sie – stärker bei Selbstzuschreibung, schwächer, wenn der Streak reparierbar ist. Eine Analyse von 13.799 negativen Posts zu Fitness-Apps (UCL 2025, *Br J Health Psychol*) beschreibt Scham, Ärger über Erinnerungen und Abbruch nach verlorenem Streak; da nur negative Posts ausgewertet wurden, sagt sie nichts über Häufigkeit. *Evidenz: mittel* (Mechanismus), *schwach* (Schaden).

Für den Check-in kommt ein spezifisches Argument hinzu: Ein Streak belohnt das **Ausfüllen**, nicht das **ehrliche** Ausfüllen. Er fördert genau die mechanischen Antworten, die Saw et al. 2015a beschreiben, und macht eine ausgelassene Angabe (unkritisch) zu einem Verlust. Empfehlung: kein Zähler mit Abriss. Stattdessen eine nicht wertende Wochenanzeige („5 von 7 Tagen“) und die Aussage, dass die Einschätzung ab einer bestimmten Datenmenge genauer wird. *Expertenmeinung auf Basis der genannten Befunde.*

**Was die Compliance trägt:** Kürze, sofortige sichtbare Wirkung der Antwort, Transparenz über die Verwendung, fester Zeitpunkt mit einer einzigen Erinnerung, keine Sanktion (Saw 2015a/b; Neupert 2019; Barboza 2017).

### 6. Schmerz, Verletzung, Krankheit

**OSTRC-H2 (Clarsen et al. 2020).** Vier Fragen über die letzten 7 Tage: Teilnahme, Trainingsanpassung, Leistung, Symptome; Score 0–100 (Stufenwerte 0/8/17/25). Neu ist die **Gatekeeper-Logik**: „volle Teilnahme ohne Beschwerden“ beendet den Fragebogen. Dadurch gehen etwa 13 % der Fälle (geringfügige) verloren, 98,5 % der substanziellen bleiben. Das Instrument ist wöchentlich, nicht täglich. *Evidenz: stark* (Konsensus-Update, breit eingesetzt).

**Schmerzregel.** Die Quelle ist Silbernagel et al. 2007 (RCT, 38 Patienten mit Achillessehnen-Tendinopathie): Weiterlaufen mit Schmerzmonitoring brachte keinen Nachteil gegenüber sechs Wochen Pause (VISA-A 57 → 85 vs. 57 → 91 nach 12 Monaten). Die Schwelle in diesem Modell ist **5/10**, mit Abklingen bis zum nächsten Morgen und ohne Zunahme von Woche zu Woche – diese Details habe ich nur über eine Sekundärquelle (Running Physio) bestätigt, nicht im Originaltext. Die im Auftrag genannte Regel **„> 3/10 → nicht laufen“ ist Klinikermeinung**, keine Studienschwelle; „Gangbildveränderung → Stopp“ ist verbreitete Praxis ohne von mir gefundene Primärquelle. Das Modell gilt für eine diagnostizierte Sehnenerkrankung unter Rehabilitation, nicht für beliebige Schmerzen oder Stressfrakturen. *Evidenz: schwach* (für die Übertragung auf alle Läufer).

**Ableitung.** Keine tägliche Schmerzfrage, sondern Gatekeeper: zwei optionale Chips. Nur bei Auswahl folgen Detailfragen. Die konservativere 3/10-Schwelle ist für eine App ohne Diagnose vertretbar, muss aber als Vorsichtsregel und nicht als belegte Grenze kommuniziert werden.

### 7. RPE nach der Einheit

Session-RPE mit der CR-10-Skala ist gut belegt: 36 Validierungsstudien, Validität und Reliabilität über Sportarten, Geschlechter und Leistungsniveaus (Haddad et al. 2017). Die Skala selbst ist austauschbar – CR-10 und Borg 6–20 korrelierten bei Freizeitsportlern mit r = 0,90 (Arney et al. 2019). *Evidenz: stark* (sRPE), *mittel* (Skalenwechsel).

„Wie hat es sich angefühlt? 1–5“ ist **kein gleichwertiger Ersatz**: Die Frage ist mehrdeutig zwischen Anstrengung und Befinden. Eine Einheit kann hart und gut oder leicht und zäh gewesen sein. Zu einer 5-stufigen Anstrengungsskala als sRPE-Ersatz fand ich keine Validierung. Empfehlung: Frage auf Anstrengung umstellen, 0–10 anbieten; das Befinden optional getrennt. Die Unterscheidung Anstrengung/Affekt (Feeling Scale, Hardy & Rejeski 1989) konnte ich in dieser Recherche nicht an der Quelle prüfen (nicht verifiziert).

### 8. Konkreter Vorschlag

#### Täglicher Check-in (morgens, 4 Pflichtfragen, je 5 Stufen, höher = besser)

Reihenfolge von konkret zu global; die Schlaf-Frage zuerst, weil sie am leichtesten zu beantworten ist.

| # | Frage | Anker 1 · 2 · 3 · 4 · 5 | Begründung |
|---|---|---|---|
| 1 | **Wie hast du geschlafen?** | sehr schlecht · schlecht · okay · gut · sehr gut | Ursache-Variable; ohne Uhr die einzige Schlafquelle. Kündigte Staleness an (Hooper 1995), hängt mit HRV zusammen (Flatt 2018); nicht lastresponsiv (Saw 2016) – deshalb als Eingangsgröße, nicht als Lastsignal werten. |
| 2 | **Wie viel Energie hast du heute?** | völlig platt · müde · normal · frisch · voller Energie | Müdigkeit ist das am häufigsten lastsensitive Item (Saw 2016; Duignan 2020) und Teil des 3-Tage-Prädiktors (ten Haaf 2017). Schwache Einzeltag-Reliabilität (Ryan 2019) → nur über mehrere Tage werten. |
| 3 | **Wie fühlen sich deine Beine an?** | sehr schwer, starker Muskelkater · schwer · normal · locker · sehr locker | Muskelkater: beste Reliabilität unter den Einzelitems (ICC 0,77; Ryan 2019), lastsensitiv (Duignan 2020). „Beine“ statt „Muskeln“, weil laufspezifisch. |
| 4 | **Wie geht es dir im Kopf?** | sehr gestresst · angespannt · okay · entspannt · sehr entspannt | Lebensstress/Stimmung: nicht lastsensitiv, aber mit Verletzung und Krankheit verknüpft (Hamlin 2019; Watson 2017); geringer Messfehler (Ryan 2019). |

**Optional, darunter als Chips (Standard: nichts ausgewählt):**

- **„Etwas zwickt“** → „Wo?“ (Körperregion) → „Wie stark beim Gehen oder Laufen?“ 0–10 → „Läufst du deshalb anders als sonst?“ Ja/Nein.
- **„Fühle mich krank“** → „Was trifft zu?“ nur Hals/Nase · Husten, Brust · Fieber, Gliederschmerzen · Magen-Darm.

Gatekeeper-Prinzip nach OSTRC-H2 (Clarsen 2020). Ein gesetzter Chip bleibt am Folgetag vorausgewählt („Zwickt es noch?“), damit Beschwerden nicht stillschweigend verschwinden. Einmal pro Woche zusätzlich die OSTRC-Leitfrage: „Hat dich in den letzten 7 Tagen etwas beim Training eingeschränkt?“

**Bewusst nicht im Pflichtteil:** „Wie bereit fühlst du dich fürs Training?“ Die Evidenz ist gut (ten Haaf 2017; Laurent 2011), aber das Item ist am stärksten strategisch verzerrbar, wenn es die Einheit steuert. Sinnvoll als optionale Frage unmittelbar vor einer harten Einheit.

#### Nach der Einheit (Pflicht: 1 Frage)

**„Wie anstrengend war die Einheit?“** 0–10 mit Ankern: 0 gar nicht · 1 sehr leicht · 2 leicht · 3 mäßig · 5 anstrengend · 7 sehr anstrengend · 10 maximal. Die Anker sind ein eigener Formulierungsvorschlag, keine geprüfte deutsche Borg-Übersetzung. Begründung: Haddad 2017; Arney 2019.

Optional: **„Und wie hat sie sich angefühlt?“** schlecht · zäh · okay · gut · richtig gut. Das bisherige 1–5-Item bleibt so erhalten, wird aber nicht als Lastmaß verrechnet.

### Was für MyRace folgt

1. **Items getrennt verrechnen, nicht summieren.** Gesamtscores sind weniger sensitiv (Saw 2016). Energie und Beine speisen die Lastreaktion, Schlaf und Kopf die Erholungsvoraussetzungen.
2. **Persönliche Baseline.** z-Score pro Item gegen ein rollierendes Fenster (28 Tage als Konvention, nicht belegt). Bei 5 Stufen eine Mindest-Standardabweichung festlegen, sonst kippt ein einzelner Punkt Abweichung in Extremwerte. Vor etwa 14 Einträgen absolute Schwellen verwenden.
3. **Trend vor Einzeltag.** Wegen der schwachen Einzeltag-Reliabilität (Ryan 2019) und des 3-Tage-Befunds (ten Haaf 2017) zählen zwei bis drei auffällige Tage in Folge mehr als ein Ausreißer.
4. **Gewicht begrenzen.** Subjektive Werte allein sollten eine Einheit abmildern oder eine Rückfrage auslösen, aber nicht automatisch streichen. Das reduziert auch strategisches Antworten (Neupert 2019).
5. **Sofort zeigen, was die Antwort bewirkt.** Ein Satz nach dem Check-in („Schlaf und Beine unter deinem Schnitt – heute locker statt Tempo“) ist der am besten belegte Hebel für Adhärenz (Saw 2015a/b; Neupert 2019/2022; Barboza 2017).
6. **Kein Streak, keine Mahnungen.** Eine Erinnerung zur festen Zeit, Wochenanzeige ohne Abriss, Auslassen ohne Folgen.
7. **Keine Ampel als einzige Ausgabe.** Die Entwickler der KEB halten das für sehr kritisch (Kölling & Kellmann 2020); Schwellenwerte sind in der Praxis meist willkürlich (Saw 2015a).
8. **Eigene Formulierungen statt KEB-Wortlaut**, solange keine Nutzungsfreigabe vorliegt.
9. **Schmerz-Logik als Vorsichtsregel ausweisen**, nicht als belegte Grenze; bei verändertem Laufbild oder anhaltenden Beschwerden auf ärztliche Abklärung verweisen.
10. **Ehrliche Einordnung im Produkt:** Die vorgeschlagenen Items sind evidenzgestützt zusammengestellt, aber als Set nicht validiert. Das gilt für praktisch alle Wellness-Check-ins am Markt (Jeffries 2020).

### Offene Punkte und dünne Evidenz

- Praktisch alle Daten stammen aus dem betreuten Leistungssport, meist Teamsport. Für Hobbyläufer ohne Trainer gibt es nur ten Haaf 2017 (Radfahrer) und Saw 2015b (Compliance).
- Keine Studie zum Bezugsrahmen der Frage, zur optimalen Baseline-Länge oder zu Emojis als Anker gefunden.
- Keine Validierung einer 5-stufigen Anstrengungsskala als sRPE-Ersatz gefunden.
- KEB-Adjektive und -Instruktion, McLean-2010-Details, TQR-Skalendetails, Wrzus & Neubauer 2023, Ottenstein & Werner 2022, Thorpe 2017 (nur Abstract), Feeling Scale: nicht oder nur teilweise verifiziert.
- Watson et al. 2017: Die auf der Verlagsseite ausgelesene Odds Ratio für Stimmung (0,012) wirkt unplausibel klein; ich habe nur Richtung und p-Wert (0,011) verwendet.

### Quellen

Alle Einträge wurden per Suche gefunden; „Abstract“ bedeutet, dass nur die Zusammenfassung geprüft wurde.

1. Arney BE, Glover R, Fusco A, et al. (2019). Comparison of RPE (rating of perceived exertion) scales for session RPE. *Int J Sports Physiol Perform*, 14(7), 994–996. DOI 10.1123/ijspp.2018-0637. (Abstract)
2. Barboza SD, Bolling CS, Nauta J, van Mechelen W, Verhagen E (2017). Acceptability and perceptions of end-users towards an online sports-health surveillance system. *BMJ Open Sport Exerc Med*, 3(1), e000275. DOI 10.1136/bmjsem-2017-000275. (Autorenliste aus Suchtreffer, Volltext gelesen)
3. Campbell PG, Stewart IB, Sirotic AC, Drovandi C, Foy BH, Minett GM (2021). Analysing the predictive capacity and dose-response of wellness in load monitoring. *J Sports Sci*, 39(12), 1339–1347. DOI 10.1080/02640414.2020.1870303. (Abstract)
4. Clarsen B, Bahr R, Myklebust G, et al. (2020). Improved reporting of overuse injuries and health problems in sport: an update of the Oslo Sport Trauma Research Center questionnaires. *Br J Sports Med*, 54(7), 390–396. DOI 10.1136/bjsports-2019-101337.
5. Davanzo A, d'Huart D, Seker S, et al. (2023). Study features and response compliance in ecological momentary assessment research in borderline personality disorder: systematic review and meta-analysis. *J Med Internet Res*, 25, e44853. (DOI nicht verifiziert)
6. Duignan C, Doherty C, Caulfield B, Blake C (2020). Single-item self-report measures of team-sport athlete wellbeing and their relationship with training load: a systematic review. *J Athl Train*, 55(9), 944–953. DOI 10.4085/1062-6050-0528.19.
7. Flatt AA, Esco MR, Nakamura FY (2018). Association between subjective indicators of recovery status and heart rate variability among Division-1 sprint-swimmers. *Sports*, 6(3), 93. DOI 10.3390/sports6030093. (Abstract)
8. Gallo TF, Cormack SJ, Gabbett TJ, Lorenzen CH (2016). Pre-training perceived wellness impacts training output in Australian football players. *J Sports Sci*, 34(15), 1445–1451. DOI 10.1080/02640414.2015.1119295. (Abstract)
9. Haddad M, Stylianides G, Djaoui L, Dellal A, Chamari K (2017). Session-RPE method for training load monitoring: validity, ecological usefulness, and influencing factors. *Front Neurosci*, 11, 612. DOI 10.3389/fnins.2017.00612. (Abstract)
10. Hamlin MJ, Wilkes D, Elliot CA, Lizamore CA, Kathiravel Y (2019). Monitoring training loads and perceived stress in young elite university athletes. *Front Physiol*, 10, 34. DOI 10.3389/fphys.2019.00034.
11. Hitzschke B (2018). *Entwicklung des Akutmaßes und der Kurzskala zur Erfassung von Erholung und Beanspruchung im Sport*. Dissertation, Ruhr-Universität Bochum. URN urn:nbn:de:hbz:294-61119. (nur Abstract; Volltext nicht abrufbar)
12. Hitzschke B, Kölling S, Ferrauti A, Meyer T, Pfeiffer M, Kellmann M (2015). Entwicklung der Kurzskala zur Erfassung von Erholung und Beanspruchung im Sport (KEB). *Zeitschrift für Sportpsychologie*, 22(4), 146–161. DOI 10.1026/1612-5010/a000150. (Abstract; Autorenliste nicht verifiziert)
13. Hooper SL, Mackinnon LT (1995). Monitoring overtraining in athletes: recommendations. *Sports Med*, 20(5), 321–327. DOI 10.2165/00007256-199520050-00003. (Autoren aus Suchanfrage, nicht aus der Seite bestätigt)
14. Hooper SL, Mackinnon LT, Howard A, Gordon RD, Bachmann AW (1995). Markers for monitoring overtraining and recovery. *Med Sci Sports Exerc*, 27, 106–112. (Sekundärzusammenfassung; DOI nicht verifiziert)
15. Jeffries AC, Wallace L, Coutts AJ, McLaren SJ, McCall A, Impellizzeri FM (2020). Athlete-reported outcome measures for monitoring training responses: a systematic review of risk of bias and measurement property quality according to the COSMIN guidelines. *Int J Sports Physiol Perform*, 15(9). DOI 10.1123/ijspp.2020-0386. (Abstract)
16. Kellmann M, Kölling S (2020). *Das Akutmaß und die Kurzskala zur Erfassung von Erholung und Beanspruchung für Erwachsene und Kinder/Jugendliche*. Schriftenreihe des BISp 2020,01. Sportverlag Strauß. ISBN 978-3-86884-715-4. (nur Titelei/Inhaltsverzeichnis)
17. Kellmann M, Kölling S, Hitzschke B (2016). *Das Akutmaß und die Kurzskala zur Erfassung von Erholung und Beanspruchung im Sport – Manual*. Schriftenreihe des BISp 2016,07. Sportverlag Strauß. ISBN 978-3-86884-538-9. (Leseprobe)
18. Kenttä G, Hassmén P (1998). Overtraining and recovery: a conceptual model. *Sports Med*, 26(1), 1–16. DOI 10.2165/00007256-199826010-00001. (nur Zitation bestätigt; Inhalt nicht verifiziert)
19. Kölling S, Ferrauti A, Meyer T, Pfeiffer M, Kellmann M (2019). Modification and applicability of questionnaires to assess the recovery-stress state among adolescent and child athletes. *Front Physiol*, 10, 1414. DOI 10.3389/fphys.2019.01414.
20. Kölling S, Kellmann M (2020). Current considerations and future directions of psychometric training monitoring of recovery-stress states. *Dtsch Z Sportmed*, 71, 29–34. DOI 10.5960/dzsm.2019.408.
21. Laurent CM, Green JM, Bishop PA, et al. (2011). A practical approach to monitoring recovery: development of a perceived recovery status scale. *J Strength Cond Res*, 25(3), 620–628. DOI 10.1519/JSC.0b013e3181c69ec6. (Abstract; vollständige Autorenliste nicht verifiziert)
22. McLean BD, Coutts AJ, Kelly V, McGuigan MR, Cormack SJ (2010). Neuromuscular, endocrine, and perceptual fatigue responses during different length between-match microcycles in professional rugby league players. *Int J Sports Physiol Perform*, 5(3), 367–383. DOI 10.1123/ijspp.5.3.367. (nur Zitation bestätigt; Inhalt nicht verifiziert)
23. Neupert EC, Cotterill ST, Jobson SA (2019). Training-monitoring engagement: an evidence-based approach in elite sport. *Int J Sports Physiol Perform*, 14(1), 99–104. DOI 10.1123/ijspp.2018-0098. (Abstract)
24. Neupert EC, Gupta L, Holder T, Jobson SA (2022). Athlete monitoring practices in elite sport in the United Kingdom. *J Sports Sci*, 40(13), 1450–1457. DOI 10.1080/02640414.2022.2085435. (Abstract)
25. Preston CC, Colman AM (2000). Optimal number of response categories in rating scales: reliability, validity, discriminating power, and respondent preferences. *Acta Psychologica*, 104(1), 1–15. (DOI nicht verifiziert)
26. Ryan S, Pacecca E, Tebble J, Hocking J, Kempton T, Coutts AJ (2019). Measurement characteristics of athlete monitoring tools in professional Australian football. *Int J Sports Physiol Perform*. (Manuskriptfassung im UTS-Repositorium; Band, Seiten, DOI nicht verifiziert)
27. Saw AE, Main LC, Gastin PB (2015a). Monitoring athletes through self-report: factors influencing implementation. *J Sports Sci Med*, 14(1), 137–146. https://jssm.org/jssm-14-137.xml-Fulltext
28. Saw AE, Main LC, Gastin PB (2015b). Impact of sport context and support on the use of a self-report measure for athlete monitoring. *J Sports Sci Med*, 14(4), 732–739. https://jssm.org/jssm-14-732.xml-Fulltext
29. Saw AE, Main LC, Gastin PB (2016). Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures: a systematic review. *Br J Sports Med*, 50(5), 281–291. https://bjsm.bmj.com/content/50/5/281 (Seitenzahl und DOI nicht verifiziert)
30. Saw AE, Kellmann M, Main LC, Gastin PB (2017). Athlete self-report measures in research and practice: considerations for the discerning reader and fastidious practitioner. *Int J Sports Physiol Perform*, 12(Suppl 2), S2-127–S2-135. (Abstract; DOI nicht verifiziert)
31. Silbernagel KG, Thomeé R, Eriksson BI, Karlsson J (2007). Continued sports activity, using a pain-monitoring model, during rehabilitation in patients with Achilles tendinopathy: a randomized controlled study. *Am J Sports Med*, 35(6), 897–906. (Abstract; 5/10-Schwelle über Sekundärquelle https://www.running-physio.com/running-pain/; DOI nicht verifiziert)
32. Silverman J, Barasch A (2023). On or off track: how (broken) streaks affect consumer decisions. *J Consumer Res*, 49(6), 1095–1117. https://academic.oup.com/jcr/article-abstract/49/6/1095/6623414
33. ten Haaf T, van Staveren S, Oudenhoven E, et al. (2017). Prediction of functional overreaching from subjective fatigue and readiness to train after only 3 days of cycling. *Int J Sports Physiol Perform*, 12(Suppl 2), S2-87–S2-94. DOI 10.1123/ijspp.2016-0404. (Abstract; Schreibweise des Zweitautors und Heftangabe nicht verifiziert)
34. Thorpe RT, Atkinson G, Drust B, Gregson W (2017). Monitoring fatigue status in elite team-sport athletes: implications for practice. *Int J Sports Physiol Perform*, 12(Suppl 2), S2-27–S2-34. DOI 10.1123/ijspp.2016-0434. (Abstract; im Text nicht tragend verwendet)
35. UCL News (22.10.2025). Emotional strain of fitness and calorie counting apps revealed. Bericht über eine Studie im *Br J Health Psychol* (Seniorautorin P. Bondaronek). https://www.ucl.ac.uk/news/2025/oct/emotional-strain-fitness-and-calorie-counting-apps-revealed (Originalarbeit, Erstautor und DOI nicht verifiziert)
36. Watson A, Brickson S, Brooks A, Dunn W (2017). Subjective well-being and training load predict in-season injury and illness risk in female youth soccer players. *Br J Sports Med*, 51(3), 194–199. DOI 10.1136/bjsports-2016-096584. (Seitenzahl nicht verifiziert)

**Gesucht, aber nicht gefunden oder nicht abrufbar:** Coventry et al. 2023; Wrzus & Neubauer 2023 (EMA-Meta-Analyse, Seite gesperrt); Ottenstein & Werner 2022 (nur über Blog-Sekundärquelle); Hardy & Rejeski 1989 (Feeling Scale).

---

## B5 – Lebensstress, Alltag und Erholung: Was lässt sich aus Kalenderdaten ableiten?


Stand: 12. November 2026. Recherche per Websuche und Abruf von Abstracts, Volltexten und Herstellerseiten.

**Lesehinweis zur Evidenzstärke:** stark = mehrere konsistente Studien oder Meta-Analysen; mittel = einzelne gute Studien oder Meta-Analysen mit Einschränkungen; schwach = kleine, einzelne oder beobachtende Studien; Expertenmeinung = Konsenspapiere und Modelle; Heuristik = eigene Ableitung ohne direkte Belege.

**Lesehinweis zur Verifikation:** Der Abruf von PubMed und einigen Verlagsseiten war zeitweise gesperrt. Zahlen, die ich nicht an einer abgerufenen Seite prüfen konnte, sind mit „nicht verifiziert“ markiert. Diese Angaben vor einer Verwendung in der App oder im Marketing bitte am Original prüfen.

---

### Kurzfazit

1. Dass psychosozialer Stress Erholung und Anpassung verschlechtert, ist plausibel und mehrfach gezeigt. Die Belege stammen aber fast nur aus kleinen Beobachtungsstudien mit Studierenden, und zwei der meistzitierten Arbeiten beruhen auf denselben 31 Personen.
2. Am besten belegt ist der Weg über Zeit und Schlaf: spätes Arbeitsende, kurze Ruhezeit, lange Arbeitstage und Prüfungsphasen verkürzen oder verschlechtern den Schlaf. Das kann ein Kalender direkt abbilden.
3. Für feste „Stress-Punkte pro Terminart“ gibt es keine Evidenz. Solche Gewichte sind Heuristik und müssen als solche gekennzeichnet werden.
4. Es gibt keinen RCT, in dem Training nach Lebensstress oder Kalender gesteuert wurde und besser abschnitt. Die nächstliegende Evidenz ist HRV-gesteuertes Training mit kleinem Vorteil.
5. Empfehlung: täglicher Ein-Item-Check-in als Grundwahrheit, Kalender für Vorausschau (Zeit- und Schlaffenster) und als Erklärung, persönliche Effekte erst ab ausreichender Datenlage und vorsichtig formuliert.

---

### 1. Psychosozialer Stress, Erholung und Anpassung

#### 1.1 Erholung nach Krafttraining (Stults-Kolehmainen)

- **Stults-Kolehmainen & Bartholomew 2012** (MSSE 44(11):2220–2227): 31 Studierende aus Krafttrainingskursen, Beinpresse bis zur Erschöpfung, Messung der maximalen isometrischen Kraft bis 60 Minuten danach. Lebensereignis-Stress moderierte die Krafterholung (linear p = 0,013), wahrgenommener Stress ebenfalls (p = 0,023). Energie, Müdigkeit und Muskelkater waren in der ersten Stunde nicht betroffen.
- **Stults-Kolehmainen, Bartholomew & Sinha 2014** (JSCR 28(7):2007–2017): Verlauf über 96 Stunden. Laut Tabelle 2 des Volltexts erholte die Gruppe mit niedrigem Stress nach 60 Minuten 60,3 % des Kraftverlusts, die mit hohem Stress 38,2 %. Nach 24 h waren es 81,4 % gegenüber 48,1 %, nach 48 h 95,4 % gegenüber 47,7 %, nach 96 h 93,4 % gegenüber 64,6 %. Stress moderierte auch Energie, Müdigkeit und Muskelkater.
- **Wichtige Einschränkung:** Beide Arbeiten beschreiben dieselben 31 Personen (9 Frauen, 22 Männer). Die Gruppen wurden aus den Extremen eines Screenings von 210 Studierenden gezogen. Das Design ist quasi-experimentell, Stress wurde rückblickend erfragt. Im Volltext stehen widersprüchliche Gruppengrößen (18/13 im Text, 16/15 in der Tabelle) und eine vertauschte Fußnote. Die Radleistung wurde nicht moderiert.
- **Evidenzstärke: schwach bis mittel.** Der Effekt ist groß, aber es ist eine einzige kleine Stichprobe, Kraft statt Ausdauer, ohne unabhängige Replikation, die ich gefunden hätte.

#### 1.2 Trainingsanpassung

- **Bartholomew et al. 2008** (JSCR 22(4):1215–1221): 135 Studierende, 12 Wochen Krafttraining, Median-Split nach negativen Lebensereignissen. Die Gruppe mit wenig Stress steigerte Bankdrücken und Kniebeuge signifikant stärker. Die konkreten Kilogramm-Werte konnte ich nicht abrufen (**nicht verifiziert**). Evidenzstärke: schwach bis mittel (beobachtend, Median-Split).
- **Ruuska et al. 2012** (Frontiers in Physiology 3:51): Der Titel lautet anders als angenommen, nämlich „Self-Rated Mental Stress and Exercise Training Response in Healthy Subjects“. 44 untrainierte Personen absolvierten zwei Wochen Radtraining (10 Einheiten, je 30 min bei 75 % HFmax). Die VO2peak stieg im Mittel um 7,4 ± 7,3 % (Spanne −5 bis +26 %). Die Stress-Selbsteinschätzung zu Beginn korrelierte mit dem Zuwachs: r = 0,32 für VO2peak (p = 0,039) und r = 0,45 für die Maximalleistung (p = 0,002). Hohe Skalenwerte bedeuten hier wenig Stress. Gemessen wurde mit einer einzigen, unveröffentlichten Frage; die Autoren nennen das Ergebnis selbst sehr vorläufig. Evidenzstärke: schwach.

#### 1.3 Verletzung und Krankheit

- **Mann et al. 2016** (JSCR 30(1):20–25): 101 College-Footballer, wochenweise Einteilung. Die Odds für eine verletzungsbedingte Einschränkung lagen in Prüfungswochen 1,78-fach höher als in Wochen mit wenig akademischem Stress (p = 0,0088). In Wochen mit hoher körperlicher Belastung (Saisonvorbereitung) waren sie 3,65-fach höher. Bei Spielern mit regelmäßiger Einsatzzeit unterschieden sich Prüfungswochen und Vorbereitungswochen nicht mehr (OR 1,13; p = 0,75). Konfidenzintervalle standen im Abstract nicht. Evidenzstärke: mittel für den Zusammenhang, schwach für Kausalität (ein Team, Prüfungswochen sind nicht zufällig verteilt).
- **Ivarsson et al.** (Sports Medicine 47(2):353–365; online 2016, Heft 2017): Meta-Analyse zu psychosozialen Faktoren und Sportverletzung. Laut einer Sekundärquelle (Übersichtsarbeit zu Fußballverletzungen) hatte die Stressreaktion den stärksten Zusammenhang mit Verletzungsraten (r = 0,27), die Vorgeschichte an Stressoren einen schwächeren (r = 0,13). Die oft genannte Wirkung psychologischer Präventionsprogramme (Hedges g ≈ 0,82) konnte ich nicht am Original prüfen (**nicht verifiziert**). Evidenzstärke: mittel; die Zusammenhänge sind klein.
- **Williams & Andersen 1998** (Stress-Injury-Modell): theoretisches Modell, wonach Persönlichkeit, Stressoren-Vorgeschichte und Bewältigungsressourcen die Stressreaktion und darüber das Verletzungsrisiko beeinflussen. Evidenzstärke: Modell, durch die Meta-Analyse teilweise gestützt. Das Original habe ich nicht abgerufen.
- **Laux et al. 2015** (J Sports Sci 33(20):2140–2148): 22 Bundesliga-Fußballer, 16 Monate, 222 monatliche Fragebögen (RESTQ-Sport), 44 Verletzungen. Höhere Werte bei Müdigkeit (OR 1,70; p = 0,007) und gestörten Pausen (OR 1,84; p = 0,047) gingen mit mehr Verletzungen im Folgemonat einher, bessere Schlafqualität mit weniger (OR 0,53; p = 0,010). Evidenzstärke: schwach bis mittel (ein Team, n = 22). Eine Quelle „Lehrer“ zu diesem Thema habe ich nicht gefunden.
- **Otter et al. 2016** (Int J Sports Med 37(3):224–229): 16 Läuferinnen und Läufer erlebten dasselbe schwere negative Ereignis. Allgemeiner Stress stieg in der Ereigniswoche und der Woche danach, Wohlbefinden und Erholung sanken. Bei 7 Personen mit Laufbandtest war die Laufökonomie drei Wochen später verschlechtert. Sportspezifischer Stress änderte sich nicht. Zahlenwerte standen im Abstract nicht. Evidenzstärke: schwach (natürliches Experiment, n = 7 für die Laufökonomie), aber die einzige gefundene Arbeit direkt an Läufern.

#### 1.4 Mentale Ermüdung und Ausdauerleistung

- **Marcora et al. 2009** (J Appl Physiol): 16 Personen im Cross-over. Nach 90 Minuten anspruchsvoller Denkaufgabe sank die Zeit bis zur Erschöpfung auf dem Rad von 754 ± 339 s auf 640 ± 316 s (p = 0,003), also um rund 15 %.
- **Van Cutsem et al. 2017** (Sports Medicine 47(8):1569–1588): systematische Übersicht mit 11 Studien. Die Ausdauerleistung sank bei höherem Anstrengungsempfinden; Maximalkraft, Schnellkraft und anaerobe Leistung blieben unberührt, ebenso Herzfrequenz, Laktat und Sauerstoffaufnahme.
- **Brown et al. 2020** (Sports Medicine 50:497–529): 73 Studien, 91 Vergleiche, 2581 Personen. Gesamteffekt g = −0,38 (95 %-KI −0,46 bis −0,31); für aerobe Leistung g = −0,26.
- **Kritik – Holgado et al. 2020** (Journal of Cognition 3(1):38): 21 Ausdauerstudien, N = 317, mittlere Stichprobe etwa 13. Der unkorrigierte Effekt lag bei dz = −0,50 (−0,76 bis −0,25), nach Korrektur für Publikationsverzerrung bei dz = −0,08 (−0,40 bis 0,23). Die Arbeit berichtet Cohens dz, nicht Hedges g, und hat eine Korrektur (2021). Eine Replikationsstudie derselben Gruppe („Does mental fatigue impair physical performance? A replication study“) existiert; Details **nicht verifiziert**.
- **Bewertung:** Der wahre Effekt liegt vermutlich zwischen null und klein. Evidenzstärke: mittel für „wahrscheinlich kleiner Effekt auf Ausdauer über das Anstrengungsempfinden“, schwach für jede konkrete Größe. Für MyRace heißt das: Ein harter Lauf nach einem Klausurtag fühlt sich eher schwerer an; eine messbare Leistungseinbuße ist nicht gesichert.

#### 1.5 Prüfungsstress bei Studierenden

- **Marucha, Kiecolt-Glaser & Favagehi 1998** (Psychosomatic Medicine): 11 Zahnmedizin-Studierende erhielten eine 3,5-mm-Gaumenwunde in den Ferien und erneut kurz vor Prüfungen. Die Heilung dauerte vor Prüfungen im Mittel 40 % länger; Interleukin-1 lag um zwei Drittel niedriger (Angaben aus der Pressemitteilung der Universität; Band und Seiten **nicht verifiziert**). Evidenzstärke: mittel für das Prinzip (jede Person war ihre eigene Kontrolle), aber n = 11.
- **Neigel et al. 2024** (arXiv 2402.11823): 103 Studierende mit Oura-Ring, bis zu 28 Monate. In den zwei Wochen vor Prüfungen lag die nächtliche HRV um 1,5 bis 1,7 ms niedriger; die Wach-Herzfrequenz lag vor und während der Frühjahrsprüfungen um etwa 2 Schläge höher. Während der Frühjahrsprüfungen selbst war die nächtliche HRV aber leicht höher (+0,71 ms). Die Effekte sind klein und nicht einheitlich. Vorabdruck, 88 % Männer. Evidenzstärke: schwach bis mittel.
- **Russischsprachige Holter-Studie 2025** (29 Studierende): verkürzte Gesamtschlafzeit und veränderte autonome Regulation im Schlaf während der Prüfungsphase. Autoren und DOI **nicht verifiziert**. Evidenzstärke: schwach.
- **Immunfunktion allgemein:** Eine Übersicht von Glaser und Kollegen (1999) hält fest, dass stressbedingte Immunveränderungen meist klein sind und im Normalbereich bleiben. Die klassische Erkältungsstudie von Cohen (1991) habe ich nicht abgerufen (**nicht verifiziert**).

#### 1.6 Gibt es RCTs mit Trainingsanpassung nach Lebensstress?

Ich habe keinen gefunden. Am nächsten kommt HRV-gesteuertes Training: **Granero-Gallegos et al. 2020** (IJERPH 17:7999) fassten 6 RCTs mit 195 Personen zusammen. Die VO2max verbesserte sich unter HRV-Steuerung mit einer Effektstärke von 0,40 gegenüber 0,22 bei festem Plan. Die Heterogenität war sehr hoch (I² = 94 %), das Verzerrungsrisiko meist hoch oder unklar. HRV bildet Lebensstress nur indirekt ab. **Die zentrale Annahme von MyRace – Anpassung nach Lebensbelastung verbessert das Trainingsergebnis – ist damit nicht direkt belegt.**

---

### 2. Schichtarbeit, späte Arbeit, Schlafverschiebung, Reisen

- **Kurze Ruhezeiten – Vedaa et al. 2015** (Ergonomics, systematische Übersicht): 22 Studien, 14 028 Personen; „quick return“ heißt höchstens 11 Stunden zwischen zwei Schichten. Nach Spätschicht mit folgendem Frühdienst betrug der Schlaf etwa 5,0 bis 6,5 Stunden. Fünf Studien zeigten mehr Schläfrigkeit, sechs mehr Ermüdung; zwei Interventionsstudien fanden weniger Müdigkeit nach Abbau kurzer Ruhezeiten. Die Autoren nennen die Evidenz selbst eher schwach (meist Querschnitt, Selbstauskunft). Zu Unfällen war die Lage widersprüchlich. Evidenzstärke: mittel für Schlafverkürzung, schwach für Unfälle.
- **Vedaa et al. 2020** („Short rest between shifts (quick returns) and night work is associated with work-related accidents“): Titel bestätigt, die Seite ließ sich nicht abrufen; Zahlen **nicht verifiziert**.
- **Sozialer Jetlag – Wittmann et al. 2006** (Chronobiology International): 501 Personen. Der Begriff beschreibt die Abweichung zwischen innerer Uhr und sozialem Zeitplan; die Zusammenhänge mit Wohlbefinden und Genussmittelkonsum waren bei unter 25-Jährigen am stärksten. Band und Seiten **nicht verifiziert**. Evidenzstärke: mittel (Querschnitt). Leistungsdaten für Läufer liefert die Arbeit nicht.
- **Lange Arbeitszeiten – Virtanen et al. 2009** (Sleep 32(6):737–745, Whitehall II): Mehr als 55 Wochenstunden gingen gegenüber 35 bis 40 Stunden mit verkürztem Schlaf einher (OR 1,98; 1,05–3,76) und mit Einschlafproblemen (OR 3,68; 1,58–8,58). Bei wiederholt langen Zeiten stiegen die Werte auf 3,24 und 6,66. Evidenzstärke: mittel bis stark (prospektive Kohorte, aber Büroangestellte mittleren Alters).
- **Berufliche Bewegung – Holtermann et al. 2018** (Br J Sports Med 52(3):149): Das „physical activity paradox“ nennt sechs Gründe, warum körperliche Arbeit nicht wie Training wirkt: zu geringe Intensität bei zu langer Dauer, ganztägig erhöhte Herzfrequenz, erhöhter Blutdruck, zu wenig Erholung, wenig Kontrolle über Tempo und Pausen, Entzündung. Es ist ein Meinungsbeitrag auf Basis epidemiologischer Daten zu Herz-Kreislauf-Risiken, nicht zu Laufleistung. Evidenzstärke: Expertenmeinung.
- **Schrittzahl von Servicekräften:** Eine belastbare, begutachtete Zahl habe ich nicht gefunden. Eine vom American Council on Exercise beauftragte Pedometer-Studie (98 Personen, 10 Berufe, drei Arbeitstage) nennt 4327 Schritte für Sekretariatskräfte und 18 904 für Briefträger; Restaurantbedienungen waren dabei, ihr Wert stand auf der abgerufenen Seite aber nicht. Die Spanne „10 000 bis 20 000 pro Schicht“ ist damit **nicht belegt** und sollte nicht als Fakt verwendet werden. Evidenzstärke: schwach.
- **Reisen – Janse van Rensburg et al. 2021** (Sports Medicine 51(10):2029–2050): Konsens von 26 Fachleuten mit Werkzeugkästen für vor, während und nach dem Flug. Die Autoren schreiben selbst, dass der Mangel an Evidenz die Stärke der Empfehlungen begrenzt. Evidenzstärke: Expertenmeinung.
- **Akuter Schlafmangel und Leistung – Craven et al. 2022** (Sports Medicine, Meta-Analyse): 69 Arbeiten, 959 Personen (89 % Männer). Die Leistung sank im Mittel um 7,56 % (95 %-KI −11,9 bis −3,13), bei extremer Heterogenität (I² = 98 %). Schlafentzug und frühes Aufstehen wirkten durchgängig negativ, spätes Zubettgehen nicht durchgängig. Je Stunde Wachzeit vor der Belastung ging etwa 0,4 % verloren; betroffen waren vor allem Belastungen am Nachmittag und Abend, kaum am Morgen. Evidenzstärke: mittel. Für MyRace wichtig: Nach einer kurzen Nacht ist die Abendeinheit das Problem, weniger der Morgenlauf. **Milewski et al. 2014**: Jugendliche Sportler mit weniger als 8 Stunden Schlaf hatten ein etwa 1,7-fach höheres Verletzungsrisiko (Zahl aus dem Suchtreffer, Abstract **nicht verifiziert**).

---

### 3. „Lebensbelastung“ aus Kalenderdaten

#### 3.1 Was es gibt

- **StudentLife – Wang et al. 2014** (UbiComp): 48 Studierende in Dartmouth, 10 Wochen, Smartphone-Sensorik. Die Zahl der Abgabefristen pro Tag wurde erfasst und gegen Schlaf, Aktivität, Gespräche und Vorlesungsbesuch aufgetragen. Sensormerkmale korrelierten mit Depressivität, Einsamkeit und Noten. Das ist der beste Beleg dafür, dass Termindruck im Semesterverlauf mit Verhalten zusammenhängt. Genaue Korrelationswerte konnte ich nicht abrufen. Evidenzstärke: schwach bis mittel (n = 48, eine Hochschule).
- **SNAPSHOT – Sano 2016** (Dissertation, MIT): 168 Studierende, je 30 Tage. Unregelmäßiger Schlaf hing stärker mit schlechterem Befinden zusammen als die Schlafdauer. Kalenderdaten werden auf der Übersichtsseite nicht als Messgröße genannt.
- **Microsoft 2021** (Work Trend Index, Human Factors Lab): 14 Personen mit EEG, vier halbstündige Besprechungen am Stück gegenüber denselben Besprechungen mit je 10 Minuten Pause. Ohne Pausen stieg die Beta-Aktivität über zwei Stunden an. Es ist ein Firmenbericht ohne Begutachtung. Evidenzstärke: schwach.
- **Tesserae** (Sensorik bei Wissensarbeitern) und **NetHealth** (Fitbit bei Studierenden in Notre Dame): Existenz bestätigt; ob Kalenderdaten ausgewertet wurden, **nicht verifiziert**.
- **Arbeit und Erholung:** Das Effort-Recovery-Modell (**Meijman & Mulder 1998**, Handbuchkapitel) und die Übersicht von **Geurts & Sonnentag 2006** (Scand J Work Environ Health 32(6):482–492) begründen theoretisch, dass Belastung ohne ausreichende Erholungszeit kumuliert. **Wendsche & Lohmann-Haislah 2017** (Frontiers in Psychology 7:2072; 91 Stichproben, N = 38 124) fanden: Mehr Arbeitszeit geht mit schlechterem Abschalten einher (r = −0,17), Zeitdruck ebenso (r = −0,28). Abschalten hängt mit weniger Müdigkeit (r = −0,42) und besserem Schlaf (r = 0,30) zusammen. Evidenzstärke: mittel bis stark für die Zusammenhänge, überwiegend Querschnitt.

#### 3.2 Was belegt ist und was nicht

| Aussage | Status |
|---|---|
| Spätes Arbeitsende mit frühem Beginn am Folgetag verkürzt den Schlaf | belegt (mittel) |
| Lange Arbeitstage und -wochen gehen mit schlechterem Schlaf und schlechterem Abschalten einher | belegt (mittel bis stark, kleine Zusammenhänge) |
| Prüfungsphasen verändern Schlaf, HRV und Verletzungsrisiko | belegt (schwach bis mittel) |
| Termindichte laut Kalender sagt Stress, HRV oder Erholung einzelner Personen vorher | **nicht belegt**; keine Validierungsstudie gefunden |
| Feste Gewichte je Terminart (z. B. „Vorlesung = 2 Punkte“) | **Heuristik**, keine Quelle |

Zusätzliche Grenze: Der Kalender zeigt nur, was eingetragen ist. Kellnerschichten, Lernzeit und private Belastungen stehen oft nicht darin. Ein leerer Kalender bedeutet nicht „erholt“.

---

### 4. Kalender-Lernen ohne KI

Zur Erkennung wiederkehrender Terminarten in Kalendern habe ich keine eigene Forschungsliteratur gefunden. Die Bausteine stammen aus dem Information Retrieval und sind dort gut etabliert.

- **Normalisierung** (Heuristik auf etablierter Technik): Kleinschreibung; Umlaute und ß vereinheitlichen; Satzzeichen, Bindestriche und Leerzeichen entfernen; Ziffern, Datums- und Raumangaben entfernen. Für den Vergleich zusätzlich eine Fassung ganz ohne Leerzeichen bilden. Dann ergeben „Sprint Prüfung“, „Sprint-Prüfung“ und „Sprintprüfung“ denselben Schlüssel, ohne dass man Komposita zerlegen muss.
- **Stemming und Kompositazerlegung:** **Braschler & Ripplinger 2004** (Information Retrieval) untersuchten beides für deutsche Textsuche; **Koehn & Knight 2003** (EACL) beschreiben häufigkeitsbasierte Kompositazerlegung. Beide Arbeiten existieren; konkrete Zahlen **nicht verifiziert**. Für kurze Kalendertitel reicht meist die leerzeichenfreie Fassung plus Zeichen-Trigramme; ein Wörterbuch auf dem Gerät ist nicht nötig.
- **Ähnlichkeit:** Jaccard auf Zeichen-Trigrammen ist robust gegen Tippfehler und Wortreihenfolge; Levenshtein eignet sich für sehr kurze Titel. Schwellenwerte (etwa Jaccard ≥ 0,6) sind Heuristik und sollten an echten Kalendern justiert werden.
- **Clustering:** Titel-Schlüssel als Hauptmerkmal, dazu Wochentag, Startzeit (in Stundenfenstern), Dauer und die Wiederholungsregel aus EventKit. Eine Serie mit Wiederholungsregel ist bereits ein fertiger Cluster. Einfaches agglomeratives Zusammenfassen mit festen Schwellen ist deterministisch und nachvollziehbar.
- **Rückfragen (Active Learning):** **Settles 2009** (Übersicht, University of Wisconsin) beschreibt Uncertainty Sampling und dichtegewichtete Varianten: Man fragt dort, wo das Modell unsicher ist und die Antwort viele Fälle betrifft. Übertragen auf MyRace: Priorität = Häufigkeit in den nächsten vier Wochen × Unsicherheit der Zuordnung × Dauer bzw. Nähe zu Schlüsseleinheiten. Diese Formel ist Heuristik.
- **Rückfrage-Müdigkeit:** Eine feste Obergrenze aus der Literatur gibt es nicht. Hinweise: In Studien mit wiederholten Kurzbefragungen liegt die Antwortquote im Mittel bei etwa 79 % (Meta-Analysen von **Wrzus & Neubauer 2023** und **Ottenstein & Werner 2022**; Zahl aus einer Sekundärquelle, **nicht verifiziert**). **Eisele et al. 2022** (Assessment 29(2):136–151) teilten 163 Studierende für 14 Tage auf 30 oder 60 Fragen und 3, 6 oder 9 Abfragen pro Tag auf: Längere Fragebögen erhöhten die Belastung und verschlechterten Datenmenge und -qualität, häufigere Abfragen nicht. Kurz ist also wichtiger als selten. Im **HeartSteps**-Versuch (**Klasnja et al. 2019**) ließ die Wirkung von Vorschlägen im Studienverlauf nach (Zahlen **nicht verifiziert**). Daraus folgt als Heuristik: höchstens eine Rückfrage pro Tag und drei pro Woche, jeweils mit einem Tipp beantwortbar, und nie als Push-Nachricht mitten am Tag.

---

### 5. Lernen aus der Reaktion am Folgetag (N-of-1)

#### 5.1 Methodische Probleme

- **Beobachtung statt Experiment:** **Daza 2019** (arXiv 1901.03423) behandelt selbst erhobene Daten einer Person als Längsschnittstudie und zeigt, dass Auswertungen ohne Berücksichtigung von Störgrößen andere Ergebnisse liefern. Schichttage sind zugleich Tage mit weniger Schlaf, anderem Training, späterem Essen und oft Alkohol. Der „Effekt der Spätschicht“ ist deshalb immer ein Paket.
- **Autokorrelation:** HRV und Schlaf hängen von den Vortagen ab. Bei einer Tag-zu-Tag-Korrelation ρ schrumpft die wirksame Stichprobe etwa um den Faktor (1 − ρ)/(1 + ρ). Bei ρ = 0,3 zählen 20 Tage nur wie etwa 11 (eigene Rechnung nach der Standardformel für AR(1)-Prozesse).
- **Regression zur Mitte:** Nach einem besonders guten Tag folgt im Mittel ein schlechterer, ganz ohne Ursache. Vergleiche sollten deshalb gegen den gleitenden persönlichen Ausgangswert laufen, nicht gegen den Vortag.
- **Multiple Vergleiche:** 15 Terminarten × 4 Marker ergeben 60 Tests; bei 5 % Irrtumsniveau sind drei Zufallstreffer zu erwarten. Das Verfahren von Benjamini und Hochberg (1995) begrenzt den Anteil falscher Entdeckungen (Standardreferenz, in dieser Recherche nicht eigens abgerufen).

#### 5.2 Wie viele Beobachtungen braucht man?

Eigene Power-Rechnung (Zwei-Gruppen-Vergleich, zweiseitig 5 %, 80 % Power, unabhängige Tage):

| Tage je Gruppe | kleinster sicher erkennbarer Effekt (d) |
|---|---|
| 5 | etwa 2,0 |
| 10 | etwa 1,3 |
| 17 | etwa 1,0 |
| 26 | etwa 0,8 |
| 64 | etwa 0,5 |

Mit Autokorrelation werden die Anforderungen höher. Die verbreitete Schwelle „5 Ja, 5 Nein“ findet also nur sehr große Effekte verlässlich; mittlere Effekte (d = 0,5 bis 0,8) brauchen 26 bis 64 Tage je Gruppe. Eine Faustregel „8 bis 10 je Gruppe“ ist als Anzeige-Schwelle vertretbar, aber nicht als Nachweis.

#### 5.3 Robuste Schätzung

- **Effektmaß:** Median-Differenz der Abweichung vom persönlichen 28-Tage-Ausgangswert, mit Intervall aus Bootstrap oder Permutationstest. Bei Autokorrelation blockweise permutieren (ganze Wochen statt einzelner Tage).
- **Störgrößen:** Mindestens Schlafdauer der Nacht und Trainingslast des Vortags herausrechnen (Schichtung oder Regression). Getrennt ausweisen, welcher Anteil über kürzeren Schlaf läuft.
- **Schrumpfung:** Empirical-Bayes-Ansatz: geschätzter Effekt = Gewicht × persönlicher Effekt + (1 − Gewicht) × Ausgangsannahme, mit Gewicht = n / (n + k). Solange es keine Nutzerbasis gibt, ist die Ausgangsannahme null oder ein vorsichtiger Literaturwert. Das Prinzip ist statistischer Standard; die Wahl von k (etwa 10 bis 20) ist Heuristik.

#### 5.4 Wie formulieren es seriöse Produkte?

- **Whoop:** Eine Verhaltensweise erscheint erst, wenn innerhalb von 90 Tagen mindestens 5 Ja- und 5 Nein-Einträge vorliegen (Whoop-Blog, bestätigt). Die Monatsauswertung nutzt Daten aus bis zu einem Jahr und gibt an, andere Verhaltensweisen, Schlaf und Training zu berücksichtigen; das Verfahren wird nicht offengelegt.
- **Oura:** „Discoveries“ verlangen, dass ein Tag typischerweise 5- bis 40-mal verwendet wurde, und mindestens 14 Tage und Nächte Daten in den letzten 30 Tagen. Oura schreibt ausdrücklich, dass Korrelation keine Kausalität bedeutet und nicht erfasste Einflüsse unberücksichtigt bleiben.
- **Bearable:** Es gibt einen Auswertungsbericht zu Einflussfaktoren und eine Hilfeseite zu unplausiblen Korrelationen; Mindestmengen **nicht verifiziert**. Zu Gyroscope habe ich nichts Belastbares gefunden.

---

### 6. Vorausschauende Planung

- **Kellmann et al. 2018** (IJSPP, Konsens „Recovery and Performance in Sport“): Untererholung entsteht auch durch allgemeinen Stress außerhalb des Sports; Alltagsanforderungen können sich mit Trainingsbelastung summieren. Erholung soll individuell geplant und mit mehreren Messgrößen beobachtet werden; subjektive Maße gelten als empfindlich und praktikabel. Schlaf spielt laut Papier eine wesentliche Rolle. Eine konkrete Regel „keine harte Einheit am Prüfungstag“ steht dort nicht. Evidenzstärke: Expertenmeinung. Band, Seiten und DOI **nicht verifiziert**.
- **McEwen 1998** (NEJM, „Protective and damaging effects of stress mediators“): Konzept der allostatischen Last, also der kumulierten Kosten wiederholter Stressanpassung. Es ist ein physiologisches Rahmenmodell, keine Trainingsstudie. Evidenzstärke: Modell.
- **Trainingszeitpunkt – Stutz et al. 2019** (Sports Medicine, 23 Studien): Abendliches Training schadet dem Schlaf im Allgemeinen nicht; der Tiefschlafanteil lag sogar etwas höher (21,2 % gegenüber 19,9 %). Nur intensives Training, das weniger als eine Stunde vor dem Zubettgehen endet, könnte das Einschlafen verzögern – gestützt auf eine einzige Studie. **Frimpong et al. 2021** (Sleep Medicine Reviews, 15 Studien): Hochintensives Training, das mindestens etwa zwei Stunden vor dem Schlafen endet, war eher günstig; bei weniger als zwei Stunden dauerte das Einschlafen länger und der Schlaf war kürzer (Angaben aus der Pressemitteilung, Effektgrößen dort nicht genannt). Evidenzstärke: mittel.
- **Folgerung:** Die Regel „harte Einheiten nicht auf Tage mit hoher kognitiver oder emotionaler Last und nicht nach kurzem Schlaf“ ist gut begründete Expertenempfehlung, kein Studienergebnis. Der Puffer „harte Einheit endet mindestens zwei Stunden vor dem Schlafen“ hat mittlere Evidenz.

---

### 7. Ehrliche Bewertung

**Was trägt**

- Zeit- und Schlaffenster: Wann endet der letzte Termin, wann beginnt der erste am Folgetag, wie viel Schlafgelegenheit bleibt, passt eine Einheit überhaupt hinein. Das ist Rechnen, keine Deutung, und am besten belegt.
- Bekannte Stressoren mit Etikett: Prüfungen und Abgaben, Nachtarbeit, Reisen über Zeitzonen.
- Kumulierte Dauer: sehr lange gebundene Tage und Wochen.
- Persönlich gelernte Effekte, wenn genug Daten vorliegen und vorsichtig formuliert wird.

**Was nicht trägt**

- Generische Stress-Punkte pro Termin ohne Wissen über die Art des Termins.
- Die Behauptung, Kalenderanpassung verbessere nachweislich die Leistung oder senke Verletzungen. Dafür gibt es keinen Versuch.
- Schlüsse aus leeren Kalendern.
- Persönliche Einsichten aus fünf bis zehn Beobachtungen als Tatsache.

**Besserer, ergänzender Weg**

Ein täglicher Ein-Item-Check-in („Wie belastet fühlst du dich heute?“, eine Tippgeste) als Grundwahrheit, ergänzt um Schlafdauer aus HealthKit. Der Kalender liefert die Vorausschau, die ein Check-in nicht leisten kann, und die Erklärung („gestern Schicht bis 1 Uhr“). Subjektive Maße werden im Erholungskonsens ausdrücklich als empfindlich und praktikabel bewertet (Kellmann et al. 2018). Einschränkung: Auch Einzelfragen sind nur begrenzt validiert; die Stressfrage bei Ruuska et al. 2012 war ein unveröffentlichtes Einzelitem.

---

### 8. Was für MyRace folgt

#### 8.1 Merkmale aus Terminen (deterministisch, ohne Titel-Inhalt zu deuten)

1. **Schlafgelegenheit:** Zeit zwischen Ende des letzten Termins (plus Heimweg-Puffer) und Beginn des ersten Termins am Folgetag (minus Morgen-Puffer).
2. **Kurze Ruhezeit:** weniger als 11 Stunden zwischen Terminende und nächstem Terminbeginn (Definition nach Vedaa et al. 2015).
3. **Spätes Ende:** letzter Termin endet nach 22 Uhr bzw. nach Mitternacht.
4. **Gebundene Stunden:** Summe der Termindauer pro Tag und als gleitende 7-Tage-Summe.
5. **Verschiebung:** Abweichung von Terminende und -beginn gegenüber dem persönlichen Median der letzten vier Wochen (Näherung für sozialen Jetlag).
6. **Trainingsfenster:** größte freie Lücke am Tag und ihr Abstand zur Schlafenszeit.
7. **Etikettierte Terminarten** (nur nach Nutzer-Label je Cluster): Prüfung/Abgabe, Schicht mit körperlicher Arbeit, Reise, Sonstiges.

#### 8.2 Startgewichte – ausdrücklich Heuristik

Keines dieser Gewichte stammt aus einer Studie. Sie setzen nur die Rangfolge der Evidenz um (Schlaf > etikettierte Stressoren > Dauer) und müssen in Code und Dokumentation als Heuristik gekennzeichnet sein.

| Merkmal | Vorschlag | Begründung |
|---|---|---|
| Schlafgelegenheit < 6 h | harte Einheit am Folgetag verschieben oder entschärfen | Schlafverkürzung bei kurzen Ruhezeiten belegt; Schwelle Heuristik |
| Schlafgelegenheit 6–7 h | Hinweis, keine automatische Änderung | Heuristik |
| Ruhezeit < 11 h | wie oben, zusätzlich Kennzeichnung | Definition aus der Schichtforschung |
| Prüfung am Tag oder Folgetag | keine Schlüsseleinheit am Tag davor und am Tag selbst; lockerer Lauf bleibt | Expertenempfehlung; Mann et al. 2016 als Hintergrund |
| Prüfungsphase (≥ 2 Prüfungen in 7 Tagen) | Wochenumfang leicht senken (Größenordnung 10–20 %) | reine Heuristik |
| Körperliche Schicht ≥ 6 h | nicht als Training zählen; harte Einheit nicht direkt danach | Holtermann et al. 2018, Expertenmeinung |
| Gebundene Stunden > 10 h am Tag | Einheit kürzen oder verschieben anbieten | Heuristik auf Basis der Arbeitszeitforschung |
| Harte Einheit endet < 2 h vor Schlafenszeit | früheren Zeitpunkt vorschlagen | Frimpong et al. 2021, Stutz et al. 2019 |
| Reise über ≥ 3 Zeitzonen | zwei bis drei lockere Tage | Expertenmeinung; Schwelle Heuristik |

Grundsatz: Die App schlägt vor und erklärt; sie verschiebt nicht stillschweigend. Unetikettierte Termine wirken nur über Zeit und Dauer, nie über einen angenommenen Stressgehalt.

#### 8.3 Statistik-Regeln für persönliche Einsichten

1. **Anzeige erst ab** mindestens 10 Tagen mit und 10 Tagen ohne die Terminart innerhalb von 120 Tagen. Darunter: „Noch zu wenig Daten“.
2. **Vergleichsgröße:** Abweichung vom gleitenden 28-Tage-Median der Person, nie der Rohwert und nie der Vortag.
3. **Effektmaß:** Median-Differenz mit 90-%-Intervall aus blockweisem Bootstrap; Anzeige nur, wenn das Intervall null ausschließt **und** der Effekt eine praktisch relevante Mindestgröße überschreitet (Vorschlag: mindestens halbe typische Tagesschwankung der Person).
4. **Störgrößen:** Schlafdauer und Trainingslast des Vortags herausrechnen; wenn der Effekt danach verschwindet, lautet die Einsicht „läuft über kürzeren Schlaf“.
5. **Mehrfachtests:** Benjamini-Hochberg über alle gleichzeitig geprüften Paare, Zielquote 10 %. Höchstens vier Marker (Schlafdauer, nächtliche HRV, Ruhepuls, Befinden).
6. **Schrumpfung:** Gewicht n / (n + 15) auf den persönlichen Effekt, Rest auf null.
7. **Wirkung auf den Plan:** Ein gelernter Effekt darf Vorschläge höchstens so stark verändern wie die Startheuristik für eine Prüfung. Er verfällt, wenn er 90 Tage lang nicht bestätigt wird.
8. **Sprache:** „An Tagen nach einer Spätschicht war deine HRV bisher im Mittel niedriger (12 von 14 Fällen). Das ist ein Zusammenhang, kein Beweis – ein Teil erklärt sich durch kürzeren Schlaf.“ Nie „Spätschichten senken deine HRV um X“.

#### 8.4 Rückfragen

- Höchstens eine pro Tag und drei pro Woche, nur in der App, mit einem Tipp beantwortbar.
- Reihenfolge: Serien mit Wiederholungsregel zuerst, dann Häufigkeit × Dauer × Nähe zu Schlüsseleinheiten.
- Ein Label gilt für den ganzen Cluster; „Nicht mehr fragen“ ist immer verfügbar.
- Titel bleiben auf dem Gerät; gespeichert wird nur der normalisierte Schlüssel und das Label.

#### 8.5 Was man nicht versprechen sollte

- Keine Aussage wie „wissenschaftlich belegt: Kalender verbessert dein Training“.
- Ehrlich wäre: „MyRace plant um deinen Alltag herum und schützt deinen Schlaf – das ist der am besten belegte Teil der Erholung.“

---

### 9. Offene Punkte und Widersprüche

- Die großen Stress-Erholungs-Effekte stammen aus einer einzigen Stichprobe von 31 Personen und betreffen Krafttraining.
- Mentale Ermüdung: Meta-Analysen widersprechen sich (g = −0,38 gegenüber bereinigt etwa null).
- Prüfungsphasen und HRV: kleine, teils gegenläufige Effekte.
- Unfall- und Verletzungsrisiko nach kurzen Ruhezeiten: widersprüchlich in der Übersicht von 2015; die Registerstudie von 2020 konnte ich nicht einsehen.
- Schrittzahlen von Servicekräften: keine belastbare Quelle.
- Nicht abrufbar und daher nur dem Titel nach bestätigt: Ivarsson (Original), Vedaa 2020, Milewski 2014, Wrzus & Neubauer 2023, Klasnja 2019, Koehn & Knight 2003, Braschler & Ripplinger 2004, Tesserae, NetHealth.
- Nicht gesucht bzw. nicht gefunden: Cohen 1991 (Erkältung), Williams & Andersen 1998 (Original), Benjamini & Hochberg 1995 (Original), „Lehrer“.

---

### 10. Quellen

Angaben, die ich nicht an einer abgerufenen Seite prüfen konnte, sind gekennzeichnet.

**Stress, Erholung, Anpassung**

- Stults-Kolehmainen MA, Bartholomew JB (2012). Psychological stress impairs short-term muscular recovery from resistance exercise. Med Sci Sports Exerc 44(11):2220–2227. DOI nicht verifiziert. https://pubmed.ncbi.nlm.nih.gov/22688829/
- Stults-Kolehmainen MA, Bartholomew JB, Sinha R (2014). Chronic psychological stress impairs recovery of muscular function and somatic sensations over a 96-hour period. J Strength Cond Res 28(7):2007–2017. https://doi.org/10.1519/JSC.0000000000000335
- Bartholomew JB, Stults-Kolehmainen MA, Elrod CC, Todd JS (2008). Strength gains after resistance training: the effect of stressful, negative life events. J Strength Cond Res 22(4):1215–1221. https://doi.org/10.1519/JSC.0b013e318173d0bf
- Ruuska PS, Hautala AJ, Kiviniemi AM, Mäkikallio TH, Tulppo MP (2012). Self-rated mental stress and exercise training response in healthy subjects. Front Physiol 3:51. https://doi.org/10.3389/fphys.2012.00051
- Mann JB, Bryant KR, Johnstone B, Ivey PA, Sayers SP (2016). Effect of physical and academic stress on illness and injury in Division 1 college football players. J Strength Cond Res 30(1):20–25. https://doi.org/10.1519/JSC.0000000000001055 (Autorenliste nicht verifiziert)
- Otter RTA, Brink MS, Diercks RL, Lemmink KAPM (2016). A negative life event impairs psychosocial stress, recovery and running economy of runners. Int J Sports Med 37(3):224–229. https://doi.org/10.1055/s-0035-1555932
- Ivarsson A, Johnson U, Andersen MB, Tranaeus U, Stenling A, Lindwall M (2017; online 2016). Psychosocial factors and sport injuries: meta-analyses for prediction and prevention. Sports Med 47(2):353–365. https://doi.org/10.1007/s40279-016-0578-x (Zahlen über Sekundärquelle; Band nicht verifiziert)
- Sekundärquelle zu Ivarsson und zum Modell von Williams & Andersen: Übersichtsarbeit „Psychosocial predictors and psychological prevention of soccer injuries: a systematic review and meta-analysis of the literature“, Fassung im Repositorium der Liverpool John Moores University. https://researchonline.ljmu.ac.uk/id/eprint/8642/ (Autoren und Journal nicht verifiziert)
- Laux P, Krumm B, Diers M, Flor H (2015). Recovery-stress balance and injury risk in professional football players: a prospective study. J Sports Sci 33(20):2140–2148. https://doi.org/10.1080/02640414.2015.1064538 (Autorenliste nicht verifiziert)
- Granero-Gallegos A, González-Quílez A, Plews D, Carrasco-Poyatos M (2020). HRV-based training for improving VO2max in endurance athletes. A systematic review with meta-analysis. Int J Environ Res Public Health 17:7999. https://doi.org/10.3390/ijerph17217999

**Mentale Ermüdung**

- Marcora SM, Staiano W, Manning V (2009). Mental fatigue impairs physical performance in humans. J Appl Physiol 106(3):857–864. https://doi.org/10.1152/japplphysiol.91324.2008 (Band und Seiten nicht verifiziert)
- Van Cutsem J, Marcora S, De Pauw K, Bailey S, Meeusen R, Roelands B (2017). The effects of mental fatigue on physical performance: a systematic review. Sports Med 47(8):1569–1588. https://doi.org/10.1007/s40279-016-0672-0
- Brown DMY, Graham JD, Innes KI, Harris S, Flemington A, Bray SR (2020). Effects of prior cognitive exertion on physical performance: a systematic review and meta-analysis. Sports Med 50:497–529. https://doi.org/10.1007/s40279-019-01204-8
- Holgado D, Sanabria D, Perales JC, Vadillo MA (2020). Mental fatigue might be not so bad for exercise performance after all: a systematic review and bias-sensitive meta-analysis. J Cogn 3(1):38. https://doi.org/10.5334/joc.126
- Holgado D, Troya E, Perales JC, Vadillo MA, Sanabria D. Does mental fatigue impair physical performance? A replication study. https://pubmed.ncbi.nlm.nih.gov/32519588/ (Jahr, Journal, Ergebnis nicht verifiziert)

**Prüfungsstress, Immunfunktion**

- Marucha PT, Kiecolt-Glaser JK, Favagehi M (1998). Mucosal wound healing is impaired by examination stress. Psychosom Med. Band/Seiten/DOI nicht verifiziert. Pressemitteilung: https://news.osu.edu/stress-slows-healing-of-dental-wounds-by-40-percent/
- Neigel P, Vargo A, Tag B, Kise K (2024). Identifying periods of cyclical stress in university students using wearables in-the-wild. arXiv:2402.11823. https://arxiv.org/abs/2402.11823
- o. A. (2025). The effect of examination stress on students' nocturnal sleep metrics studied with custom ECG holter and accelerometer. Bd. 125, Nr. 7, S. 122–129, Media Sphera. https://repository.rudn.ru/en/records/article/record/174978 (Autoren, Journal, DOI nicht verifiziert)
- Glaser R, Rabin B, Chesney M, Cohen S, Natelson B (1999). Stress-induced immunomodulation: implications for infectious diseases? JAMA. https://www.cmu.edu/dietrich/psychology/stress-immunity-disease-lab/publications/stresssocial/pdfs/glaserrabin99.pdf (bibliografische Angaben nicht verifiziert)

**Schicht, Schlaf, Arbeit, Reisen**

- Vedaa Ø, Harris A, Bjorvatn B, Waage S, Sivertsen B, Tucker P, Pallesen S (2015/2016). Systematic review of the relationship between quick returns in rotating shift work and health-related outcomes. Ergonomics. https://doi.org/10.1080/00140139.2015.1052020
- Vedaa Ø et al. (2020). Short rest between shifts (quick returns) and night work is associated with work-related accidents. https://hdl.handle.net/1956/22082 (Journal, Zahlen nicht verifiziert; Seite nicht abrufbar)
- Wittmann M, Dinich J, Merrow M, Roenneberg T (2006). Social jetlag: misalignment of biological and social time. Chronobiol Int. https://pubmed.ncbi.nlm.nih.gov/16687322/ (Band, Seiten, DOI nicht verifiziert)
- Virtanen M, Ferrie JE, Gimeno D, Vahtera J, Elovainio M, Singh-Manoux A et al. (2009). Long working hours and sleep disturbances: the Whitehall II prospective cohort study. Sleep 32(6):737–745. https://doi.org/10.1093/sleep/32.6.737
- Holtermann A, Krause N, van der Beek AJ, Straker L (2018). The physical activity paradox: six reasons why occupational physical activity (OPA) does not confer the cardiovascular health benefits that leisure time physical activity does. Br J Sports Med 52(3):149–150. DOI nicht verifiziert.
- American Council on Exercise / Porcari J, Akhwan R (2006/2007). On-the-job physical activity of 10 common occupations (Pressemitteilung, nicht begutachtet). https://www.acefitness.org/about-ace/press-room/press-releases/363/
- Janse van Rensburg DC, Jansen van Rensburg A, Fowler PM et al. (2021). Managing travel fatigue and jet lag in athletes: a review and consensus statement. Sports Med 51(10):2029–2050. https://doi.org/10.1007/s40279-021-01502-0
- Craven J, McCartney D, Desbrow B, Sabapathy S, Bellinger P, Roberts L, Irwin C (2022). Effects of acute sleep loss on physical performance: a systematic and meta-analytical review. Sports Med (Heft November 2022). https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9584849/ (Band, Seiten, DOI nicht verifiziert)
- Milewski MD et al. (2014). Chronic lack of sleep is associated with increased sports injuries in adolescent athletes. J Pediatr Orthop. https://pubmed.ncbi.nlm.nih.gov/25028798/ (Details nicht verifiziert)
- Stutz J, Eiholzer R, Spengler CM (2019). Effects of evening exercise on sleep in healthy participants: a systematic review and meta-analysis. Sports Med 49(2):269–287. https://doi.org/10.1007/s40279-018-1015-0 (Band und Seiten nicht verifiziert)
- Frimpong E, Mograss M, Zvionow T, Dang-Vu TT (2021). The effects of evening high-intensity exercise on sleep in healthy adults: a systematic review and meta-analysis. Sleep Med Rev 60:101535. https://doi.org/10.1016/j.smrv.2021.101535 (Autorenliste nicht verifiziert)

**Kalender, Sensorik, Arbeit und Erholung**

- Wang R, Chen F, Chen Z, Li T, Harari G, Tignor S, Zhou X, Ben-Zeev D, Campbell AT (2014). StudentLife: assessing mental health, academic performance and behavioral trends of college students using smartphones. Proc. UbiComp 2014. https://doi.org/10.1145/2632048.2632054 (Autorenliste nicht verifiziert)
- Sano A (2016). Measuring college students' sleep, stress, mental health and wellbeing with wearable sensors and mobile phones. Dissertation, MIT. http://hdl.handle.net/1721.1/106066
- Microsoft WorkLab (2021). Research proves your brain needs breaks. Work Trend Index Special Report, 20.04.2021. https://www.microsoft.com/en-us/worklab/work-trend-index/brain-research
- Mattingly SM et al. (2019). The Tesserae project: large-scale, longitudinal, in situ, multimodal sensing of information workers. CHI EA 2019. (Details nicht verifiziert)
- Meijman TF, Mulder G (1998). Psychological aspects of workload. In: A Handbook of Work and Organizational Psychology, Vol. 2. Psychology Press. https://www.taylorfrancis.com/chapters/edit/10.4324/9780203765425-2/
- Geurts SAE, Sonnentag S (2006). Recovery as an explanatory mechanism in the relation between acute stress reactions and chronic health impairment. Scand J Work Environ Health 32(6):482–492. https://www.sjweh.fi/article/1053
- Wendsche J, Lohmann-Haislah A (2017). A meta-analysis on antecedents and outcomes of detachment from work. Front Psychol 7:2072. https://doi.org/10.3389/fpsyg.2016.02072
- Kellmann M, Bertollo M, Bosquet L et al. (2018). Recovery and performance in sport: consensus statement. Int J Sports Physiol Perform 13(2):240–245. https://pubmed.ncbi.nlm.nih.gov/29345524/ (Band, Seiten, DOI nicht verifiziert)
- McEwen BS (1998). Protective and damaging effects of stress mediators. N Engl J Med 338(3):171–179. https://pubmed.ncbi.nlm.nih.gov/9428819/ (Band und Seiten nicht verifiziert)

**Verfahren, Statistik, Produkte**

- Settles B (2009). Active learning literature survey. Computer Sciences Technical Report 1648, University of Wisconsin–Madison. https://research.cs.wisc.edu/techreports/2009/TR1648.pdf
- Koehn P, Knight K (2003). Empirical methods for compound splitting. Proc. EACL 2003. https://arxiv.org/abs/cs/0302032 (Inhalt nicht verifiziert)
- Braschler M, Ripplinger B (2004). How effective is stemming and decompounding for German text retrieval? Information Retrieval 7:291–316. (Band, Seiten, Inhalt nicht verifiziert)
- Daza EJ (2019). Person as population: a longitudinal view of single-subject causal inference for analyzing self-tracked health data. arXiv:1901.03423. https://arxiv.org/abs/1901.03423
- Wrzus C, Neubauer AB (2023). Ecological momentary assessment: a meta-analysis on designs, samples, and compliance across research fields. Assessment. (Details nicht verifiziert)
- Ottenstein C, Werner L (2022). Compliance in ambulatory assessment studies: investigating study and sample characteristics as predictors. Assessment. https://pubmed.ncbi.nlm.nih.gov/34282659/ (Details nicht verifiziert)
- Eisele G, Vachon H, Lafit G, Kuppens P, Houben M, Myin-Germeys I, Viechtbauer W (2022). The effects of sampling frequency and questionnaire length on perceived burden, compliance, and careless responding in experience sampling data in a student population. Assessment 29(2):136–151. https://doi.org/10.1177/1073191120957102
- Klasnja P et al. (2019). Efficacy of contextually tailored suggestions for physical activity: a micro-randomized optimization trial of HeartSteps. Ann Behav Med. https://pubmed.ncbi.nlm.nih.gov/30192907/ (Details nicht verifiziert)
- WHOOP. A guide to self-experimentation: optimizing your habits for performance. https://www.whoop.com/us/en/thelocker/a-guide-to-self-experimentation-optimizing-your-habits-for-performance/
- WHOOP. Monthly Performance Assessment now features enhanced recovery analysis. https://whoop.com/eu/en/thelocker/monthly-performance-assessment-now-features-enhanced-recovery-analysis
- Oura. Discoveries (Blog). https://ouraring.com/blog/discoveries/
- Bearable. The Factor Effect Report. https://bearable.app/support/howto/the-factor-effect-report/ (Inhalt nicht abgerufen)

---

## B6 – Modell und Daten: Kombination der Marker, Personalisierung, Datensätze, Unsicherheit, Validierung


Stand: 11.11.2026. Recherche per Websuche und Abruf von Primärquellen bzw. Repositorien. Evidenzstärke in Klammern: **stark** (Meta-Analyse, große Kohorte, mehrfach repliziert), **mittel** (einzelne gute Studien), **schwach** (kleine Studien, Fallserien, indirekt), **Expertenmeinung** (Konsens, Review, Leitfaden). Wo ich Details nicht abrufen konnte, steht „nicht verifiziert“. Eigene Rechnungen sind als solche gekennzeichnet.

### Kurzfazit

1. Es gibt **keine peer-reviewte Validierung eines zusammengesetzten Readiness-Scores gegen Leistung**. Eine Übersicht über 14 Composite-Scores von 10 Herstellern fand keine offengelegten Formeln und kaum unabhängige Belege (Doherty et al., 2025; mittel).
2. Die Monitoring-Literatur empfiehlt übereinstimmend: mehrere Marker, individuell gegen die eigene Baseline, Änderung gegen Rauschen und kleinste relevante Änderung prüfen, Marker gemeinsam *interpretieren* – aber nennt keine validierte Gesamtformel (Thorpe et al., 2017; Coutts et al., 2022; Buchheit, 2014; Expertenmeinung).
3. Für kleine, lückenhafte Einzelreihen ist ein **additives, vorzeichenorientiertes Modell mit festen (Einheits-)Gewichten auf individualisierten z-Werten** plus ein einfaches Zustandsraummodell (lokales Niveau) die am besten begründbare Wahl. Geschätzte Gewichte schlagen Einheitsgewichte erst ab ca. 15–20 Beobachtungen pro Prädiktor (Dawes, 1979; mittel, fachfremd).
4. Offene Datensätze liefern Plausibilitätsgrenzen, Varianz-Priors und Testprofile, aber **keine Zielgröße**, an der man „Readiness“ trainieren könnte.
5. Anzeige: wenige verbale Stufen plus Band plus „Datenbasis“; die Zahl 0–100 nur nachrangig.

---

### 1. Kombinationsverfahren in Literatur und Praxis

**Was die Startquellen tatsächlich sagen**

- **Robertson, Bartlett & Gastin (2017)** beschreiben Ampelsysteme als weit verbreitet, aber uneinheitlich gebaut und kaum als Entscheidungshilfe abgesichert. Schwellen hängen stark von der Methode ab (SD, Effektgröße, SWC, CV, Risk Ratio liefern unterschiedliche Flags). Als Beispiel nennen sie Stufen in Vielfachen des Variationskoeffizienten (grün < 0,3×CV, gelb 0,3–0,9×CV, rot 0,9–1,6×CV). Sie plädieren für individuelle Schwellen, sparsame Datensätze und korrekte Modellierung wiederholter Messungen. Eine Gewichtungsformel für mehrere Indikatoren enthält der Text nicht (Expertenmeinung).
- **Thorpe et al. (2017)**: Entgegen der Annahme im Auftrag behandelt der Text **keine z-Scores** und nennt keine z-Schwelle. Er verlangt, eine Messung gegen die Zufallsschwankung (minimal detectable change) und gegen eine minimal relevante Änderung (MCID) zu lesen; als verteilungsbasierte MCID nennt er etwa 1 SEM bzw. > 0,2 SD. Empfohlen wird eine Kombination subjektiver und objektiver Maße, kurze Fragebögen (4–12 Items), HRV als Wochenmittel bzw. 7-Tage-Mittel. Ein Composite wird nicht vorgeschlagen. Der Zusammenhang der Ermüdungsmarker mit Leistung, Verletzung und Krankheit gilt als weitgehend ungeklärt (Expertenmeinung).
- **Coutts, Crowcroft & Kempton**: Auffindbar war die Fassung von **2022** (in Kellmann & Beckmann, *Recovery and Well-being in Sport and Exercise*); die 2018er Fassung habe ich nicht eingesehen. Inhalt: mehrdimensionales System (Last, Fitness-, Ermüdungsreaktion), kein Einzelkriterium. Änderung über Signal-Rausch-Verhältnis bewerten; ohne Outcome-Daten Schwellen als Bruchteil des CV (0,2; für indirekte Maße eher 0,5 oder 1×CV). Ampeln taugen als Gesprächsanlass („lead generator“), ihre Vorhersagegüte ist kaum geprüft. Heuristik: physiologische Verschiebung **plus** deutlich schlechteres Befinden unter hoher Last deutet auf schlechte Verträglichkeit; dieselbe Verschiebung ohne schlechtes Befinden eher auf Anpassung (Expertenmeinung).
- **Bourdon et al. (2017)** und **Kellmann et al. (2018)**: Beide Konsenspapiere sind bibliografisch bestätigt. Kellmann et al. fordern laut Abstract systematisches Erholungsmonitoring und betonen inter- und intraindividuelle Variabilität; konkrete Kombinationsregeln stehen dort nicht. Den Volltext von Bourdon et al. konnte ich nicht abrufen; **inhaltliche Aussagen dazu mache ich deshalb nicht** (nicht verifiziert).
- **Hopkins (2004)**: Änderung immer gegen typischen Fehler (Rauschen) und kleinste lohnende Änderung lesen; Standard für Tests ohne Leistungsbezug ist 0,2 der Zwischen-Personen-SD, für Wettkampfleistung 0,3 der typischen Variation. Rauschen ist oft größer als die SWC; dann sind Aussagen „unklar“ statt ja/nein zu treffen (Expertenmeinung, sehr verbreitet).
- **Buchheit (2014)**: typischer Fehler (CV) Ruhe-HF ca. 10 %, Ln rMSSD ca. 12 %; individuelle SWC ca. −2 % (Ruhe-HF) bzw. +3 % (vagale HRV). Zusammenhänge mit Leistung zeigten sich erst bei Mittelung über 3–4 Tage; vier Messungen halbieren das Rauschen. HF-Maße sollen mit Trainingslog, Befindlichkeitsfragen und Sprungtest kombiniert werden (Expertenmeinung/mittel).
- **Bellenger et al. (2023, AIS-Leitfaden)**: 7-Tage-Mittel (mindestens 3 Messungen), rollierender 60-Tage-Mittelwert als „typisch“, SWC = 0,5 × individueller CV um diesen Mittelwert. Gerätediagnosen wie „übermäßig ermüdet“ hätten kaum wissenschaftliche Stütze und sollten ignoriert werden (Expertenmeinung).
- **Saw, Main & Gastin (2016)**: Systematisches Review mit der Kernaussage im Titel, dass subjektive Selbstauskünfte gängige objektive Maße übertreffen. Studienzahl und Details habe ich nicht abgerufen (stark laut Reviewtyp; Details nicht verifiziert).

**Entscheidungsregeln HRV-geführter Studien**

Vesterinen et al. (2016; n = 40 Freizeitläufer): intensive Einheit nur, wenn die morgendliche HRV innerhalb der individuellen SWC lag, sonst locker. Ergebnis: weniger intensive Einheiten (13,2 vs. 17,7), 3000-m-Leistung +2,1 % vs. +1,1 %, Effekt zwischen Gruppen klein (0,42) (mittel). Meta-Analyse Manresa-Rocamora et al. (2021): Vorteil für vagale HRV (SMD 0,50; 95 %-KI 0,09–0,91), aber **nicht signifikant** für Ausdauerleistung (SMD 0,20; −0,09 bis 0,48) und maximale aerobe Kapazität (0,20; −0,07 bis 0,47) (stark für „Effekt ist höchstens klein“).

**Gibt es eine Validierung eines Composite-Scores gegen Leistung?**

Nein, soweit auffindbar. Doherty et al. (2025) prüften 14 Scores (u. a. Garmin Body Battery und Training Readiness, Oura Readiness, WHOOP Recovery, Polar Nightly Recharge): kein Hersteller legt Formel oder Gewichte offen, unabhängige Validierung fehlt weitgehend. Das nächstliegende Experiment (Carnes & Mahoney, 2026, n = 19) testete nur *Schein*-Feedback (siehe Abschnitt 6). Für die PRS-Skala gibt es eine kleine Validierung gegen Sprintleistung (Laurent et al., 2011: n = 16, r = −0,63 mit Leistungsänderung) – ein Einzelitem, kein Composite (schwach).

**Widerspruch/Lücke:** Alle Quellen wollen „mehrere Marker“, keine sagt, wie man sie rechnerisch verbindet. Jede Gewichtung in MyRace ist daher eine **Annahme**, keine belegte Größe.

---

### 2. Statistik für kleine, lückenhafte Einzelreihen

**Individualisierter z-Wert (robust)**

```
m_t = Median(x_{t-W} … x_{t-1})          W = 28–60 Tage, heutiger Tag ausgeschlossen
s_t = max(1,4826 · MAD, s_min)            MAD = Median(|x − m_t|)
z_t = clip((x_t − m_t) / s_t, −3, +3)     (Winsorizing)
```

Median/MAD statt Mittel/SD ist bei Ausreißern die Standardempfehlung (Leys et al., 2013; bibliografische Details nicht verifiziert). Für HRV wird der natürliche Logarithmus verwendet (Bellenger et al., 2023). Die Fensterlängen 7 Tage (kurz) und 60 Tage (Baseline) stammen aus dem AIS-Leitfaden; dieser sagt selbst, die optimale Länge sei unbekannt (Expertenmeinung).

**Wie viele Tage?** Eigene Rechnung (Standardstatistik, keine Quelle): Der relative Standardfehler einer SD-Schätzung ist etwa 1/√(2(n−1)), also 29 % bei n = 7, 20 % bei n = 14, 13 % bei n = 30, 9 % bei n = 60. Vor ca. 14 Messtagen sind z-Werte damit kaum belastbar; 3–4 gemittelte Tage sind das Minimum für ein Signal (Buchheit, 2014; Plews, 2014).

**Bayes'sche Baseline (Normal-Normal)**

```
μ_post = w · x̄_n + (1 − w) · μ_pop        w = n / (n + k),   k = σ²_innerhalb / τ²_zwischen
```

Mit Wearable-Normdaten ergibt sich ein wichtiges Ergebnis (eigene Rechnung): Ruhepuls zwischen Personen SD 7,7 bpm, innerhalb einer Person im Mittel 3,03 (Quer et al., 2020; n = 92.457) → k ≈ 9/59 ≈ 0,15. Für rMSSD: zwischen Personen 69 ± 37 ms, Tagesrauschen ca. 12 % (Altini & Plews, 2021) → k ≈ 0,05. **Der Populations-Prior für das Baseline-Mittel ist also schon nach 1–2 Messungen praktisch wertlos**; Alter, Geschlecht, BMI und Aktivität erklären nur 15–19 % der Varianz (Altini & Plews, 2021), beim Ruhepuls höchstens 10 % (Quer et al., 2020). Nützlich ist der Prior dagegen für die **Streuung**:

```
s²_post = (ν0 · s0² + (n − 1) · s²_n) / (ν0 + n − 1)       ν0 ≈ 10–14 (Annahme)
```

**Fehlende Werte: Gewichte renormalisieren oder Unsicherheit erhöhen?** Beides, und zwar konsistent über Präzisionsgewichtung. Im lokalen Niveau-Modell (skalarer Kalman-Filter):

```
Vorhersage:   R⁻ = φ · R_{t−1} + u_t          P⁻ = φ² · P_{t−1} + Q
Je vorhandenem Marker j:  K = P⁻ / (P⁻ + r_j);  R = R⁻ + K · (y_j − R⁻);  P = (1 − K) · P⁻
```

Fehlt ein Marker, entfällt sein Update: Die übrigen Marker bekommen automatisch mehr relatives Gewicht, und P bleibt größer – die Unsicherheit steigt sichtbar. Reines Renormalisieren ohne Varianzführung verschweigt den Informationsverlust. Das ist Lehrbuchstatistik; eine Sportquelle, die genau dieses Vorgehen validiert, habe ich nicht gefunden (Annahme, methodisch Standard).

**Additiv und erklärbar statt Black Box.** Dawes (1979): Einheitsgewichte auf standardisierten, vorzeichenrichtig orientierten Prädiktoren erreichten z. B. r = 0,48 gegenüber 0,38 für kreuzvalidierte Regressionsgewichte und 0,19 für Experten-Urteile; geschätzte Gewichte lohnen erst ab ca. 15–20 Beobachtungen pro Prädiktor. Voraussetzungen: Standardisierung, richtiges Vorzeichen, keine negativen Interkorrelationen (mittel; Daten aus Psychologie/Zulassung, nicht Sport). Einhorn & Hogarth (1975) ist die Originalquelle zur Einheitsgewichtung (nur über Dawes' Literaturliste bestätigt). Rudin (2019) argumentiert, für folgenreiche Entscheidungen von vornherein interpretierbare Modelle zu bauen statt Black Boxes nachträglich zu erklären (Expertenmeinung; Journalangaben nicht verifiziert).

---

### 3. Personalisierung der Sensitivität

**Belegte Größenordnungen der Reaktionen** (Altini & Plews, 2021; 28.175 Nutzer, 9,03 Mio. Morgenmessungen; stark für Gruppenmittel): hartes Training rMSSD −4,8 %, Ruhe-HF +1 %; viel Alkohol HF +6 %, rMSSD −12 %; Krankheit HF +6 %, rMSSD −10 %; Zyklus (follikulär vs. luteal) HF 1,6 %, rMSSD 3,2 %. Signal-Rausch-Verhältnis nur 0,7–0,8. Einzeltage sind also überwiegend Rauschen; Training verschiebt die HRV im Mittel um weniger als eine halbe Tages-SD (eigene Umrechnung).

**Rothschild et al. (2024)**: 43 Ausdauersportler, 12 Wochen, 3.572 Athletentage. Gruppenmodell RMSE 11,8 gegenüber 14,1 (Intercept-Modell) für die Morgen-PRS und 0,22 gegenüber 0,29 für die HRV-Änderung. Individualmodelle schwankten stark (PRS-RMSE 5,5–23,6; HRV 0,05–0,44). Wenige Variablen trugen den Großteil; welche, unterscheidet sich je Person; für Individualmodelle seien mehr Daten nötig. Eigene Umrechnung: 16 % weniger RMSE entspricht grob 30 % erklärter Varianz – selbst mit Ernährungs-, Schlaf-, HRV- und Befindensdaten. Die wichtigsten Prädiktoren im Volltext konnte ich nicht abrufen (nicht verifiziert). Der Preprint nennt abweichend 40 Athleten/3.325 Tage (mittel).

**de Leeuw et al. (2022)**: 14 Elite-Volleyballer, 24 Wochen, Subgroup Discovery je Spieler; für die meisten fanden sich individuelle Last-/Wellness-Muster vor Überlastungsbeschwerden. Retrospektiv, ohne Out-of-Sample-Prüfung laut Abstract (schwach). Die im Auftrag genannten Radsport-Arbeiten habe ich nicht geprüft.

**Wie viele Tage?** Eigene Abschätzung aus den Quellen: Dawes' 15–20 Beobachtungen pro Prädiktor ergeben bei 4 Prädiktoren 60–80 *unabhängige* Tage. Tagesdaten sind autokorreliert; bei AR(1) mit ρ = 0,5 ist die effektive Stichprobe n·(1−ρ)/(1+ρ) = n/3, also 180–240 Kalendertage. Kwasnicka et al. (N-of-1-Übersicht) nennen als Faustregel mindestens 50 Beobachtungen für ARIMA und warnen, positive Autokorrelation erhöhe falsch-positive Befunde. Schönbrodt & Perugini (2013): Korrelationen stabilisieren sich erst bei n ≈ 250; bei r = 0,3 und n = 100 liegt die Schätzung mit ca. 50 % Wahrscheinlichkeit außerhalb von 0,21–0,39. **30 Tage reichen nicht, 90 Tage sind die Untergrenze, und auch dann nur mit starker Schrumpfung** (mittel, indirekt).

```
β_i = w · β̂_i + (1 − w) · β_pop,   w = n_eff / (n_eff + k),   k ≈ 60 (Annahme)
β_i begrenzt auf [0,5 ; 2] · β_pop
```

Risiken: Scheinkorrelation durch gemeinsame Trends (Saison, Trainingsblock), Konfundierung (Stress senkt Schlaf *und* Befinden), Messfehler in den Prädiktoren, selektives Fehlen (an schlechten Tagen kein Check-in).

---

### 4. Offene Datensätze: Was sie bringen

| Datensatz | Umfang | Relevante Variablen | Lizenz/Zugang | Eignung |
|---|---|---|---|---|
| Lövdal et al. (2021) | 74 Wettkampfläufer (800 m–Marathon), 2012–2019 | 10 Merkmale/Tag: GPS-Last, subjektive Anstrengung, Trainingserfolg; Verletzung | CC0, DataverseNL (DOI 10.34894/UWU9PV) | Lastprofile für Simulation; kein HRV/Schlaf. AUC nur 0,724 (Tag) bzw. 0,678 (Woche) |
| PMData (Thambawita et al., 2020) | 16 Personen, 5 Monate laut Paper; die Datensatz-Seite lieferte bei meinem Abruf abweichend 12 Personen/3 Monate (ungeklärt) | Fitbit Ruhe-HF, Schlaf; PMSys: Müdigkeit, Stimmung, **Readiness 0–10**, Schlaf, Muskelkater, Stress, sRPE, Verletzungen | CC BY 4.0 | **Bester Kandidat** für Trockenläufe: enthält subjektive Readiness als Vergleichsgröße. Kein HRV genannt; sehr kleines n |
| LifeSnaps (Yfantidou et al., 2022) | 71 Personen, > 4 Monate, Fitbit Sense | HRV, Ruhe-HF, SpO2, Hauttemperatur, Stress, EMA, Fragebögen | CC BY 4.0 (ein Zenodo-Eintrag offen, ein anderer zugangsbeschränkt) | Nächtliche HRV-Reihen für Varianz-Priors; keine Sportler |
| MMASH (Rossi et al., 2020) | 22 Männer, je 24 h | RR-Intervalle, Schlaf, Cortisol, Fragebögen | ODbL | Für Tagesreihen ungeeignet |
| Stress-/Belastungs-Datensatz (Hongn et al., 2025) | 36/30/31 Personen, Labor | Empatica E4 (BVP, EDA, Temp.) | ODC-By | Akutreaktion, nicht Tagesebene |
| WESAD (Schmidt et al., 2018) | 15 Personen, Labor | Brust-/Handgelenkssensoren | Lizenz nicht verifiziert | Nicht relevant |
| GLOBEM (Xu et al., 2022) | 497 Personen, 705 Personenjahre, je 10 Wochen | Fitbit Schritte/Schlaf, wöchentliche EMA | PhysioNet, nur mit Akkreditierung | Schlafvarianz; kein HRV |
| NetHealth (Notre Dame) | ca. 700 Studierende, bis 4 Jahre | Fitbit Aktivität, Schlaf, mittlere HF | keine benannte Lizenz, Meldung erbeten | Lange Schlafreihen |
| Afonseca et al. (2022) | 36.412 Marathon-Major-Läufer, 10,7 Mio. Läufe 2019–2020 | nur Distanz, Dauer, Geschlecht, Altersgruppe, Land | Figshare (DOI 10.6084/m9.figshare.16620238.v4); von Strava gescrapt, Datensatz-Lizenz nicht genannt | Verteilungen der Wochenumfänge (Mittel 29,2 km 2019); rechtlich vorsichtig behandeln |
| Feely et al. (2023) | 292.323 Läufer, 15,7 Mio. Aktivitäten | Strava | **nicht öffentlich** | Nur Befund nutzbar: ≥ 7 Tage Pause kosten 5–8 % Zielzeit |
| Emig & Peltonen (2020) | ca. 14.000 Läufer, 1,6 Mio. Einheiten | Dauer, Distanz | Verfügbarkeit nicht verifiziert | Nur Befunde |
| Garmin-RUNSAFE (Nielsen et al., 2019) | Protokoll: ≥ 20.000 geplant | Garmin-Daten, Verletzungen | keine Datenfreigabe gefunden | Nur Befunde; Ergebnisarbeiten nicht geprüft |

Nicht geprüft: StudentLife, SNAPSHOT, Tesserae; All of Us verlangt eine Registrierung als Forschende (Details nicht verifiziert). Die Arbeit zu Trainingsunterbrechungen stammt von **Feely, Smyth, Caulfield & Lawlor (2023)**, nicht von „Smyth et al. 2022“.

**Normwerte:** Ruhepuls 65,5 ± 7,7 bpm, individuelle Mittel 40–109, Wochenschwankung im Median ca. 3 bpm (Quer et al., 2020; stark). rMSSD 69 ± 37 ms in einer sportlichen App-Population, r = −0,35 mit dem Alter (Altini & Plews, 2021; stark, selektive Stichprobe). Natarajan et al. (2020; ca. 8 Mio. Fitbit-Nutzer): HRV fällt mit dem Alter, Tagesgang mit Maximum früh morgens; die Benchmark-Tabellen stehen im Supplement und lagen mir nicht vor (Zahlen nicht verifiziert). Schlaf: 7–9 h für Erwachsene (Hirshkowitz et al., 2015; Expertenkonsens); gemessen im Mittel 6,8 ± 0,8 h (Quer et al., 2020).

**Realistische Einschätzung für ein Solo-Projekt**

- **Bringt etwas:** Plausibilitätsgrenzen (Ruhe-HF 35–110 bpm); Varianz-Priors für die ersten zwei Wochen; synthetische Profile und Regressionstests; Trockenlauf des Algorithmus auf PMData/LifeSnaps.
- **Bringt nichts:** ein eigenes Vorhersagemodell. Kein Datensatz enthält Apple-Watch-SDNN, Kalenderbelastung und eine Leistungs-Zielgröße zugleich. Normwerte für rMSSD lassen sich nicht auf Apple-SDNN übertragen (anderer Kennwert, andere Messfenster; in diesem Strang nicht mit Quelle belegt). Und Mittelwert-Priors sind wegen k < 1 (Abschnitt 2) fast wirkungslos.

---

### 5. Unsicherheit ehrlich kommunizieren

Van der Bles et al. (2020; fünf Experimente, n = 5.780): Eine **numerische Spanne** senkte das Vertrauen in die Zahl nur geringfügig und das Vertrauen in die Quelle nicht signifikant; eine rein **verbale** Unsicherheitsangabe senkte das Vertrauen stärker. Im Feldexperiment mit BBC News waren die Effekte noch kleiner und nicht signifikant (stark für Nachrichtenkontext; Übertragung auf Gesundheits-Apps ist eine Annahme). Spiegelhalter (2017) vergleicht Zahlen, Worte und Grafiken und rät, Ziele zu klären und Formate mit der Zielgruppe zu testen (Expertenmeinung). Die im Auftrag genannte Arbeit von 2019 habe ich nicht eingesehen.

Zur Scheingenauigkeit: Bei Tagesrauschen von 10–12 % und SWC von 2–3 % (Buchheit, 2014; Altini & Plews, 2021) sind Unterschiede von wenigen Punkten auf einer 0–100-Skala nicht interpretierbar. Hopkins (2004) verlangt bei Überlappung von Rauschband und SWC die Aussage „unklar“. Eine Studie, die Zahl, Band und Stufe bei Readiness-Scores direkt vergleicht, habe ich nicht gefunden (Lücke).

**Empfehlung:** primär 4 verbale Stufen relativ zum eigenen Normalbereich, dazu ein Band und die Angabe „Datenbasis: hoch/mittel/niedrig“ mit Grund („nur Check-in, keine Uhr“). Die Zahl höchstens sekundär und auf 5er-Schritte gerundet.

---

### 6. Negative Effekte von Scores

- **Orthosomnie** (Baron et al., 2017): Fallserie mit **drei** Patienten; Tracker-Daten führten zu Fixierung, längerer Bettzeit und Misstrauen gegenüber einer unauffälligen Polysomnografie (schwach, aber prägend).
- **Placebo-Schlaf** (Draganich & Erdal, 2014; n = 164): Die erfundene Rückmeldung „unterdurchschnittlicher REM-Anteil“ verschlechterte zwei von vier kognitiven Tests, unabhängig vom selbst berichteten Schlaf (mittel).
- **Schein-Feedback bei Insomnie** (Gavriloff et al., 2018; n = 63, randomisiert): negatives Feedback verschlechterte wache Kognition (d = 0,79) und erhöhte Schläfrigkeit (d = 0,55); objektive Vigilanz blieb gleich (d = 0,12) (mittel).
- **Schein-Readiness bei Läufern** (Carnes & Mahoney, 2026; n = 19, drei 5-km-Zeitläufe): Gesamtzeit unverändert (p = 0,54), aber wahrgenommene Readiness 76,4 vs. 66,7 mm, niedrigeres Anstrengungsempfinden bei km 2 und schnellerer vierter Kilometer nach positivem Feedback (schwach, kleines n, online first).
- „Rahman et al.“ konnte ich **nicht auffinden**; ebenso keine belastbare Studie zu „Score-Angst“ speziell bei Athleten (Lücke).

**Widerspruch:** Feedback verändert verlässlich das *Empfinden*, die objektive Leistung in den vorliegenden Studien kaum. Für eine App, deren stärkster Marker das Empfinden ist, bleibt das relevant.

**UI-Folgen:** Check-in **vor** Anzeige des Scores abfragen (sonst färbt der Score die Selbstauskunft und die Validierung wird zirkulär); kein Alarmrot und keine Diagnosesprache; immer Handlungsoption statt Urteil; Score ausblendbar; keine Streaks auf Messwerte; „unter deinem Normal“ statt „schlecht“; am Wettkampftag keinen niedrigen Score ungefragt anzeigen (Annahme, abgeleitet).

---

### 7. Validierung ohne eigene Studie

1. **Inhaltsvalidität:** 3–5 Fachleute bewerten Marker, Richtung und Schwellen in zwei Runden (Delphi-light).
2. **Referenzszenarien** als automatisierte Tests, z. B. „HRV −1,5 SD, Check-in gut, hohe Last“ → Stufe „normal“, Hinweis auf Diskrepanz (Coutts-Heuristik).
3. **Simulation:** synthetische Profile mit Lücken, Ausreißern und Gerätewechsel. Sanity-Prüfungen gegen belegte Effekte: Alkohol (−12 % rMSSD), Krankheit (+6 % HF), hartes Training (−4,8 % rMSSD) müssen den Score in die erwartete Richtung bewegen, Einzelausreißer dürfen keine Stufe kippen.
4. **Sensitivitätsanalyse:** Gewichte ±50 % variieren; nach Dawes' „flat maximum“ sollte die Stufe an über 90 % der Tage gleich bleiben (Zielwert ist Annahme).
5. **Trockenlauf auf PMData:** objektiver Teil-Score gegen die selbst berichtete Readiness.
6. **Konvergenzvalidität im Freundes-Test:** *nur objektiver* Teil-Score gegen Morgen-PRS, ausgewertet als Innerhalb-Personen-Korrelation (rmcorr; Bakdash & Marusich, 2017).
7. **Prospektiv:** Sagt die Morgen-Stufe die Abweichung geplant/ist oder die sRPE bei gleicher Einheit vorher? Kalibrierung: An „unter Normal“-Tagen muss die Rate verkürzter Einheiten erkennbar höher liegen.

**Was 10–20 Nutzer × 4–6 Wochen zeigen können:** 280–840 Personentage. Das reicht für Richtung und grobe Größe von Innerhalb-Personen-Zusammenhängen (Vergleichswert: Gruppenmodell bei Rothschild et al. erklärt ca. 30 % der PRS-Varianz), für Fehlquoten, Abbruchgründe und Verständlichkeit. **Nicht zeigbar:** Leistungs- oder Verletzungsvorhersage, individuelle Sensitivitäten (zu wenig Tage je Person), Übertragbarkeit jenseits sportlicher Freunde. Die ersten 2–4 Wochen dienen zudem der Baseline, sodass effektiv weniger auswertbare Tage bleiben. Faustregeln zu Pilotgrößen (z. B. 12 pro Gruppe) habe ich nur dem Titel nach gefunden (nicht verifiziert).

---

### 8. Was für MyRace folgt

**Modellempfehlung: additives Präzisions-Modell auf individualisierten z-Werten mit lokalem Niveau-Filter.** Der vorhandene „Kalman-light“-Ansatz passt dazu; er sollte eine explizite Varianz P führen.

**Schritt 1 – Marker normalisieren** (Formeln aus Abschnitt 2). HRV als ln(SDNN), Vorzeichen so, dass positiv = erholter (Ruhe-HF negativ). Schlaf nur einseitig: Defizit gegenüber dem eigenen Median, Überschuss wird bei 0 gekappt (Annahme). Totband: |z| < 0,5 → 0 (Beleg: SWC = 0,5 × CV, Bellenger et al., 2023). Check-in-Items ebenfalls gegen die eigene Baseline, zusätzlich mit absolutem Anker ab Tag 1.

**Schritt 2 – Blöcke bilden, Einheitsgewichte**

```
A  subjektiv   = Mittel der Check-in-z-Werte
B  autonom     = Mittel aus z(lnHRV, 7-Tage-Mittel) und −z(Ruhe-HF)   (ein Wert genügt)
C  Schlaf      = z(Schlafdefizit)
```

HRV und Ruhe-HF werden zu einem Block gemittelt, damit dasselbe Signal nicht doppelt zählt (Annahme, gestützt auf Dawes' Bedingung nicht-redundanter Orientierung). Alle Blöcke starten mit gleicher Messvarianz r = 1 (Beleg für Gleichgewichtung: Dawes, 1979; dass subjektive Maße mindestens gleichwertig sind: Saw et al., 2016).

**Schritt 3 – Zustand fortschreiben**

```
R⁻ = φ · R_{t−1} − β_L · Last_z,{t−1} − β_S · Kalenderstress_z,t
P⁻ = φ² · P_{t−1} + Q
Update je vorhandenem Block (K = P⁻/(P⁻ + r))
```

Startparameter (alle **Annahme**, per Sensitivitätsanalyse zu prüfen): φ = 0,7; Q = 0,5; r = 1; P₀ = 1; β_L = 0,3; β_S = 0,2. Die Richtung von β_L ist belegt (hartes Training senkt HRV, Altini & Plews, 2021), die Größe nicht. Last und Kalender wirken nur über die Vorhersage: Sie tragen den Score an Tagen ohne Messung, werden aber von echten Messungen überstimmt.

**Schritt 4 – Anzeige**

```
Stufe:  R ≥ +0,5 „über deinem Normal“ | −0,5 … +0,5 „im Normalbereich“
        −1,5 … −0,5 „etwas darunter“   | < −1,5 „deutlich darunter“
Band:   R ± 1 · √P ; überschreitet das Band eine Stufengrenze → Formulierung „eher …“
Zahl:   50 + 15 · R, begrenzt auf 0–100, auf 5 gerundet, nachrangig
```

Schwelle −1,5 ist Praxis-Konvention ohne gefundene Primärquelle (Annahme). Datenbasis „hoch“: mindestens 2 Blöcke heute und Baseline ≥ 28 Tage; „mittel“: 1 Block oder Baseline 14–27 Tage; „niedrig“: nur Vorhersage oder Baseline < 14 Tage (Annahme; begründet durch SD-Fehler 20 % bei n = 14).

**Schritt 5 – Kaltstart.** Tag 1–13: nur Check-in mit absolutem Anker plus Last; objektive Marker werden gesammelt und als „lerne deinen Normalbereich“ ausgewiesen. Populationswerte nur für Plausibilitätsgrenzen und als Varianz-Prior (ν0 = 10), nicht als Mittelwert-Prior (Beleg: k < 1).

**Schritt 6 – Personalisierung später.** Version 1 ohne individuelle β. Frühestens ab 90 gepaarten Tagen, mit Schrumpfung (k = 60) und Begrenzung auf 0,5–2× des Standardwerts; dem Nutzer als „Tendenz“ zeigen, nicht als Tatsache (Beleg für Vorsicht: Rothschild et al., 2024; Schönbrodt & Perugini, 2013).

**Offen bzw. unsicher:** alle Gewichte und Schwellen; Übertragbarkeit der rMSSD-Literatur auf Apple-SDNN; Inhalt von Bourdon et al.; fehlende Vergleichsstudie Zahl/Band/Stufe; Zirkularität jeder Validierung gegen subjektive Erholung.

---

### Quellen

Nur per Suche/Abruf bestätigte Quellen. „n. v.“ = Detail nicht verifiziert.

1. Afonseca LA, Watanabe RN, Duarte M (2022). A worldwide comparison of long-distance running training in 2019 and 2020: associated effects of the COVID-19 pandemic. *PeerJ* 10:e13192. doi:10.7717/peerj.13192. Daten: doi:10.6084/m9.figshare.16620238.v4
2. Altini M, Plews D (2021). What Is behind Changes in Resting Heart Rate and Heart Rate Variability? A Large-Scale Analysis of Longitudinal Measurements Acquired in Free-Living. *Sensors* 21(23):7932. doi:10.3390/s21237932
3. Bakdash JZ, Marusich LR (2017). Repeated Measures Correlation. *Frontiers in Psychology* 8:456. doi:10.3389/fpsyg.2017.00456 (Inhalt n. v., nur Titel/Fundstelle)
4. Baron KG, Abbott S, Jao N, Manalo N, Mullen R (2017). Orthosomnia: Are Some Patients Taking the Quantified Self Too Far? *J Clin Sleep Med* 13(2):351 ff. doi:10.5664/jcsm.6472
5. Bellenger C, Siegel R, Stanley J, McGibbon K (2023). Best Practice Guidelines: Measurement, analysis and interpretation of resting heart rate and heart rate variability in athletes. Australian Sports Commission/AIS. https://www.ais.gov.au/__data/assets/pdf_file/0013/1130260/HRV-BPG_FINAL.pdf
6. Bourdon PC et al. (2017). Monitoring Athlete Training Loads: Consensus Statement. *Int J Sports Physiol Perform* 12(Suppl 2). doi:10.1123/IJSPP.2017-0208 (Seiten, DOI und Inhalt n. v.; https://pubmed.ncbi.nlm.nih.gov/28463642/)
7. Buchheit M (2014). Monitoring training status with HR measures: do all roads lead to Rome? *Frontiers in Physiology* 5:73. doi:10.3389/fphys.2014.00073
8. Carnes AJ, Mahoney SE (2026). Are Predictive Metrics by Wearables “Unproductive”? The effect of deceptive wearable monitor feedback on performance and perception in recreational runners. *Journal of Human Kinetics* (online first). doi:10.5114/jhk/219655
9. Coutts AJ, Crowcroft S, Kempton T (2022). Developing athlete monitoring systems: Theoretical basis and practical applications. In: Kellmann M, Beckmann J (Hrsg.), *Recovery and Well-being in Sport and Exercise*. Routledge, S. 17–31. doi:10.4324/9781003258117-3 (Fassung 2018 in *Sport, Recovery, and Performance*: n. v.)
10. Dawes RM (1979). The robust beauty of improper linear models in decision making. *American Psychologist* 34(7):571–582.
11. de Leeuw A-W, van der Zwaard S, van Baar R, Knobbe A (2022). Personalized machine learning approach to injury monitoring in elite volleyball players. *Eur J Sport Sci* 22(4):511–520. doi:10.1080/17461391.2021.1887369 (Autorenliste n. v.)
12. Doherty C, Baldwin M, Lambe R, Burke D, Altini M (2025). Readiness, recovery, and strain: an evaluation of composite health scores in consumer wearables. *Translational Exercise Biomedicine* 2(2):128–144. doi:10.1515/teb-2025-0001
13. Draganich C, Erdal K (2014). Placebo sleep affects cognitive functioning. *J Exp Psychol Learn Mem Cogn* (Band/Seiten n. v.). https://pubmed.ncbi.nlm.nih.gov/24417326/
14. Einhorn HJ, Hogarth RM (1975). Unit weighting schemes for decision making. *Organizational Behavior and Human Performance* 13:171–192 (nur über Dawes' Literaturliste bestätigt).
15. Emig T, Peltonen J (2020). Human running performance from real-world big data. *Nature Communications* 11. doi:10.1038/s41467-020-18737-6
16. Feely C, Smyth B, Caulfield B, Lawlor A (2023). Estimating the cost of training disruptions on marathon performance. *Frontiers in Sports and Active Living* 4:1096124. doi:10.3389/fspor.2022.1096124
17. Gavriloff D, Sheaves B, Juss A, Espie CA, Miller CB, Kyle SD (2018). Sham sleep feedback delivered via actigraphy biases daytime symptom reports in people with insomnia. *Journal of Sleep Research* 27. doi:10.1111/jsr.12726
18. Hirshkowitz M et al. (2015). National Sleep Foundation's sleep time duration recommendations: methodology and results summary. *Sleep Health* 1(1):40–43. doi:10.1016/j.sleh.2014.12.010
19. Hongn A, Bosch F, Prado L, Bonomini P (2025). Wearable Device Dataset from Induced Stress and Structured Exercise Sessions (v1.0.1). PhysioNet. doi:10.13026/he0v-tf17
20. Hopkins WG (2004). How to Interpret Changes in an Athletic Performance Test. *Sportscience* 8:1–7. https://sportsci.org/jour/04/wghtests.htm
21. Kellmann M et al. (2018). Recovery and Performance in Sport: Consensus Statement. *Int J Sports Physiol Perform* 13(2):240–245. doi:10.1123/ijspp.2017-0759
22. Kwasnicka D, Inauen J, Nieuwenboom W, et al. Challenges and solutions for N-of-1 design studies in health psychology (Journal, Jahr, DOI n. v.). https://ueaeprints.uea.ac.uk/id/eprint/70175/
23. Laurent CM, Green JM, Bishop PA, et al. (2011). A practical approach to monitoring recovery: development of a perceived recovery status scale. *J Strength Cond Res* 25(3):620–628. doi:10.1519/JSC.0b013e3181c69ec6 (Autorenliste n. v.)
24. Leys C, Ley C, Klein O, Bernard P, Licata L (2013). Detecting outliers: Do not use standard deviation around the mean, use absolute deviation around the median. *J Exp Soc Psychol* (Band, Seiten, DOI n. v.).
25. Lövdal SS, den Hartigh RJR, Azzopardi G (2021). Injury Prediction in Competitive Runners With Machine Learning. *Int J Sports Physiol Perform* 16(10):1522–1532 (bei mir als -1532 ausgewiesen). doi:10.1123/ijspp.2020-0518. Daten: doi:10.34894/UWU9PV (CC0)
26. Manresa-Rocamora A, Sarabia JM, Javaloyes A, Flatt AA, Moya-Ramón M (2021). Heart rate variability-guided training for enhancing cardiac-vagal modulation, aerobic fitness, and endurance performance: a methodological systematic review with meta-analysis. *Int J Environ Res Public Health* 18(19):10299. doi:10.3390/ijerph181910299
27. Natarajan A, Pantelopoulos A, Emir-Farinas H, Natarajan P (2020). Heart rate variability with photoplethysmography in 8 million individuals: a cross-sectional study. *Lancet Digital Health* (Band/Seiten n. v.; PII S2589-7500(20)30246-6). Preprint: https://www.biorxiv.org/content/10.1101/772285
28. NetHealth Study, University of Notre Dame. https://sites.nd.edu/nethealth/
29. Nielsen RØ, Bertelsen ML, Ramskov D, et al. (2019). The Garmin-RUNSAFE Running Health Study on the aetiology of running-related injuries: rationale and design of an 18-month prospective cohort study including runners worldwide. *BMJ Open* 9(9):e032627. doi:10.1136/bmjopen-2019-032627
30. Plews D (2014). The Practical Application of Heart Rate Variability – Monitoring Training Adaptation in World Class Athletes. Dissertation, Auckland University of Technology. https://hdl.handle.net/10292/7122
31. Quer G, Gouda P, Galarnyk M, Topol EJ, Steinhubl SR (2020). Inter- and intraindividual variability in daily resting heart rate and its associations with age, sex, sleep, BMI, and time of year. *PLoS ONE* 15(2):e0227709. doi:10.1371/journal.pone.0227709
32. Robertson S, Bartlett JD, Gastin PB (2017). Red, Amber, or Green? Athlete Monitoring in Team Sport: The Need for Decision-Support Systems. *Int J Sports Physiol Perform* 12(Suppl 2):S2-73–S2-79. doi:10.1123/ijspp.2016-0541
33. Rossi A, Da Pozzo E, Menicagli D, et al. (2020). A Public Dataset of 24-h Multi-Levels Psycho-Physiological Responses in Young Healthy Adults. *Data* 5(4):91. doi:10.3390/data5040091. Daten: doi:10.13026/cerq-fc86 (ODbL)
34. Rothschild JA, Stewart T, Kilding AE, Plews DJ (2024). Predicting daily recovery during long-term endurance training using machine learning analysis. *Eur J Appl Physiol* 124(11):3279–3290. doi:10.1007/s00421-024-05530-2
35. Rudin C (2019). Stop explaining black box machine learning models for high stakes decisions and use interpretable models instead. *Nature Machine Intelligence* (Band/Seiten/DOI n. v.). arXiv:1811.10154
36. Saw AE, Main LC, Gastin PB (2016). Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures: a systematic review. *Br J Sports Med* 50(5):281–291 (DOI n. v.).
37. Schmidt P, Reiss A, Dürichen R, Marberger C, Van Laerhoven K (2018). Introducing WESAD, a Multimodal Dataset for Wearable Stress and Affect Detection. ICMI 2018 (Autorenliste, Lizenz n. v.).
38. Schönbrodt FD, Perugini M (2013). At what sample size do correlations stabilize? *Journal of Research in Personality* 47:609–612. doi:10.1016/j.jrp.2013.05.009
39. Spiegelhalter D (2017). Risk and Uncertainty Communication. *Annual Review of Statistics and Its Application* 4. doi:10.1146/annurev-statistics-010814-020148
40. Thambawita V, Hicks S, Borgli H, et al. (2020). PMData: a sports logging dataset. ACM MMSys 2020 laut Simula-PDF; ein Katalogeintrag nennt abweichend IEEE ISM 2020 (Tagungsband und DOI n. v.). https://datasets.simula.no/pmdata (CC BY 4.0)
41. Thorpe RT, Atkinson G, Drust B, Gregson W (2017). Monitoring Fatigue Status in Elite Team-Sport Athletes: Implications for Practice. *Int J Sports Physiol Perform* 12(Suppl 2) (Seiten/DOI n. v.). https://pubmed.ncbi.nlm.nih.gov/28095065/
42. van der Bles AM, van der Linden S, Freeman ALJ, Spiegelhalter DJ (2020). The effects of communicating uncertainty on public trust in facts and numbers. *PNAS* (Band/Seiten n. v.). doi:10.1073/pnas.1913678117
43. Vesterinen V, Nummela A, Heikura I, et al. (2016). Individual Endurance Training Prescription with Heart Rate Variability. *Med Sci Sports Exerc* 48(7):1347–1354. doi:10.1249/MSS.0000000000000910 (Autorenliste n. v.)
44. Xu X, Zhang H, Sefidgar Y, et al. (2022/2023). GLOBEM Dataset: Multi-Year Datasets for Longitudinal Human Behavior Modeling Generalization. NeurIPS 2022 Datasets and Benchmarks; PhysioNet v1.1. doi:10.13026/r9s1-s711
45. Yfantidou S, Karagianni C, Efstathiou S, et al. (2022). LifeSnaps, a 4-month multi-modal dataset capturing unobtrusive snapshots of our lives in the wild. *Scientific Data* (DOI vermutlich 10.1038/s41597-022-01764-x, n. v.). Daten: doi:10.5281/zenodo.6832186

---

## B7 – Wettbewerb: Readiness-/Recovery-Scores und adaptive Trainingspläne


Stand der Recherche: 11.–12. November 2026. Alle URLs wurden in diesem Zeitraum abgerufen, sofern nicht anders vermerkt.

**Kennzeichnung:** [belegt] = unabhängige Studie oder technische Primärdoku · [Herstellerangabe] = vom Anbieter selbst, nicht unabhängig geprüft · [Marketing] = Werbeaussage ohne nachprüfbaren Mechanismus · [Sekundärquelle] = Fachpresse/Blog · [Wettbewerberquelle] = stammt von einem Konkurrenten des beschriebenen Produkts, mit Vorsicht lesen · [nicht verifiziert] = in dieser Recherche nicht an einer Quelle geprüft.

---

### 0. Kurzfassung

1. **Apple hat seit September 2026 einen eigenen Readiness-Score** (0–10, vier Stufen), allerdings nur auf Apple Watch Series 12 und Ultra 4. Das ist die wichtigste Marktveränderung für eine iOS-App, die Readiness aus Apple-Health-Daten ableiten will. Der Score ist laut einer Sekundärquelle für Dritt-Apps nicht lesbar.
2. **Kein großer Anbieter legt Formel oder Gewichte seines Scores offen.** Die Übersichtsarbeit von Doherty et al. (2025) untersuchte 14 Scores von 10 Herstellern und fand bei keinem eine offengelegte Formel; Validierung des Gesamtscores fehlt meist.
3. **Unabhängige Belege, dass ein Readiness-Score Leistung oder subjektive Erholung vorhersagt, sind dünn und fallen eher negativ aus** (Lundstrom 2023 für Whoop; De Bot 2025 für Oura; beide kleine Stichproben).
4. **Kalender lesen ist kein Alleinstellungsmerkmal mehr.** Mindestens ein Produkt (athletedata.health) liest nach eigener Angabe Google-Kalender-Termine und nutzt Termindichte für Verfügbarkeit *und* Erholungsplanung. Die großen Lauf-Apps (Runna, Garmin, Strava, TrainAsONE, Campus, enduco) tun das nach den geprüften Quellen nicht; sie arbeiten mit manuell eingegebener Verfügbarkeit.
5. **Runna passt Pläne nach den geprüften Quellen an Lauf-Performance und manuelle Eingaben an, nicht an Erholungsdaten.** Ob intern doch Wearable-Daten einfließen, ist nicht offengelegt.

---

### 1. Wearable-Hersteller: Scores im Detail

#### 1.1 Whoop

- **Eingaben Recovery:** HRV, Ruhepuls, Schlaf-Performance (erhaltener vs. benötigter Schlaf), Atemfrequenz; ab Whoop 4.0 zusätzlich SpO2 und Hauttemperatur. Die Atemfrequenz wirkt laut Whoop meist kaum, außer bei deutlicher Abweichung. [Herstellerangabe] (whoop.com/thelocker/how-does-whoop-recovery-work-101)
- **Rechenweg:** Gewichte sind nicht veröffentlicht. Dass HRV dominiert, ist verbreitete Lesart, auf der geprüften Whoop-Seite aber nicht beziffert. [unklar] Die HRV wird laut Doherty et al. zum letzten Tiefschlafabschnitt hin gewichtet. [belegt, Review]
- **Ausgabe:** Prozentwert, einmal morgens; grün 67–99 %, gelb 34–66 %, rot 1–33 %. [Herstellerangabe]
- **Journal:** Zusammenhang eines Verhaltens mit Recovery wird ab mindestens 5 Ja- und 5 Nein-Einträgen innerhalb von 90 Tagen angezeigt. [Herstellerangabe] (whoop.com/…/thelocker/2026-whats-new) Das Monthly Performance Assessment nennt auf der geprüften Seite keine eigene Mindestzahl. [unklar]
- **Whoop AI / Coach (2026):** KI-Workout-Generierung, Jetlag-Coaching bei Zeitzonenwechsel (braucht Standortfreigabe), automatische Übungserkennung im Krafttraining. [Herstellerangabe] Einen Lauf-Trainingsplan mit Zielrennen, den Recovery umbaut, nennt die Seite nicht. Ein Zugriff auf den Nutzerkalender wird nicht erwähnt. [nicht verifiziert, ob es das an anderer Stelle gibt]
- **Healthspan / Whoop Age, Stress Monitor, Health Monitor, Sleep Coach:** existieren laut Whoop-Seiten und Doherty-Review (Stress Monitor ist einer der 14 Scores); Details in dieser Recherche nicht einzeln geprüft. [nicht verifiziert]
- **Validierung:** Miller et al. 2022 (Sensors 22:6317; 53 Erwachsene, eine Labornacht gegen Polysomnographie): Whoop 3.0 86 % Übereinstimmung Schlaf/Wach, 60 % bei Schlafstadien; alle sechs Geräte brauchbar für Schlafdauer, verbesserungsbedürftig bei Stadien. [belegt] Bellenger et al. 2021 (HF/HRV gegen EKG) wurde nur indirekt über ein Review gesichtet. [nicht direkt verifiziert]
- **Score gegen Outcome:** Lundstrom et al. 2023 (Int. J. Sports Science & Coaching; NCAA-D1-Schwimmteam, 6 Wochen Überlastungsblock): HRV korrelierte moderat negativ mit Stress (r ≈ −0,46); Strain und Recovery zeigten keinen sinnvollen Zusammenhang mit Stoffwechselmarkern oder RESTQ-Fragebogen. Leistung wurde nicht direkt gemessen. [belegt, über Sekundärquelle trainright.com gelesen]

#### 1.2 Oura

- **Eingaben Readiness:** Ruhepuls (nächtliches Minimum), HRV-Balance (2-Wochen-Trend gegen 3-Monats-Mittel), Körpertemperatur, Recovery Index (Schlafzeit nach dem Puls-Tiefpunkt), Schlaf, Aktivität des Vortags, Aktivitätsbalance (14 Tage gegen 2 Monate). [Herstellerangabe] (ouraring.com/blog/readiness-score-to-optimize-workouts)
- **Ausgabe:** 0–100; 85+ optimal, 70–84 gut, 60–69 mäßig, darunter „Pay Attention“. [Herstellerangabe]
- **Bemerkenswert:** Oura räumt im eigenen Blog ein, dass keine Studie zeigt, was ein bestimmter Readiness-Wert für den Trainingsplan bedeutet. [Herstellerangabe]
- **Resilience:** Verhältnis von physiologischem Tagesstress zu Erholung (tagsüber und im Schlaf) über etwa 14 Tage, fünf Stufen; keine Validierungsdaten auf der Seite. [Herstellerangabe]
- **Cumulative Stress:** 31-Tage-Fenster, wöchentliche Aktualisierung, fünf dynamisch gewichtete Beiträge (Schlafkontinuität, Herz-Stressantwort, Mikrobewegungen, Temperaturregulation, Aktivität); braucht mindestens 21 Tage Daten. [Herstellerangabe] (support.ouraring.com, Artikel 45979919957395)
- **Symptom Radar, Tags/Trends, Daytime Stress:** in dieser Recherche nicht im Detail geprüft. [nicht verifiziert]
- **Plananpassung:** Oura selbst hat keinen Trainingsplan. Der Score wird aber von Dritten genutzt, z. B. JOIN (siehe 3.4).
- **Validierung der Sensorik:** Cao et al. 2022 (JMIR 24:e27487; 35 Gesunde, Heimnacht gegen EKG): nächtliche HF und RMSSD genau, SDNN nur im Nachtmittel akzeptabel, LF und LF/HF mit hohen Fehlern. [belegt] Schlafstadien: 79 % Vier-Stadien-Übereinstimmung in der Sensors-Studie 2021 (106 Personen, 440 Nächte), die Oura selbst zitiert; Altini ist Oura-Berater. [Herstellerangabe/belegt mit Interessenkonflikt] Miller 2022: Oura Gen 2 61 % bei Stadien. [belegt] Kinnunen 2020 nicht geprüft. [nicht verifiziert]
- **Score gegen Outcome:** De Bot, Gielen & Aerts 2025 (icSPORTS, KU Leuven; 12 Nachwuchs-Triathleten, ca. 3 Monate): Readiness korrelierte praktisch nicht mit Session-RPE oder dem Erholungsfragebogen TQR; Schlaf war der stärkste Treiber des Scores. Kleine Stichprobe, subjektive Daten nur von 6 Athleten. [belegt, schwache Evidenz]

#### 1.3 Garmin

- **Training Readiness:** sechs Faktoren – Schlaf-Score letzte Nacht, Erholungszeit, HRV-Status, akute Last, Schlafhistorie (3 Nächte), Stresshistorie (3 Tage). Skala 1–100, fünf Stufen von „Poor“ bis „Prime“, wird über den Tag aktualisiert. [Herstellerangabe] (Garmin-Handbuch, Abschnitt Training Readiness) Gewichte nicht offengelegt.
- **Plananpassung:** Der Run Coach wurde laut TechRadar (August 2024) so umgebaut, dass Pläne auf Training Readiness, Schlaf-Score und Gesamtlast reagieren, analog zu den Daily Suggested Workouts. [Sekundärquelle] Das Handbuch zu adaptiven Plänen nennt als Eingaben Fitnessniveau, Coaching- und Zeitplan-Präferenzen und Renndatum. [Herstellerangabe]
- **Kalender/Alltag:** In den geprüften Garmin-Quellen findet sich kein Lesen von Kalenderterminen zur Trainingsplanung. Alltagsbelastung fließt nur indirekt ein, über den HRV-basierten Stresswert in der Stresshistorie. [nicht verifiziert, dass es keine solche Funktion gibt]
- **Health Status und Lifestyle Logging (seit Herbst 2025):** Health Status meldet Ausreißer bei fünf Nachtwerten (HF, HRV, Atmung, Hauttemperatur, SpO2) nach 3–4 Wochen Baseline. Lifestyle Logging lässt Verhaltens-Tags setzen (z. B. Alkohol, spätes Essen) und prüft den Zusammenhang mit Ausreißern; eine Mindestzahl an Einträgen nennt die Quelle nicht. [Sekundärquelle] (the5krunner.com, 20.09.2025)
- **Body Battery, HRV Status (7-Tage-Mittel gegen Baseline-Band nach rund 3 Wochen), Training Status, Firstbeat-Whitepaper:** siehe Ergänzung in Abschnitt 1.6.
- **Validierung:** Miller 2022: Garmin Forerunner 245 50 % bei Schlafstadien. [belegt] Für Training Readiness oder Body Battery als Gesamtscore wurde keine unabhängige Outcome-Validierung gefunden. [nicht gefunden]

#### 1.4 Polar

- **Nightly Recharge:** zwei Teile. ANS Charge (−10 bis +10) aus HF, HRV und Atemfrequenz in etwa den ersten vier Schlafstunden, verglichen mit den letzten 28 Tagen; Sleep Charge aus dem Schlaf-Score gegen das eigene Normalniveau. Gesamtstatus in sechs Stufen. Wie beide Teile verrechnet werden, ist nicht beschrieben. Anzeige ab drei erfolgreichen Nächten. [Herstellerangabe] (support.polar.com, Handbuch Unite)
- **Folge für das Training:** Die Flow-App erzeugt tägliche Übungstipps aus Nightly-Recharge-Status, ANS Charge, Sleep Charge und Cardio-Load-Status. Dass Nightly Recharge die FitSpark-Vorschläge direkt verändert, sagt die geprüfte Seite nicht. [Herstellerangabe / unklar]
- **Training Load Pro, Recovery Pro, Orthostatic Test:** siehe Ergänzung in Abschnitt 1.6.
- **Validierung:** Miller 2022: Polar Vantage V 51 % bei Schlafstadien. [belegt]

#### 1.5 Apple

- **Vitals (seit watchOS 11):** nächtliche HF, Atemfrequenz, Handgelenkstemperatur, SpO2, Schlafdauer; ein Ausreißer wird markiert, ab zwei Ausreißern kommt eine Mitteilung. [Sekundärquelle] (dcrainmaker.com, Juli 2024)
- **Training Load (seit watchOS 11):** Effort Rating 1–10 mal Dauer; 7-Tage-Trend gegen 28-Tage-Trend, fünf Stufen von „Well Below“ bis „Well Above“. Kritik von DC Rainmaker: Effort Rating lernt nicht aus Korrekturen, Intervalle werden unterbewertet. [Sekundärquelle]
- **watchOS 26 (September 2025):** Sleep Score (Dauer, Regelmäßigkeit der Bettzeit, Unterbrechungen), Workout Buddy (gesprochene Motivation, Apple Intelligence), Bluthochdruck-Hinweise über 30-Tage-Fenster. [Sekundärquelle] (macrumors.com, 15.09.2025)
- **NEU – Readiness (angekündigt 9. September 2026):** Tageswert 0–10 aus aktueller Aktivität, Vitals und Schlaf-Score mit den Empfehlungen „Recover“, „Pace Yourself“, „Ready“, „Go For It“; zeigt die treibenden Faktoren, aktualisiert sich über den Tag. Laut Apple mit Daten der Apple Heart and Movement Study entwickelt. [Herstellerangabe] (apple.com/newsroom, 09/2026) Laut 9to5Mac nur auf Series 12 und Ultra 4, Stufen 8–10 / 5–7 / 2–4 / 0–1; mehr Aktivität senkt den Wert tendenziell. [Sekundärquelle] Laut TechRadar sieben Nächte Baseline nötig; Validierung nur durch Apple-eigene Studien. [Sekundärquelle] **Der Score ändert keinen Trainingsplan** – Apple hat keinen Lauf-Trainingsplan mit Zielrennen angekündigt, und ein Kalenderbezug wird nicht genannt. [nach geprüften Quellen]
- **HealthKit für Dritt-Apps:**
  - `workoutEffortScore` ist lesbar; Abfrage über Zeitraum oder `predicateForWorkoutEffortSamplesRelated`, nicht über `predicateForObjects(from:)`. [belegt, Apple Developer Forum, Thread 772319] `estimatedWorkoutEffortScore` dort nicht bestätigt. [unklar]
  - HRV lag seit iOS 11 nur als SDNN vor; iOS 27 ergänzt laut einem Anbieter-Blog einen RMSSD-Typ, wobei Apple nicht bestätigt hat, dass die Watch RMSSD-Samples schreibt. [Sekundärquelle mit Eigeninteresse] (themomentum.ai, 10.09.2026)
  - Apples Readiness-Score ist laut derselben Quelle für Dritt-Apps nicht lesbar, der Algorithmus nicht veröffentlicht. [Sekundärquelle, bitte an Apple-Doku gegenprüfen]
  - Der aggregierte Training-Load-Wert war 2024 nach DC Rainmaker nicht für Apps verfügbar. [Sekundärquelle, Stand 2026 nicht verifiziert]
  - `appleSleepingWristTemperature` und Heartbeat Series wurden in dieser Recherche nicht an der Apple-Doku geprüft. [nicht verifiziert]

#### 1.6 Ergänzungen

- **Polar Recovery Pro:** Orthostatic Test am Morgen mit Brustgurt (rund vier Minuten, RMSSD im Liegen und Stehen gegen 28-Tage-Baseline) plus kurze Fragen zu Muskelkater, Müdigkeit und Schlaf; kombiniert mit der Trainingshistorie aus Training Load Pro. Damit ist Polar einer der wenigen Hardware-Anbieter, der subjektive Antworten in die Erholungsaussage einrechnet. [Herstellerangabe] (polar.com/blog/nightly-recharge-vs-recovery-pro)
- **Polar Training Load Pro:** Cardio-Load-Status vergleicht Strain (Tagesmittel 7 Tage) mit Tolerance (Tagesmittel 28 Tage). Muscle Load und Perceived Load auf der geprüften Seite nicht beschrieben. [Herstellerangabe / teils nicht verifiziert]
- **Polar ANS Charge:** Laut Polar hat die Herzfrequenz den größten Einfluss, nicht die HRV. [Herstellerangabe]
- **Garmin Body Battery, HRV Status, Training Status, Firstbeat-Whitepaper:** Die Garmin-Technologieseiten ließen sich nicht abrufen (Weiterleitung). Die im Auftrag genannten Eckdaten (7-Tage-Mittel gegen persönliches Baseline-Band, etwa drei Wochen Aufbau) sind hier **nicht verifiziert**. Body Battery und Training Readiness gehören zu den 14 Scores in Doherty 2025.

---

### 2. HRV-Apps und Analyse-Plattformen

- **HRV4Training (Altini):** Morgenmessung 60 Sekunden per Smartphone-Kamera oder Brustgurt, alternativ Import aus Oura oder Apple Watch; Normalbereich aus den letzten 60 Tagen; Tagesempfehlung (trainieren / leichter / ruhen) aus HRV, Ruhepuls, subjektivem Befinden und Trend; Tags (Alkohol, Reise, Krankheit, Zyklus) und Korrelationen ausdrücklich als explorative Analyse. Erstellt keine Trainingspläne. Kamera-Messung laut Anbieter gegen Brustgurt und EKG validiert (IJSPP-Publikation). [Herstellerangabe mit zitierter Studie] (hrv4training.com/faq.html)
- **Elite HRV, Kubios:** nicht geprüft. [nicht verifiziert]
- **TrainingPeaks (Performance Management Chart):** CTL („Fitness“) ist ein gewichtetes Mittel der täglichen TSS über 42 Tage, ATL („Fatigue“) über 7 Tage, TSB („Form“) die Differenz vom Vortag. TSS entsteht aus Dauer und Intensität (Leistung, Herzfrequenz oder Pace). HRV und Schlaf gehen nicht ein; HRV kann nur als getrennte Metrik aus Dritt-Apps daneben angezeigt werden. Ein reines Lastmodell ohne Erholungs- oder Alltagssignal. [Herstellerangabe] (help.trainingpeaks.com, Glossar)
- **intervals.icu, Runalyze, Stryd:** nicht geprüft. [nicht verifiziert]

---

### 3. Adaptive Lauf- und Ausdauerpläne

#### 3.1 Runna (seit April 2025 Teil von Strava)

- Läuft weiter als eigene App mit eigenem Abo; Bundle mit Strava seit Juli 2025. [Sekundärquelle] (the5krunner.com/runna)
- **Was sich anpasst:** Pace-Ziele bei Tempo- und Intervalleinheiten, wenn Vorgaben wiederholt verfehlt oder übertroffen werden; „Not Feeling 100%“ (manuell: 3–14 Tage pausieren oder reduzieren, danach Rückkehrphase langsam/ausgewogen/schnell); „Adapt for Heat“ (seit 29.07.2026, Pace nach Wettervorhersage); „Upcoming Plans“ (mehrere Pläne im Jahresüberblick) und automatische Post-Race-Recovery-Pläne. [Herstellerangabe] (runna.com/press; intercom.help/runna)
- **Erholungsdaten:** In keiner geprüften Quelle (Pressemitteilung, Support-Artikel, zwei Analysen von the5krunner, Runna-Statement an TechRadar) werden HRV, Schlaf oder ein Readiness-Score als Eingabe genannt. Runna hat den Algorithmus nicht veröffentlicht. **Stand: nicht belegt, dass Runna Erholungsdaten nutzt; ausschließen lässt es sich nicht.**
- **Kalender:** Nur Angabe der Trainingstage; kein Lesen von Kalenderterminen in den geprüften Quellen. [nicht verifiziert]
- **Kritik:** Wall-Street-Journal-Bericht vom Februar 2026 über Verletzungen, die Physiotherapeuten mit Runna-Plänen in Verbindung bringen; kein Peer-Review-Beleg für höhere Verletzungsraten. Runna kündigte im August 2026 eine Überprüfung mit der Loughborough University an. [Sekundärquelle]

#### 3.2 Strava

- **Instant Workouts (Januar 2026):** wöchentlich je fünf Vorschläge in vier Kategorien (Maintain, Build, Explore, Recover) mit Routenvorschlag. DC Rainmaker fand unpassend schnelle Pace-Vorgaben und keinen erkennbaren Bezug zu Erholung, Readiness oder Kalender. [Sekundärquelle] (dcrainmaker.com, 13.01.2026)
- **Athlete Intelligence:** nicht geprüft. [nicht verifiziert]

#### 3.3 Anbieter mit Erholungs- oder HRV-Logik

- **Athletica.ai (Laursen, Plews, Zignoli):** Readiness als Ampel aus HRV und Ruhepuls, 7-Tage-HRV-Mittel gegen 60-Tage-Baseline; automatische Lastanpassung im zitierten Beitrag als „in Entwicklung“ beschrieben (Datum des Beitrags unklar, aktueller Stand nicht verifiziert). Calendar Sync ist Einweg-Export der Einheiten in den Kalender. „Workout Reserve“ nicht geprüft. [Herstellerangabe]
- **AI Endurance:** Erholungsmodell aus HRV, Ruhepuls, DFA-alpha1, Last, Morgen-Check-in und Muskelkater; DFA-alpha1 braucht Brustgurt; Apple Watch nur über Dritt-App. [Wettbewerberquelle sensai.fit – am Original gegenprüfen]
- **JOIN (Radsport):** passt nach Verfügbarkeit, RPE und einem Readiness-Check (Muskelkater, Müdigkeit) an; seit 26.08.2026 fließt der Oura-Readiness-Score in „JOIN Readiness“ ein und kann manuell überschrieben werden. Kein externer Kalender, kein Laufen auf den geprüften Seiten. [Herstellerangabe]
- **TrainerRoad (Radsport):** „Red Light Green Light“ markiert gelbe und rote Tage aus der Trainingshistorie und schlägt leichtere Einheit oder Ruhetag vor, die der Nutzer annimmt. TrainerRoad AI (Januar 2026) rechnet nach Zeitplanänderungen neu; Alltagsstress wird nicht erkannt, sondern manuell über einen Regler berücksichtigt; Wearable-Erholungsdaten werden nicht genannt; Kalender ist der TrainerRoad-eigene. [Herstellerangabe / Sekundärquelle]
- **Google Health Coach (Gemini, Rollout Mai 2026, zunächst Fitbit und Pixel Watch):** „Flexible Fitness Plans“ mit Wochenzielen; Tagesvorschlag nach Readiness, Fortschritt und Wetter. Ein Lesen des Google-Kalenders wird auf der Seite nicht genannt. [Herstellerangabe]
- **enduco:** berücksichtigt verfügbare Trainingszeit, tägliches subjektives Befinden und Überlastungsrisiko; HRV und Kalender-Sync auf der geprüften Seite nicht erwähnt. [Herstellerangabe]
- **COROS EvoLab:** Training Status aus 7- und 42-Tage-Last, Recovery Timer mit drei Bereitschaftsstufen; keine automatisch adaptiven Pläne beschrieben. [Herstellerangabe]

#### 3.4 Anbieter mit Verfügbarkeits- oder Kalenderbezug

| Produkt | Liest externen Kalender? | Wie weit geht es? | Quelle / Status |
|---|---|---|---|
| **athletedata.health** | **Ja**, Google Calendar (Zeit, Dauer, Titel; keine Beschreibungen) | Verfügbarkeit, Reisen, Intensität an vollen Tagen; Termindichte als Eingabe für Erholungsplanung | Herstellerangabe; Messmethode der Dichte nicht erklärt; Web-/Chat-Produkt, mobile Plattform unklar |
| **Humango** | Nicht belegt | Tägliche Verfügbarkeit wird eingegeben; Plan rechnet bei verpassten Einheiten, Reisen, Müdigkeit neu | App-Store-Text; Sync mit externem Kalender **nicht verifiziert** |
| **RestOrTrain** (Launch 2026) | Nicht belegt | Chat: Nutzer meldet verpasste Einheit und Restverfügbarkeit, App schlägt Umbau vor; liest HRV, Schlaf, Ruhepuls u. a. aus Apple Health | Sekundärquelle the5krunner, 20.09.2026 |
| **TrainerRoad** | Nein (eigener Kalender) | Zeit-frei-Einträge, Alltagsstress manuell | Herstellerangabe |
| **JOIN** | Nein | Verfügbarkeit pro Tag in der App | Herstellerangabe |
| **Athletica, iFIT** | Nur Export | Einheiten erscheinen im Kalender; Termine werden nicht gelesen | Herstellerangabe |
| **TrainAsONE** | Nicht belegt | Reagiert auf verpasste Läufe, „life changes“, Krankheit, Wetter, Höhenprofil | Herstellerangabe |
| **Campus Coach** | Nicht belegt | Neuberechnung bei Unvorhergesehenem, Auslöser unklar | Herstellerangabe |
| **Runna, Garmin, Strava, Apple, Whoop, Oura** | In geprüften Quellen nicht | Trainingstage bzw. gar kein Plan | siehe oben |

**Befund:** Ein Produkt, das Kalendertermine automatisch liest, daraus Belastung ableitet *und* diese mit einem subjektiven Check-in und Apple-Health-Daten zu einer regelgebundenen Plananpassung für Läufer auf iOS verbindet, wurde in dieser Recherche nicht gefunden. athletedata.health kommt dem am nächsten und muss in jedem Pitch genannt werden. Die Aussage „als Einzige“ ist nicht haltbar.

#### 3.5 Apple-Watch-Readiness-Apps

- **Athlytic:** HRV-basierter Recovery-Score und Belastungswerte aus Apple-Watch-Daten; zählt nur aufgezeichnete Workouts. [Sekundärquelle wareable.com]
- **Training Today:** Readiness aus HRV in Apple Health, über den Tag aktualisiert. [Sekundärquelle]
- **Bevel:** Recovery 1–100 % aus Schlaf-Score, HRV, Ruhepuls, Temperatur, Atemfrequenz, SpO2; ob SDNN oder RMSSD und wie die Baseline entsteht, sagt die Hilfe nicht; keine Plananpassung beschrieben. [Herstellerangabe]
- **Gentler Streak:** „Activity Path“ ordnet den Tag zwischen Ruhe und Aktiv ein, aus HRV-Trend, Ruhepuls, Schlaf und jüngster Workout-Last aus Apple Health; sagt, ob heute ein Trainingstag ist, verschreibt aber keine Einheit. Manueller Schalter „Go Gentler“ für Krankheit, Stress oder volle Wochen. [Sekundärquelle lifestack.ai, selbst Anbieter eines Planungsprodukts]
- **Welltory:** nicht geprüft. [nicht verifiziert]

Alle diese Apps arbeiteten bislang zwangsläufig mit Apples nächtlichen SDNN-Stichproben, während Whoop, Oura, Garmin und Polar RMSSD über definierte Schlaffenster messen (Doherty 2025). Mit Apples eigenem Score auf neuer Hardware geraten sie unter Druck.

#### 3.6 Nicht geprüft

TriDot/RunDot, Suunto Coach (Seite nicht abrufbar), Nike Run Club, adidas Running, Zwift, Mottiv, Vert.run. Für diese Produkte trifft dieser Bericht keine Aussage.

---

### 4. Vergleichstabelle

| Produkt | Eingaben | Ausgabe | Ändert Plan? | Kalender/Alltag? | Subjektive Eingabe? | Offenlegung / Validierung |
|---|---|---|---|---|---|---|
| Whoop | HRV, RHR, Schlaf-Performance, Atemfrequenz, SpO2, Hauttemp. | Recovery 1–99 %, 3 Farben; Strain | Kein Laufplan; KI-Workouts | Nein (Jetlag über Standort) | Journal-Tags, ab 5 Ja/5 Nein | Gewichte geheim; Sensorik teils validiert; Score gegen Outcome schwach (Lundstrom 2023) |
| Oura | RHR, HRV-Balance, Temp., Recovery Index, Schlaf, Aktivität | Readiness 0–100; Resilience; Cumulative Stress | Nein (über JOIN ja) | Nein | Tags | Beiträge benannt, Gewichte geheim; HF/RMSSD validiert; Score gegen sRPE/TQR ohne Zusammenhang (De Bot 2025) |
| Garmin | Schlaf, Erholungszeit, HRV-Status, akute Last, Schlaf-/Stresshistorie | Training Readiness 1–100; Body Battery | Ja (Run Coach, DSW) | Kein Kalender; Stress indirekt | Lifestyle Logging | Faktoren benannt, Gewichte geheim; keine Outcome-Validierung gefunden |
| Polar | HF, HRV, Atmung (erste 4 h), Schlaf-Score | Nightly Recharge, 6 Stufen | Tipps; FitSpark-Kopplung unklar | Nein | Perceived Load (nicht geprüft) | Aufbau beschrieben, Verrechnung nicht |
| Apple | Aktivität/Training Load, Vitals, Schlaf-Score | Readiness 0–10, 4 Stufen (nur Series 12/Ultra 4) | Nein | Nein | Effort Rating 1–10 | Algorithmus geheim; nur Apple-eigene Studien; für Dritt-Apps wohl nicht lesbar |
| HRV4Training | Morgen-HRV, RHR, Befinden, Tags | Normalbereich, Tagesempfehlung | Nein | Tags (Reise u. a.) | Ja, zentral | Methode weitgehend offen; Messung validiert |
| Runna | Lauf-Performance, manuelle Angaben, Wetter | Plan, Pace-Ziele | Ja (Pace, „Not Feeling 100%“, Hitze) | Nur Trainingstage | Manuell (unwohl, wenig Zeit) | Algorithmus nicht offengelegt; Loughborough-Review angekündigt |
| Strava Instant Workouts | Aktivitätshistorie | Wöchentliche Vorschläge | Kein Plan | Nein | Nein | Nicht offengelegt; Kritik an Qualität |
| Athletica | HRV, RHR, Last | Ampel; Plan | Teilweise (Stand unklar) | Nur Export | Kommentare (nicht geprüft) | Eigene Publikationen der Gründer |
| JOIN (Rad) | Workouts, RPE, Readiness-Check, Oura | Tagesplan | Ja | Verfügbarkeit in der App | Ja | Herstellerangabe |
| TrainerRoad (Rad) | Leistung, HF, RPE, Zeitplan | Rot/Gelb/Grün; Plan | Ja, nach Bestätigung | Eigener Kalender; Stress manuell | Umfragen/RPE | Herstellerangabe |
| athletedata.health | Wearables (u. a. Whoop, Garmin, Apple Health), Google-Kalender | Chat-Coach, Plananpassungen | Ja | **Ja, liest Termine** | Chat | Herstellerangabe, keine Validierung gefunden |
| Humango | Workouts, HF, Schlaf, Verfügbarkeit | Plan | Ja | Verfügbarkeit; ext. Kalender unbelegt | Feedback | Herstellerangabe |
| Google Health Coach | Readiness, Schlaf, Fitness, Wetter | Wochenziele, Tagesvorschlag | Ja (flexibel) | Kalender nicht genannt | Chat | Herstellerangabe |

---

### 5. Kritik und Evidenz

- **Doherty, Baldwin, Lambe, Burke & Altini (2025),** *Translational Exercise Biomedicine* 2(2):128–144, DOI 10.1515/teb-2025-0001. Untersucht wurden 14 Scores von 10 Herstellern (Coros, Fitbit/Google, Garmin, Oura, Polar, Samsung, Suunto, Ultrahuman, Whoop, Withings). HRV und Herzfrequenz gehen in je 86 % ein, Ruhepuls in 79 %, Aktivität und Schlafmenge in je 71 %. **Kein Hersteller nennt Formel oder Gewichte.** Validierungsmaterial ist meist theoretisch oder betrifft Einzelkomponenten. HRV-Messfenster unterscheiden sich stark (Garmin: 5-Minuten-Fenster über den Schlaf; Polar: 4 Stunden nach dem Einschlafen; Whoop: letzter Tiefschlaf). Empfehlung: Standardisierung, Transparenz, Prüfung an unterschiedlichen Populationen. [belegt, narrative Übersichtsarbeit; Altini ist HRV4Training-Mitgründer und Oura-Berater]
- **Dohertys Begleitartikel** (UCD/The Conversation, April 2025) benennt zusätzlich Doppelzählung (schlechter Schlaf und der daraus folgende HRV-Abfall werden getrennt bestraft), das Abstrafen bereits verkrafteter Belastung und unterschiedliche Baseline-Fenster. Rat: Score als Orientierung, nicht als Entscheider. [Sekundärquelle des Autors]
- **Altini, „Measurements vs made up scores“ (22.11.2023):** Scores mischen Verhalten mit Physiologie und unterstellen, wie man auf Verhalten reagieren *sollte*; Risiko einer selbsterfüllenden Prophezeiung. Empfehlung: Ruhepuls, HRV und Temperatur direkt ansehen. [Expertenmeinung mit Eigeninteresse]
- **Baron et al. (2017),** *J Clin Sleep Med* 13(2):351, DOI 10.5664/jcsm.6472: Fallserie, prägt „Orthosomnie“ – Patienten, die Tracker-Zielwerten nachjagen, mehr Zeit im Bett verbringen und dem Gerät mehr trauen als der Polysomnographie. [belegt, Fallserie mit 3 Fällen, keine Prävalenzaussage]
- **Nocebo durch falsches Feedback (Gavriloff et al. 2018, J Sleep Res):** Quelle war nicht abrufbar. [nicht verifiziert]
- **GSSI Sports Science Exchange #251 (James et al., Mai 2024):** fordert unabhängige Belege für Marketingaussagen und Qualitätszertifizierung; Handgelenk-HF lag im Feldbeispiel deutlich über dem Brustgurt. Composite Scores werden dort nicht behandelt. [belegt, Expertenübersicht]
- **ACSM/BASES:** Eine Stellungnahme speziell zu Readiness-Scores wurde nicht gefunden. [nicht gefunden]
- **Trainerkritik:** Eine England-Athletics-Trainerin hält gegenüber TechRadar (28.02.2026) fest, dass KI- und Standardpläne Müdigkeit, Stress, Ernährung und Schlaf nicht abbilden. [Stimmungsbild/Einzelmeinung]
- **Nutzerforen:** In dieser Recherche nicht systematisch ausgewertet.

**Gesamturteil:** Die Sensorik für nächtliche HF und RMSSD ist bei Ring und Brustgurt gut belegt, die Schlafstadien mittelmäßig (50–65 % in Miller 2022). Für die *zusammengesetzten Scores* fehlt der Nachweis, dass sie Leistung oder empfundene Erholung besser abbilden als die Rohsignale; die wenigen Studien sind klein und fallen negativ aus.

---

### 6. Synthese: Lücke und Differenzierung

#### 6.1 Differenzierungsaussagen, die einer Jury standhalten

1. **„MyRace erklärt jede Planänderung mit ihrer Regel und ihren Eingaben.“** Beleg der Lücke: Keiner der 10 Hersteller in Doherty 2025 legt Formel oder Gewichte offen; Runna hat seinen Algorithmus nicht veröffentlicht. Voraussetzung: MyRace muss die Regeln tatsächlich offenlegen und darf keine neue Einzahl-Blackbox bauen.
2. **„MyRace plant mit dem Kalender, bevor der Körper die Belastung zeigt.“** Wearable-Scores sind rückblickend (letzte Nacht, letzte Tage). Runna, Garmin, Strava, Apple und Whoop lesen nach den geprüften Quellen keine Termine. Ehrliche Einschränkung: athletedata.health tut es bereits mit Google Calendar; MyRace kann sich hier über Lauf-Fokus, iOS-native Umsetzung und regelgebundene Anpassung abgrenzen, nicht über Exklusivität.
3. **„Bei MyRace hat das eigene Befinden ein festes Gewicht und kann den Sensor überstimmen.“** Bei Whoop, Oura, Garmin und Apple ist subjektive Eingabe Tagebuch oder nachträgliche Korrektur, nicht Teil des Scores. JOIN und enduco fragen das Befinden ab, HRV4Training ebenfalls – HRV4Training erstellt aber keinen Plan, JOIN ist Radsport. Stütze: In De Bot 2025 lief Ouras Score an der subjektiven Erholung vorbei.
4. **„MyRace braucht keine neue Hardware und kein zweites Abo.“** Apples Readiness läuft nur auf Series 12 und Ultra 4; Whoop und Oura setzen eigenes Gerät plus Mitgliedschaft voraus. MyRace arbeitet mit dem, was HealthKit von jeder unterstützten Watch liefert, und ohne Watch mit Kalender und Check-in.
5. **„MyRace verändert den Plan nur innerhalb fester Trainingsregeln und erst nach Bestätigung.“** Die Verletzungsdebatte um Runna (WSJ, Februar 2026) zeigt das Risiko undurchsichtiger Progression. Garmin und JOIN ändern automatisch; TrainerRoad lässt bestätigen. Das ist ein Vertrauensargument, kein Wirksamkeitsbeleg.

#### 6.2 Wo Wettbewerber klar besser sind

- **Sensorik:** Whoop, Oura, Garmin und Polar messen RMSSD über definierte Schlaffenster, teils mit Temperatur und SpO2. MyRace bekommt über HealthKit bisher SDNN-Stichproben; die neue 5-Minuten-HRV der Series 12 und ein möglicher RMSSD-Typ in iOS 27 sind für Dritt-Apps nicht gesichert.
- **Datenbasis:** Apple entwickelt mit der Heart and Movement Study, TrainAsONE wirbt mit über 100 Millionen Kilometern, Runna hat Stravas Daten im Rücken. Ein Solo-Entwickler hat keine vergleichbare Grundlage zum Kalibrieren.
- **Validierung:** Auch wenn die Scores selbst kaum validiert sind, ist die Messgenauigkeit der Geräte publiziert. MyRace hat keine eigene Studie. Ein Kalender-Belastungsmaß ist ebenfalls unvalidiert; athletedata.health erklärt seine „Termindichte“ nicht, und eine Studie, die Kalenderdaten mit Erholung verknüpft, wurde in diesem Strang nicht gesucht.
- **Plattformvorteil Apple:** Der Readiness-Score sitzt auf dem Zifferblatt und in der Health-App. MyRace sollte ihn nicht nachbauen, sondern sich darauf konzentrieren, was Apple nicht macht: Kalender, Laufplan, Regelwerk.
- **Ökosystem:** Garmin koppelt Score, Plan und Uhr in einem Gerät; Workouts landen automatisch am Handgelenk.

#### 6.3 Folgerungen für das Readiness-System

- Keine einzelne Zahl ohne Aufschlüsselung; Rohsignale und Abweichung vom persönlichen Normalbereich zeigen (Altini, Doherty).
- Doppelzählung vermeiden: Schlaf und HRV nicht unabhängig bestrafen, gestrige Belastung nicht automatisch als Malus werten.
- Score-Angst mitdenken (Baron 2017): Formulierungen als Vorschlag, Nutzer entscheidet.
- Aussagen wie „wissenschaftlich validiert“ vermeiden, solange keine eigene Prüfung existiert.

---

### 7. Was offen blieb

- Whoop: genaue Gewichtung, Sleep Coach, Stress Monitor, Healthspan im Detail; Bellenger 2021 nur indirekt.
- Oura: Symptom Radar, Tags, Kinnunen 2020.
- Apple: Lesbarkeit von Readiness, Training Load, RMSSD und Handgelenkstemperatur für Dritt-Apps nur über Sekundärquellen bzw. gar nicht geprüft – vor Architekturentscheidungen an developer.apple.com verifizieren.
- Runna: interne Nutzung von Wearable-Erholungsdaten nicht ausschließbar.
- Humango: Sync mit externem Kalender unbelegt.
- Garmin: Body Battery, HRV Status, Training Status und Firstbeat-Whitepaper nicht an der Primärquelle geprüft.
- Nicht geprüft: Elite HRV, Kubios, intervals.icu, Runalyze, Stryd, TriDot/RunDot, Suunto, Nike Run Club, adidas Running, Zwift, Mottiv, Vert.run, Welltory, Strava Athlete Intelligence, Lifestack (möglicher Kalender-plus-Energie-Planer).
- Nicht abrufbar: PubMed/PMC-Seiten (Browserprüfung), Gavriloff 2018, Suunto-Newsseite, eine Whoop-Journal-Seite, die 2025er Validierungsstudie zu nächtlicher HF/HRV (PMC12367097).

---

### 8. Quellen

**Studien und Fachliteratur**
- Doherty C. et al. (2025). Readiness, recovery, and strain. *Transl Exerc Biomed* 2(2):128–144. https://www.degruyterbrill.com/document/doi/10.1515/teb-2025-0001/html
- Doherty C. (2025). Begleitartikel. https://www.ucd.ie/newsandopinion/news/2025/april/11/opinion-howtrustworthyisyourfitnesstrackerscore und https://theprint.in/health/your-fitness-watch-score-isnt-a-diagnosis-dont-let-it-dictate-your-decisions/2588461
- Miller D. J. et al. (2022). A Validation of Six Wearable Devices. *Sensors* 22:6317. https://pubmed.ncbi.nlm.nih.gov/36016077/
- Cao R. et al. (2022). *J Med Internet Res* 24(1):e27487. https://www.jmir.org/2022/1/e27487/
- De Bot I., Gielen J., Aerts J.-M. (2025). icSPORTS 2025, S. 208–216. https://www.scitepress.org/publishedPapers/2025/137331/pdf/index.html
- Lundstrom E. A. et al. (2023), gelesen über https://trainright.com/new-study-reveals-holes-in-wearable-device-scores/
- Baron K. G. et al. (2017). *J Clin Sleep Med* 13(2):351, gelesen über https://www.sciencedaily.com/releases/2017/02/170228185322.htm
- James C. et al. (2024). GSSI SSE #251. https://www.gssiweb.org/en/sports-science-exchange/article/the-integration-of-multi-sensor-wearables-in-elite-sport
- Whoop-Review (medRxiv 2024, Details unvollständig). https://www.medrxiv.org/content/10.1101/2024.01.04.24300784v1.full.pdf
- Altini M. (2023). https://marcoaltini.substack.com/p/measurements-vs-made-up-scores ; (2025) https://marcoaltini.substack.com/p/paper-readiness-recovery-and-strain

**Hersteller**
- Whoop: https://whoop.com/thelocker/how-does-whoop-recovery-work-101 ; https://www.whoop.com/ae/en/thelocker/2026-whats-new/ ; https://www.whoop.com/thelocker/monthly-performance-assessment
- Oura: https://ouraring.com/blog/readiness-score-to-optimize-workouts/ ; https://ouraring.com/blog/building-resilience-recover-from-stress/ ; https://support.ouraring.com/hc/en-us/articles/45979919957395 ; https://ouraring.com/blog/how-oura-measures-sleep-and-validates-accuracy/
- Garmin: https://www8.garmin.com/manuals/webhelp/GUID-31D23DBB-57C2-4DF7-A0C9-8D1A00AB4BE7/EN-US/GUID-C21BE0C8-A08E-4DA1-B6C6-2E0E2DDDB372.html ; https://www8.garmin.com/manuals/webhelp/GUID-0221611A-992D-495E-8DED-1DD448F7A066/EN-US/GUID-71798B16-A9A9-4D0F-BF64-50DD65AFC0D5.html
- Polar: https://support.polar.com/e_manuals/unite/polar-unite-user-manual-english/nightly-recharge.htm ; https://www.polar.com/blog/nightly-recharge-vs-recovery-pro/
- TrainingPeaks: https://help.trainingpeaks.com/hc/en-us/articles/115001271712-Glossary
- Gentler Streak (über Lifestack): https://lifestack.ai/blog/gentler-streak
- Apple: https://apple.com/newsroom/2026/09/apple-advances-health-and-fitness-capabilities-using-apple-intelligence/ ; https://developer.apple.com/forums/thread/772319
- HRV4Training: https://hrv4training.com/faq.html
- Runna: https://www.runna.com/press/runna-announces-new-updates ; https://intercom.help/runna/en/articles/12809806-feeling-unwell-how-to-adapt-your-training-plan
- Athletica: https://athletica.ai/a-sneak-peek-how-our-ai-works-behind-the-scenes/ ; https://news.athletica.ai/posts/navigating-success-introducing-athletica-s-calendar-sync-feature-for-optimal-training
- JOIN: https://join.cc/why-join ; https://join.cc/cycling-tips/your-oura-readiness-score-now-shapes-your-join-training
- TrainerRoad: https://www.trainerroad.com/blog/introducing-trainerroad-ai/
- TrainAsONE: https://taow.trainasone.com/ufaq/how-is-trainasone-different-to-the-other-adaptive-training-programs-on-the-market/
- Humango: https://apps.apple.com/app/id1554430755 ; https://humanpoweredhealthcycling.com/news/the-ai-edge-what-makes-humango-unique/
- athletedata.health: https://www.athletedata.health/integrations/google-calendar ; https://www.athletedata.health/compare/vs-humango
- enduco: https://knowledge.enduco.app/en/articles/11784764-training-planning
- Campus Coach: https://www.campus.coach/en/running-app-campus
- COROS: https://support.coros.com/hc/en-us/articles/4410520934676-EvoLab
- Bevel: https://help.bevel.health/en/articles/11258177
- Google: https://store.google.com/us/magazine/google-health-coach?hl=en-US
- iFIT: https://www.ifit.com/blog/ai-coach-update-calendar-integration-release-notes

**Fachpresse**
- https://the5krunner.com/2026/09/28/is-runna-ai/ ; https://the5krunner.com/runna/ ; https://the5krunner.com/2025/09/20/garmin-health-status-everything-you-need-to-know/ ; https://the5krunner.com/2026/09/20/restortrain-ai-training-app/
- https://www.techradar.com/health-fitness/are-ai-training-apps-like-runna-putting-you-at-risk-of-injury-i-asked-a-real-life-running-coach
- https://techradar.com/health-fitness/garmins-run-coach-just-got-a-lot-smarter-heres-how-to-try-it-before-everyone-else
- https://techradar.com/health-fitness/smartwatches/finally-readiness-score-comes-to-apple-watch-apple-explains-how-it-works-and-why-now-was-the-right-time-to-launch-it
- https://9to5mac.com/2026/09/15/apple-watch-adds-an-all-new-readiness-app-heres-how-it-works/
- https://www.macrumors.com/2025/09/15/apple-releases-watchos-26
- https://dcrainmaker.com/2024/07/apples-training-load-vitals-watchos11.html ; https://www.dcrainmaker.com/2026/01/stravas-instant-workouts-actually.html
- https://www.themomentum.ai/blog/apple-watch-series-12-ios-27-rmssd-healthkit
- https://endurance.biz/2024/industry-news/trainerroad-takes-red-light-green-light-approach-to-fatigue-management/
- https://www.wareable.com/apple/turn-your-apple-watch-into-whoop
- https://www.sensai.fit/blog/ai-endurance-review-2026 (Wettbewerberquelle)

---

# Teil C – Was wir übernehmen, was nicht, warum

| # | Befund oder Konzept | Übernehmen? | Wie in der Spec | Warum |
|---|---|---|---|---|
| 1 | Marker gegen persönliche Baseline (28 Tage, Median, robuste Streuung) | **ja** | §4 | Konsens der Monitoring-Literatur; 28 Tage deckt einen Zyklus ab |
| 2 | Totband ±0,5 SD (kleinste relevante Änderung) | **ja**, bei Apple-SDNN ±1 SD | §4.3 | Konvention der HRV-Studien; größeres Band wegen Messrauschen (Heuristik) |
| 3 | Ln-Transformation, 7-Tage-Mittel, mind. 4 Werte für HRV | **ja** | §4.3 | Plews 2014, Vesterinen 2016 |
| 4 | Nacht-Median statt Tagesmittel der SDNN-Werte | **ja** | §4.3 | Tageszeit- und Schlafphaseneffekt; heutiges Tagesmittel ist methodisch falsch |
| 5 | HRV über dem Band als „super erholt“ werten | **nein** | §4.3 | Le Meur 2013 |
| 6 | HRV als alleiniger Auslöser einer Planänderung | **nein** | §8, R7 | Meta-Analysen ohne Vorteil; Apple-Messfehler |
| 7 | rMSSD aus Heartbeat-Serien / Series-12-Nachtwerten | **später**, nach Geräteprüfung | Plan Schritt 18 | fachlich besser, technisch ungeklärt |
| 8 | Schlaf-Herzfrequenz bzw. Ruhepuls gleichwertig zu HRV | **ja** | §4.3 | Messfehler 6 % vs. 29 % (O'Grady 2024) |
| 9 | Schlafphasen (REM/Tief) im Score | **nein** | §4.4, §14 | unzuverlässig; fließen heute ein → raus |
| 10 | Schlafdefizit einseitig, drei Nächte zählen mehr als eine | **ja** | §4.4 | Craven 2022, Roberts 2019 |
| 11 | Schlafregelmäßigkeit im Score | **nein**, nur spätere Einsicht | §11 | keine Evidenz für Leistung/Erholung |
| 12 | Atemfrequenz und Temperatur im Score | **nein**, nur im Sicherheitshinweis | §9 | sehr stabil, aussagekräftig nur für Abweichungen; Temperatur zyklusabhängig |
| 13 | Session-RPE 0–10 × Minuten als Lastmaß | **ja** | §5, §6.2 | Foster 2001; ohne Uhr möglich |
| 14 | „Gefühl 1–5“ als RPE | **nein**, bleibt als Befinden | §6.2 | misst Affekt, nicht Anstrengung |
| 15 | Fallback-Last aus Minuten × Zonengewicht | **ja**, als Heuristik gekennzeichnet | §5 | kein validiertes Set; wird durch eigene RPE-Mediane ersetzt |
| 16 | CTL/ATL (42/7 Tage) | **ja**, nur als „Belastungsbilanz“ in der Erwartung | §5 | nützliche Heuristik, kein Readiness-Marker |
| 17 | ACWR-Schwellen 0,8–1,3 | **nein** | – | nicht belegt, bei Läufern invers |
| 18 | Monotonie/Strain-Schwellen | **nein** | – | Schwellen nicht verifiziert |
| 19 | Einzellauf-Spitze > 110 % des längsten Laufs (30 Tage) | **ja**, als Schutzregel für Vorschläge | §8.6, R10 | Frandsen 2025; deckt sich mit Plan-Kern |
| 20 | Erholungsfenster 24/48 h nach Einheitentyp | **ja**, über die Plan-Invarianten (I6) | §8 | Stanley 2013; bereits im Kern |
| 21 | Vier Morgen-Items (Schlaf, Energie, Beine, Kopf), 5 Stufen | **ja** | §6.1 | Saw 2016, Ryan 2019, Hamlin 2019; als Set nicht validiert → Review-Punkt |
| 22 | „Bereitschaft fürs Training“ als Pflichtfrage | **nein** | §6.1 | strategisch verzerrbar, sobald es die Einheit steuert |
| 23 | KEB/AEB-Wortlaut | **nein** | §6.1 | geschütztes Verfahren; eigene Formulierungen |
| 24 | Streaks | **nein** | §6.4 | Silverman & Barasch 2023; belohnt Ausfüllen statt Ehrlichkeit |
| 25 | Ampel als einzige Ausgabe | **nein** | §10 | Kölling & Kellmann 2020; Schwellen willkürlich |
| 26 | Gesundheits-Chips nach dem Gatekeeper-Prinzip (OSTRC) | **ja** | §6.1, §9 | Clarsen 2020 |
| 27 | Schmerzgrenze als feste Zahl | **vorsichtig**: 4/10 oder verändertes Laufbild, als Vorsichtsregel | §9 | Klinikermeinung; Silbernagel erlaubt bis 5/10 bei Sehnen |
| 28 | Stress-Punkte je Termin | **nein** | §7 | keine Evidenz |
| 29 | Schlafgelegenheit, Ruhezeit < 11 h, gebundene Stunden aus Terminen (spätes Ende geht in der Schlafgelegenheit auf) | **ja** | §7.2 | Vedaa 2015, Virtanen 2009; Schwellen Heuristik |
| 30 | Etikettierte Stressoren (Prüfung, körperliche Schicht, Reise) | **ja**, nur nach Nutzer-Label | §7.3 | Mann 2016 als Hintergrund; Wirkung Heuristik |
| 31 | Titel-Cluster über Normalisierung + Trigramme, Label je Cluster | **ja** | §7.3 | löst „Sprint Prüfung“-Fall ohne KI |
| 32 | KI-Einordnung von Termintiteln | **später, optional, nur mit Einwilligung** | Plan Schritt 18 | Kern muss ohne KI laufen |
| 33 | Persönliche Einsichten ab 10/10 Tagen, Bootstrap, Benjamini-Hochberg, Schrumpfung | **ja** | §11 | N-of-1-Methodik; Whoop nutzt 5/5 – statistisch zu wenig |
| 34 | Additives Modell auf z-Werten, gleiche Blockgewichte | **ja** | §4 | Dawes 1979; keine validierte Formel existiert |
| 35 | Lokales Niveau-Modell mit expliziter Varianz | **ja**, ersetzt „Kalman-light“ | §4.6 | gleiche Idee, aber Unsicherheit wird ehrlich mitgeführt |
| 36 | Individuelle Sensitivitäten (β je Person) | **später**, ab 90 Tagen, geschrumpft | §11 | Overfitting-Risiko (Rothschild 2024) |
| 37 | Bevölkerungs-Priors für Mittelwerte | **nein**, nur Plausibilitätsgrenzen | §3, §4.2 | zwischen Personen viel mehr Streuung als innerhalb |
| 38 | Eigenes ML-Modell auf offenen Datensätzen | **nein** | – | keine Zielgröße, keine passenden Daten |
| 39 | Offene Datensätze (PMData, LifeSnaps) für Trockenlauf | **ja**, in der Validierung | §13 | Plausibilität, Regressionstests |
| 40 | Stufe + Band + Datenbasis statt nackter Zahl | **ja** | §10 | van der Bles 2020; Orthosomnie (Baron 2017) |
| 41 | Krankheitsregel: zwei Nächte, mehrere Signale, dann fragen | **ja** | §9 | Alavi 2022, Quer 2021; nicht validiert → Review-Punkt |
| 42 | „Neck Check“ | **nur als Erfahrungsregel gekennzeichnet** | §9 | IOC 2022: nicht validiert |
| 43 | Entscheidungen zur Last höchstens zweimal pro Woche | **ja** (Wochenvorschläge höchstens zweimal je Woche, R25) | §8.4 | Nuuttila 2022 |
| 44 | Last erhöhen bei guten Werten | **nein** im MVP | §8.1, R3 | kein Beleg für Nutzen in diesem Aufbau; Risiko |
| 45 | Automatische Planänderung ohne Bestätigung | **nein** | §8.8 | unvalidiertes Maß; Vertrauensargument |
| 46 | Apples Readiness-Score nachbauen oder einlesen | **nein** | – | nur Series 12/Ultra 4, für Dritt-Apps vermutlich nicht lesbar; MyRace macht, was Apple nicht macht |
| 47 | Claim „als einzige App liest MyRace den Kalender“ | **nein** | Kurzfassung | athletedata.health liest Google-Kalender; Abgrenzung über Lauf-Fokus, Regelbindung, Erklärung |
| 48 | Claim „wissenschaftlich validiert“ | **nein** | §13 | erst nach eigener Auswertung |

## Offene Recherchepunkte (vor Spoho-Review nachziehen)

1. Am Original prüfen: alle Zahlen mit Vermerk „nicht verifiziert“ in den Strängen, insbesondere Milewski 2014, Ivarsson 2017, Roberts 2019, Bias-Richtung bei O'Grady 2024, Daniels' Punktwerte.
2. An der Apple-Entwicklerdoku und am Gerät klären: Lesbarkeit von Heartbeat-Serien, Series-12-Nacht-HRV (rMSSD), `appleSleepingWristTemperature`, `workoutEffortScore`, Schlaf-Herzfrequenz über das Plugin `@capgo/capacitor-health`.
3. Deutsche Anker für die Anstrengungsskala 0–10: keine validierte Fassung gefunden; Spoho fragen.
4. Wettbewerb: nicht geprüfte Produkte aus Teil B7, Abschnitt 3.6, vor einem Pitch nachrecherchieren; athletedata.health selbst ausprobieren.
