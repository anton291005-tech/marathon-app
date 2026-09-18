# MyRace – Roadmap (lebendes Dokument)

> Dieses Dokument ist die Quelle der Wahrheit für Claude Code. Vor jeder Arbeitssitzung zu Phase 2 wird es gelesen — nicht per Copy-Paste-Prompt neu erklärt.

## Vision (kurz)
"Runna gibt dir einen Plan. MyRace gibt dir einen Coach." Kern-USP: kalender-/lebensplanungs-bewusste Trainingsplanung — die App baut Trainingswochen strategisch um reale Kalenderverpflichtungen (Job, Uni, Ehrenamt, Sport) statt nur um physiologische Signale.

## Aktuelle Phase: Phase 2 – Kalender-/Lebensintegration

## Abgeschlossen (Phase 1, Referenz)
- Strava-Integration Backend komplett: Migration `008_strava_connections.sql` (RLS aktiv), `stravaService.js`, `auth.js`/`callback.js`, `@capacitor/browser`-Trigger in Settings. On-Device-OAuth-Test auf iPhone 13 steht noch aus (aktuell kein Kabel verfügbar).
- AI Coach läuft auf Claude Sonnet 4.6 via `coachHandlers.js` (`callClaudeApi`) — bestätigt einziger aktiver Pfad. OpenAI gpt-4o-mini nur für `/api/ai/daily-coach` und `/api/onboarding/preferences-patches`.
- Prompt Caching + Context Trimming deployed (next14Days/last7Days/planSummary, logsLast10Days/healthRunsLast10Days).

## Nächste Schritte (Reihenfolge als Leitplanke, nicht als starres Skript)

### 1. `weekly_schedule_blocks` — Datenmodell + Migration
**Akzeptanzkriterium:** Tabelle in Supabase mit aktiver RLS, Migration idempotent anwendbar, lokale Tests grün, Schema deckt wiederkehrende und einmalige Termine ab.

### 2. Capacity Scoring pro Tag
**Akzeptanzkriterium:** Score-Funktion deterministisch und dokumentiert, Unit-Tests für Randfälle (voll ausgebuchter Tag, komplett freier Tag, Teilverfügbarkeit, Wochenend-Sonderfall).

### 2b. Belastungsbewusste Konflikterkennung (Erweiterung von Schritt 2, Hebel 4 „Titel-basiert") — umgesetzt (2026-09-18)
**Anlass:** Ein Kalendertermin „Fußballturnier" (category `other`, So 11–19 Uhr) wurde nicht als Konflikt für einen Long Run 18 km MP erkannt, weil das Capacity-Scoring nur den belegten Zeitanteil bewertet (8 h von 16 h = 50 % ≥ `MIN_FIT_SCORE_THRESHOLD` 0,35).
**Akzeptanzkriterium:**
- Ein Block gilt als „körperliche Belastung", wenn ein Wort seines Titels (case-insensitive) einem Stichwort aus `PHYSICAL_LOAD_TITLE_KEYWORDS` (`src/scheduling/capacityScore.ts`, exportiert, leicht erweiterbar) entspricht; Kompositum-Treffer (Stichwort am Wortanfang/-ende, z. B. „Fußballturnier", „Hallenfußball") nur für Stichwörter ab 6 Zeichen. Zu generische Wörter („Spiel", „Training") sind bewusst nicht enthalten; auch „Turnier" allein ist bewusst kein Stichwort (Schachturnier ≠ körperliche Belastung) — Sportturniere werden über die Sportart erkannt (z. B. „Fußballturnier" über „Fußball"), unbekannte Sportarten müssen in die Liste. Die Kategorie (`other`) bleibt weiterhin rein informativ (siehe Schritt 5).
- Hat ein Tag mindestens einen solchen Block (Überlappung mit dem Tagesfenster), liegt `computeSessionDayFitScore` für die bereits als hohe Intensität behandelten Typen (`tempo`/`interval`/`race`/`long`) unter `MIN_FIT_SCORE_THRESHOLD` (Deckel `PHYSICAL_LOAD_DAY_FIT_SCORE` = 0,2) → Konflikt. Leichte Sessions (`easy`/`strength`/`bike`/`rest`) und der Anteil-Check bleiben unverändert.
- Der Titel wird über `DayCapacityScore.physicalLoadBlockTitles` durchgereicht; dadurch nutzen Wochen-Scan, 📅-Button, Wochenbatch und Kandidaten-Ranking (inkl. Gegenseite des Swaps) ohne Signaturänderung dieselbe Regel. Der Konfliktgrund des Scans nennt den Termin.
- Tests: Scan, Batch-Vorschlag (anderer Tag), Neutraltitel („Schicht"/„Arbeit") unverändert, Easy Run am selben Tag kein Konflikt, Belastungstag nie Zieltag für harte Sessions.
**Bekannte Grenzen (Backlog, kein Blocker):** rein titelbasiert (keine Dauer-/Uhrzeitprüfung, kein Abgleich „freie Lücke vs. Laufdauer"); wiederkehrende Sport-Termine (z. B. wöchentliches „Fußballtraining") markieren jede Woche den Tag als Belastungstag; die Kategorie fließt weiterhin nicht ins Scoring ein; vorbestehend (nicht durch 2b verursacht, aber jetzt öfter erreichbar): `scoreAndRankCandidates` sortiert erst nach Micro-Structure-Severity, dann nach Fit — ein Belastungs-/überbuchter Tag mit niedrigerer Severity kann Platz 1 belegen und den 📅-Einzel-Auto-Pick per `no-good-fit-candidate` blockieren (der Wochenbatch nutzt das erste `!isConflict` und ist nicht betroffen).

### 3. Session Assignment Engine — abgeschlossen (`src/ai/mutations/assignSessionToBestCapacityDay.ts`)
**Akzeptanzkriterium:** Kann eine bestehende Trainingswoche unter neuen Kalender-Constraints umverteilen, ohne die Trainingsplan-Regeln zu brechen (siehe Harte Regel unten). Tests grün. — **Erweiterung um bilateralen Fit-Score (siehe unten) ebenfalls abgehakt: Tests grün, End-to-End verdrahtet.**

**Erweiterung: bilateraler Fit-Score (Quell- + Zieltag), abgeschlossen:**
- `computeSessionDayFitScore` (`src/scheduling/capacityScore.ts`): gewichtet High-Intensity-Sessions (`tempo`/`interval`/`race`/`long`) voll gegen den Day-Capacity-Score, Easy/Recovery-Sessions nur mit Faktor 0.1 — ein überlasteter Tag ist für eine easy Session fast so gut wie ein freier, für einen Tempodauerlauf nicht.
- `sourceDayCapacity`-Parameter (`assignSessionToBestCapacityDay.ts`): berechnet zusätzlich zum Zieltag auch die Capacity-Situation des Ursprungstags der geklickten Session, über die neue `computeSourceDayCapacity()`-Helper-Funktion in `buildCalendarReassignmentAction.ts`. Beide Seiten eines Swaps werden per `Math.min` kombiniert (`combinedFit`), damit ein guter Fit für die geklickte Session keinen schlechten Fit für die verdrängte Session verdeckt.
- `MIN_FIT_SCORE_THRESHOLD` (0.35, `assignSessionToBestCapacityDay.ts`): Hard-Reject, wenn `combinedFit` des besten Kandidaten unter dem Threshold liegt — kein Vorschlag statt eines schlechten. Verhindert z. B., dass ein Klick auf eine easy Session eines überlasteten Tages einen Tempodauerlauf auf diesen Tag verdrängt.
- `"no-good-fit-candidate"`-Reason-Code (`assignSessionToBestCapacityDay.ts`): neuer Reason-Code für den Hard-Reject-Fall oben, auf Datenebene gesetzt und getestet. **Bekannte Lücke (Backlog, kein Blocker):** wird aktuell wie `"no-candidates"`/`"no-valid-candidates"` nur generisch im UI abgefangen (`buildCalendarReassignmentAction` liefert bei jedem `!result.ok` `null`, `AppMain.tsx` zeigt dafür die Fallback-Meldung "Keine sinnvolle Alternative im Kalender gefunden." ohne Reason-spezifischen Text) — vorbestehendes Muster, keine Regression durch diese Erweiterung.

**Klarstellung (Stufe-1-Recherche, swapTrainingDays-Migration):** Frühere Formulierung "erweitert `swapTrainingDays`" war irreführend — Namenskollision zwischen totem `src/lib/ai/tools.ts`-Code (inzwischen entfernt) und dem echten, nutzerinitiierten 2-Tage-Chat-Swap (`AiCoachPanel.tsx` → `AppMain.tsx:handleSwapWorkoutsV2` → `trySwapWorkoutDatesInPlan`/`validateSwap`, `TrainingPlanV2`-Ebene). `assignSessionToBestCapacityDay` erweitert diesen Chat-Swap nicht; es ist die Grundlage für Schritt 4 (systeminitiierte N-Kandidaten-Auswahl bei einem Kalender-Trigger), arbeitet auf `AiPlanWeek`/`PlanPatch` und ist noch nicht an einen Live-Einstiegspunkt angebunden.

### 4. iOS Calendar Import via EventKit + Onboarding-Presets — Code-seitig umgesetzt (2026-08-24), Device-E2E offen
**Entscheidungen (Interview-Protokoll, mit Anton abgestimmt):** Full Access (iOS 17+, technisch alternativlos zum Lesen; beide plist-Keys gesetzt), stille Keyword-Klassifikation (`src/calendar/eventClassifier.ts` — Kategorie bis Schritt 5 rein informativ, Capacity-Score nutzt nur Zeitfenster), Connect-Import + Foreground-Resync (eigener `appStateChange`-Listener in `AppMain.tsx`, 5-min-Debounce, kein Background-Sync), Replace-All pro Sync über `source`-Spalte (Migration 010: `'manual'|'eventkit'|'preset'`; Testdaten-Accounts bleiben als `'manual'` strukturell unantastbar), Occurrence-Expansion in One-Off-Zeilen (Fenster heute+28d, `src/calendar/eventToScheduleBlocks.ts`) statt RRULE-Mapping, Plugin `@ebarooni/capacitor-calendar@8.3.0` (SPM-Build verifiziert, Swift-Fallback nicht nötig), Preset-Fallback (Vollzeit/Teilzeit/Studium/Schicht, `src/calendar/presets.ts`) im neuen skippbaren Onboarding-Schritt 4 für Deny/leer/Web.

**Umgesetzt (Commits `ec6a5e4`…`cdb172b`):** Migration 010 + Service-Types, Bulk-Write (`replaceAllEventkitBlocks`/`insertPresetBlocks`), pure Domain (Classifier/Mapping/Presets), Plugin + Info.plist + Nativ-Wrapper (`calendarImportService.ts`), Sync-Orchestrator (`calendarSyncService.ts`), Onboarding-Schritt 4 (Union 1–5, 7 RTL-Tests), AppMain-Verdrahtung (userId-Prop, Post-Onboarding-Reload, Foreground-Resync). 608/608 Tests grün, Web-Build + Xcode-Simulator-Build grün. Capacity-Engine unverändert.

**Noch offen (manuell, blockiert Abnahme):**
- Migration 010 in Supabase anwenden (SQL-Editor; keine CLI lokal verlinkt) — davor schlägt jeder Import-/Preset-Write mit unbekannter `source`-Spalte fehl.
- E2E auf iPhone 13: Onboarding-Connect (Permission-Dialog mit deutschem Purpose-String) → „N Termine importiert" → 📅-Reassignment; Deny-Pfad → Presets; Event ändern/löschen → Foreground-Resync; Schluss-SQL: Testaccounts `dc86a082`/`c2559684` weiter 100 % `source='manual'`.

**Bekannte v1-Lücken (Backlog, kein Blocker):** abgelehnte Einladungen werden mit-importiert (Self-Attendee-Status über Bridge unzuverlässig); Settings-Connect-Card für Bestandsnutzer (die Onboarding nie wieder sehen) als Folge-Task „Schritt 4b" (Muster `handleAppleHealthConnectInSettings`).

### 5. Load-Tag-Presets-Library + self-calibrating Load-Scoring
Regelbasiert, transparent, kalibriert sich über Post-Workout-Feedback selbst nach.
**Anschluss an Schritt 4:** nutzt die dort eingeführte stille Kategorie-Klassifikation (`job`/`study`/…) als Ausgangsbasis für Load-Tags — erst hier bekommt die Kategorie Engine-Wirkung; ggf. Import-Review-/Nachklassifizierungs-UI hier nachziehen.

### 6. Vorher/Nachher-Diff-Screen — Akzeptanzkriterium final (2026-09-17), UI-Anbindung in Arbeit
**Ziel:** Nach Kalender-Connect (Wow-Moment) im "Woche"-Screen zeigen, wie sich die Trainingswoche durch die Capacity-Engine verändert hat.
**Rechenlogik (fertig):** `scanWeekForCalendarConflicts.ts` (Konflikt-Scan pro Woche), `proposeWeekCalendarReassignments.ts` (Greedy-Vorschlag), `validateWeekReassignmentBatch.ts` (Batch-Validierung) — alle in `src/ai/mutations/`.
**Datei-Anker (UI):** Live-Wochenansicht ist inline in `src/AppMain.tsx` (`activeView==="week"`, ab Zeile ~4470); Diff-Screen dockt an `AiActionCard.tsx` an.
**Akzeptanzkriterium (final, mit Anton abgestimmt am 2026-09-17):**
- Trigger ist on-demand (Button/Banner im Woche-Tab) — kein automatischer Scan beim Tab-Öffnen; "dauerhaft aktiv, erkennt neue Kalendereinträge sofort" ist bewusst nicht Teil dieses Schritts.
- Diff wird im Woche-Screen sichtbar (nicht nur im Chat), zeigt pro verschobener Session alten vs. neuen Tag.
- Warn-Level-Reassignments (Micro-Structure-Status "warn") blockieren das Batch nicht mehr hart, sondern werden mit Warnhinweis angezeigt — Athlet bestätigt aktiv. Nur echte strukturelle Verstöße (Session nicht gefunden, widersprüchliche Zuordnung, Integritätsverletzung) bleiben Hard-Block fürs gesamte Batch.
- Partial Resolution: nicht automatisch lösbare Konflikte werden am Ende des Diff-Screens als Liste ausgewiesen, kein Blocker fürs restliche Batch — Einzelfall-Bearbeitung läuft über den bestehenden 📅-Button pro Session.
- Verletzt keine bestehende Wochenansicht-Struktur (Scroll/Overlap-Pattern aus dem Bearbeiten-Fix vom 15. Sept wiederverwendet, nicht neu gebaut).

### 7. Post-Workout-Feedback-Loop zur Belastungsfaktor-Kalibrierung
**Ziel:** Regelbasierte Load-Scoring-Faktoren kalibrieren sich selbst über Post-Workout-Feedback nach (Bezug zu Schritt 5, das bereits "self-calibrating Load-Scoring" nennt — Schritt 7 ist die Feedback-Seite davon).
**Akzeptanzkriterium:** noch zu präzisieren (Platzhalter — aus Produkt-Roadmap-PDF nachzutragen).

### 8. Erklärbarkeits-UI ("Warum wurde das geändert?")
**Ziel:** Sichtbar machen, warum die Engine eine Session auf einen Tag gelegt hat (Ranking: Micro-Structure-Severity vor Capacity-Score vor Datum), inkl. Warnung bei unvermeidbarem Konflikt.
**Datei-Anker:**
- `assignSessionToBestCapacityDay.ts:21-29` liefert bereits `microStructureSeverity`, `warning`, `chosenTargetSessionId` — Basis für die Erklärbarkeits-UI vorhanden, aber **keine Runner-up-Kandidaten/-Scores** (nur der gewählte Tag) — für eine echte Ranking-Erklärung müsste der Rückgabetyp erweitert werden.
- Einziges bestehendes "Warum"-UI-Pattern (`DetailBlock title="Warum diese Einheit?"`) existiert nur in der toten `App.tsx:2553` (Legacy, nicht im Live-Pfad `AppMain.tsx`) — kein wiederverwendbares Live-Pattern.
- Die Chat-Bestätigungskarte im Live-Pfad ist `AiActionCard.tsx` (nicht `SwapConfirmationCard.tsx`, welches unbenutzter toter Code ist) — generisch, rendert nur Freitext-`items`, kein strukturiertes Alt/Neu- oder Warnungs-Feld. Andockmöglichkeit vorhanden, aber Erweiterung nötig.

## Harte Regel (nicht verhandelbar)
Wissenschaftliche Planqualität ist die Leitplanke. Kalender-Constraints optimieren nur INNERHALB der Trainingsplan-Regeln — sie dürfen diese niemals überschreiben. Bei Konflikt gewinnt immer die Trainingsplan-Regel, nicht der Kalender.

## Bekannte Blocker
- **Onboarding-Bug (Hauptaccount) — diagnostiziert + gefixt:** Ursache: `isUserTrainingPlan` (`src/planV2/isUserTrainingPlan.ts`) verwarf remote geladene Pläne, deren Workout-IDs zufällig dem Legacy-Muster `w##-xx` entsprachen (`isEmbeddedLegacyTrainingPlan`), obwohl sie echte, remote persistierte Nutzerpläne waren — dadurch erschien Onboarding fälschlich erneut trotz existierendem Plan. Fix: drittes optionales Argument `opts?: { trustedSource?: boolean }` überspringt den Legacy-Check nur an den 4 Call-Sites in `src/AppMain.tsx` (Zeilen 1271, 1427, 2908, 2935), die Pläne aus einer bereits durch `user.id` authentifizierten Supabase-Quelle laden (`loadTrainingPlan`) — der Integritäts-Check (`validateTrainingPlanV2Integrity`) bleibt in jedem Fall bestehen. Default-Verhalten (kein `opts` übergeben) unverändert, deckt weiterhin `AppMain.tsx:1092` (initialer `localStorage`-Read) ab.
  - **Restrisiko / Backlog:** `AppMain.tsx:1092` und `migrateLocalDataToSupabase.ts` wurden bewusst NICHT auf `trustedSource: true` umgestellt — beide lesen aus lokalem Storage vor jeder Server-Authentifizierung, wo eine `w##-xx`-ID weiterhin plausibel vom eingebetteten Demo-Plan stammen könnte. Sollte künftig ein echter Nutzerplan mit einer `w##-xx`-artigen ID lokal persistiert werden (z. B. über einen neuen Import-Pfad), würde er an diesen beiden Stellen weiterhin fälschlich als Demo-Plan erkannt. Noch nicht beobachtet, nur als Restrisiko dokumentiert.
- **Strava On-Device-Test:** Backend/Registrierung fertig, OAuth-Flow auf iPhone 13 noch nicht durchgetestet (Safari-Handoff → Login → Deep Link `myrace://strava-connected` → Eintrag in `strava_connections`). Wartet auf verfügbares Lightning-Kabel — kein Blocker für Backend-Arbeit.

## Bekannte Testfehler (behoben)
Stand `CI=true npm test` (2026-08-11): alle 4 vorbestehenden Suiten (11 Einzeltests) wurden diagnostiziert und gefixt, `CI=true npm test` zeigt 85/85 Suiten, 536/536 Tests grün (inkl. 1 neuer Charakterisierungstest). `CI=false npm run build` läuft durch. Die Produkt-Roadmap-PDF nannte "18 vorbestehende Testfehler" — diese Zahl deckte sich nie mit den tatsächlichen 4 Suiten/11 Tests; **Diskrepanz bleibt ungeklärt** (evtl. PDF-Stand vor Fix-Commits, oder "18" zählte zusätzliche, aktuell übersprungene Tests mit).

| Suite | Fix | Commit |
|---|---|---|
| `appleHealthWorkoutSync.test.ts` (2) | `workoutToStored` (`src/healthRuns.ts`) normalisiert `distance`/`duration` → `distanceMeters`/`durationSeconds` und leitet `laps` aus `workoutEvents` (type `"lap"`/`3`) ab. War ein nie gebautes Feature, kein Regressions-Bug. | `c33287f` |
| `recoveryConfidenceLayer.test.ts` (3) + `recoveryPipeline.integration.test.ts` (5) | Zwei unabhängige Bugs, kein gemeinsamer Root Cause: (a) `computeDailyRecoverySeries` setzte `source`/`pointConfidence` nie — `recoverySummary.ts` fiel dadurch in Produktion still immer auf `"physio"` zurück; jetzt beide Werte aus bereits berechneten `coverage`/`overallConfidence` durchgereicht. (b) `computeRecoveryFallback7d` und `computeLoadOnlyHomeRecoveryScore0_100` waren fertig gebaut, aber nie importiert — jetzt in `getRecoveryDomainState` verdrahtet (nur im `hasMinData`-Fallback-Zweig, `hasPhysioData`-Gate bleibt bewusst hart, siehe bestehenden `recoveryDomainState.test.ts`-Fall). | `d2aced6` |
| `aiUncertaintyLanguage.test.ts` (1) | `buildRiskCoachMessage` (`mockBrain.ts`) liest jetzt `recoveryDomain.latent.uncertaintyTier` und hängt bei `"high"` einen Vorsicht-Hinweis an — Wording an `recoverySemanticLayer.ts` `certaintyLabelDe()` angelehnt. War eine Integrationslücke (Wortwahl existierte bereits im Recovery-Dashboard, war aber nie an den Chat-Coach-Pfad angebunden), kein zu strikter Test. Charakterisierungs-Gegenprobe (niedrige Unsicherheit → kein Zusatzsatz) ergänzt. | `cadfe2f` |

Keiner der 11 Fälle war eindeutig trivial (kein veralteter Snapshot-Wert) — alle brauchten echte Diagnose vor dem Fix, wie hier dokumentiert.

**Offener Nachschärfungspunkt (Test-Lücke, kein Bug):** `recoveryPipeline.integration.test.ts` Testfall "valid same-day inputs → numeric score shown consistently…" prüft `homeRecoveryScoreSource` nicht. Empirisch bestätigt: dieser Fixture-Fall (nur 1 Tag Daten) läuft über den `loadOnly`-Fallback (`source="loadOnly"`, nicht `"live"`), weil `hasMinData` bei nur 1 Tag scheitert und `computeRecoveryFallback7d` mangels ≥3 valider Tage ebenfalls `null` liefert. Test sollte um `expect(domain.homeRecoveryScoreSource).toBe("loadOnly")` ergänzt werden, damit explizit abgesichert ist, dass 1-Tag-Daten nie fälschlich als `"live"` markiert werden. Kein aktueller Fix nötig, nur Testschärfung für später.

## Cleanup-Kandidaten
Während der Recherche zu Schritt 6/8 als unbenutzt identifiziert — noch nicht gelöscht, nur dokumentiert, damit es nicht vergessen wird:
- `src/components/ai/SwapConfirmationCard.tsx` — nur vom eigenen Test (`AiCoachPanel.swapConfirm.test.tsx`) referenziert, kein Produktions-Import gefunden. Der echte Live-Pfad läuft über `AiActionCard.tsx`.
- `App.tsx:2553` (`DetailBlock title="Warum diese Einheit?"`) — Legacy-Datei, nicht im Live-Pfad (`AppMain.tsx`); einziges bestehendes "Warum"-UI-Pattern, aber tot. Relevant für Schritt 8, falls das Pattern reaktiviert statt neu gebaut werden soll.

## Out of Scope bis TestFlight
UI/UX-Redesign, Triathlon-Erweiterung, Android, Apple-Watch-Companion — nicht anfassen, auch nicht "nebenbei".

## Datei-Anker (Referenz für Claude Code)
- `assignSessionToBestCapacityDay.ts` (`src/ai/mutations/`) — Session Assignment Engine für Schritt 4, N-Kandidaten-Auswahl; **nicht** dasselbe wie der Chat-Swap (`AiCoachPanel`/`handleSwapWorkoutsV2`/`trySwapWorkoutDatesInPlan`)
- `claudePlanGenerator.js` / `claudePlanService.ts` — Plan-Gen, Option A phasiert (Haiku-Phasenaufrufe + Sonnet für Struktur)
- `coachSystemPrompt.ts` — Coach-Persona/Regeln, darf durch Kalenderlogik nicht verwässert werden

## Wie Claude Code dieses Dokument benutzt
1. **Vor jeder neuen Session zu Phase 2:** Dieses Dokument + betroffenen Code lesen (Plan Mode), selbst herleiten was als Nächstes sinnvoll ist, Plan mit konkretem Akzeptanzkriterium vorschlagen, auf Freigabe warten.
2. **Nach Freigabe:** `/goal` mit dem Akzeptanzkriterium des jeweiligen Schritts setzen, Auto Mode aktivieren, eigenständig arbeiten lassen.
3. **Nach Abschluss:** Subagent-Review gegen dieses Dokument anstoßen (`.claude/agents/plan-reviewer.md`).
4. **Bei Scope-Änderung:** Dieses Dokument aktualisieren, bevor weitergearbeitet wird — nicht nur im Chat erwähnen.
